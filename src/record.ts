import { head, last } from 'ramda';
import config from './config';
import { captureStream, detectPotentialBoundaries, getFileDuration, trim } from './ffmpeg';
import logger from './logger';
import {
  FileType,
  getInProgressPath,
  getTrimmedPath,
  remove,
  renameWithSuffix,
  writeMetadata,
  writeThumbnail
} from './storage';
import { getThumbnail } from './thumbnail';
import { currDate, now } from './utils';

const START_BOUNDARY_SEARCH_DURATION = 45_000;
const END_BOUNDARY_SEARCH_DURATION = 180_000;
const START_BOUNDARY_SEARCH_BUFFER_DURATION = 10_000;
const END_BOUNDARY_SEARCH_BUFFER_DURATION = 30_000;
const MINIMUM_PROGRAMME_DURATION = 30_000;
const INTERSTITIAL_DURATION_DIVISOR = 30_000;
const INTERSTITIAL_DURATION_TOLERANCE = 1_000;

const getTargetDuration = ({ endDate }: Programme): number =>
  endDate.getTime() - now() + config.safetyBuffer;

interface TrimParameters {
  start?: number;
  end?: number;
}

export const findTrimParameters = async (
  path: string,
  duration: number
): Promise<TrimParameters> => {
  const startSearchTime = Math.max(config.safetyBuffer - START_BOUNDARY_SEARCH_BUFFER_DURATION, 0);
  logger.info(`Searching for start boundary from ${startSearchTime} ms`);
  const startBoundaryCandidates = await detectPotentialBoundaries(
    path,
    startSearchTime,
    START_BOUNDARY_SEARCH_DURATION
  );

  if (!startBoundaryCandidates.length) {
    logger.info('No start boundary, unable to trim');
    return {};
  }

  const start = last(startBoundaryCandidates).start;
  logger.info(`Detected start at ${start} ms`);

  const endSearchTime = Math.max(
    start + MINIMUM_PROGRAMME_DURATION,
    duration - END_BOUNDARY_SEARCH_DURATION - config.safetyBuffer * 2
  );

  const endBoundaryCandidates = await detectPotentialBoundaries(
    path,
    endSearchTime,
    END_BOUNDARY_SEARCH_DURATION + END_BOUNDARY_SEARCH_BUFFER_DURATION + config.safetyBuffer
  );

  const { start: lastCandidateStart } = last(endBoundaryCandidates);
  const filteredCandidates = endBoundaryCandidates
    .map((currCandidate, i) => {
      const diffFromLast = Math.abs(lastCandidateStart - currCandidate.start);
      const modulus = Math.abs(
        INTERSTITIAL_DURATION_DIVISOR * Math.round(diffFromLast / INTERSTITIAL_DURATION_DIVISOR) -
          diffFromLast
      );

      logger.debug(`Candidate ${i} diff from last: ${diffFromLast} ms, modulus: ${modulus}`);

      return {
        ...currCandidate,
        modulus: modulus
      };
    })
    .filter(({ modulus }) => modulus <= INTERSTITIAL_DURATION_TOLERANCE);

  logger.debug(
    `Found ${filteredCandidates.length} candidates at ${INTERSTITIAL_DURATION_DIVISOR} ms intervals from last`,
    filteredCandidates
  );

  const end = head(filteredCandidates)?.start;
  if (end) {
    logger.info(`Detected end at ${end} ms`);
  } else {
    logger.info('No end boundary found');
  }
  return { start, end };
};

export const record = async (programme: Programme): Promise<void> => {
  const targetMillis = getTargetDuration(programme);
  const targetSeconds = targetMillis / 1000;
  const path = getInProgressPath(programme);

  logger.info(`Recording ${programme.title} for ${targetSeconds} seconds`);
  const recordingStart = currDate();
  try {
    const thumbnailData = await getThumbnail(programme.thumbnail);
    const streamCaptureOutput = await captureStream(path, targetSeconds, programme, thumbnailData);

    const recordingEnd = currDate();

    logger.info(`Finished recording: ${path}`);
    logger.debug(streamCaptureOutput);

    const expectedDuration = programme.endDate.getTime() - programme.startDate.getTime();
    const actualDuration = await getFileDuration(path);
    logger.debug(`'${path}' duration is ${actualDuration} ms`);

    if (actualDuration - expectedDuration > 0) {
      let trimmed = false;
      if (config.trim) {
        const trimmedPath = getTrimmedPath(programme);
        try {
          const { start, end } = await findTrimParameters(path, actualDuration);
          if (!start) {
            throw new Error('Failed to trim');
          }

          await trim(path, trimmedPath, Math.max(0, start), end);
          const trimmedDuration = await getFileDuration(trimmedPath);
          logger.info(`Trimmed to ${trimmedDuration} ms`);

          if (trimmedDuration < MINIMUM_PROGRAMME_DURATION) {
            throw new Error('Trimmed file is too short, something went wrong');
          }

          await renameWithSuffix(programme, FileType.TRIMMED, FileType.SUCCESSFUL);
          trimmed = true;

          if (config.keepUntrimmed) {
            await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.RAW);
          } else {
            await remove(path);
          }
        } catch (err) {
          logger.error(err);
          try {
            await remove(trimmedPath);
          } catch (err) {
            logger.debug(err);
          }
          await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.SUCCESSFUL);
        }
      } else {
        await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.SUCCESSFUL);
      }

      await writeMetadata(programme, true, {
        start: recordingStart,
        end: recordingEnd,
        trimmed
      });

      if (thumbnailData) {
        await writeThumbnail(programme, thumbnailData);
      }
    } else {
      throw new Error('Recording duration is too short, considering failed');
    }
  } catch (err) {
    if (err.stderr) {
      logger.error(err.stdout);
      logger.debug(err.stderr);
    } else {
      logger.error(err);
    }

    if (await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.FAILED)) {
      await writeMetadata(programme, false, {
        start: recordingStart,
        end: currDate()
      });
    }

    logger.error(`Error during recording: '${path}'`);
  }
};
