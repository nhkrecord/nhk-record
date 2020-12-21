import { head, last, pick, prop, sortBy } from 'ramda';
import config from './config';
import {
  captureStream,
  detectCropArea,
  detectNewsBanners,
  detectPotentialBoundaries,
  getFileDuration,
  postProcessRecording
} from './ffmpeg';
import logger from './logger';
import {
  FileType,
  getInProgressPath,
  getPostProcessedPath,
  remove,
  renameWithSuffix,
  writeMetadata,
  writeThumbnail
} from './storage';
import { getThumbnail } from './thumbnail';
import { currDate, now } from './utils';

const MINIMUM_PROGRAMME_DURATION = 30_000;

const START_BOUNDARY_SEARCH_DURATION = 45_000;
const END_BOUNDARY_SEARCH_DURATION = 180_000;

const START_BOUNDARY_SEARCH_BUFFER_DURATION = 10_000;
const END_BOUNDARY_SEARCH_BUFFER_DURATION = 40_000;

const INTERSTITIAL_DURATION_DIVISOR = 30_000;
const INTERSTITIAL_DURATION_TOLERANCE = 1_000;

const NEWS_BANNER_TRANSITION_DURATION = 750;
const WHOLE_RECORDING_CROP_TOLERANCE = 3_000;
const CONSTANT_CROP_WIDTH = 1_728;

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

  if (!endBoundaryCandidates.length) {
    logger.info('No end boundary detected');
    return { start };
  }

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
  if (!end) {
    logger.info('No end boundary found');
    return { start };
  }

  logger.info(`Detected end at ${end} ms`);
  return { start, end };
};

export const findCropParameters = async (
  path: string,
  duration: number
): Promise<Array<CropParameters>> => {
  logger.info('Detecting news banners');
  const banners = await detectNewsBanners(path);
  if (!banners.length) {
    logger.info('No news banners detected');
    return [];
  }

  logger.info(`Detected ${banners.length} news banners`, banners);

  if (
    banners.length === 1 &&
    Math.abs(duration - (head(banners).end - head(banners).start)) < WHOLE_RECORDING_CROP_TOLERANCE
  ) {
    logger.info('Using constant crop');
    return [
      {
        time: 0,
        width: CONSTANT_CROP_WIDTH
      }
    ];
  }

  const parameters: Array<CropParameters> = [];
  for (const banner of banners) {
    parameters.push(
      ...(await detectCropArea(
        path,
        Math.max(0, banner.start - NEWS_BANNER_TRANSITION_DURATION / 2),
        NEWS_BANNER_TRANSITION_DURATION
      ))
    );

    parameters.push(
      ...(await detectCropArea(
        path,
        Math.min(duration, banner.end - NEWS_BANNER_TRANSITION_DURATION / 2),
        NEWS_BANNER_TRANSITION_DURATION
      ))
    );
  }

  const sortedParameters = sortBy(prop('time'))(parameters);
  // TODO: prevent jitter
  const collapsedParameters = sortedParameters.reduce((acc, curr) => {
    if (curr.width !== last(acc)?.width) {
      acc.push(curr);
    }
    return acc;
  }, [] as Array<CropParameters>);

  logger.debug(`Generated ${collapsedParameters.length} crop parameters`, collapsedParameters);

  return collapsedParameters;
};

export const postProcess = async (path: string, duration: number, programme: Programme) => {
  const result = {
    trimmed: false,
    cropped: false,
    keptOriginal: false
  };

  if (!config.trim && !config.crop) {
    await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.SUCCESSFUL);
    return result;
  }

  const postProcessedPath = getPostProcessedPath(programme);
  try {
    const { start = 0, end = duration } = config.trim
      ? await findTrimParameters(path, duration)
      : {};

    const cropParameters = config.crop ? await findCropParameters(path, duration) : [];

    await postProcessRecording(path, postProcessedPath, Math.max(0, start), end, cropParameters);
    const postProcessedDuration = await getFileDuration(postProcessedPath);
    logger.info(`Post-processed file is ${postProcessedDuration} ms`);

    if (postProcessedDuration < MINIMUM_PROGRAMME_DURATION) {
      throw new Error('Post-processed file is too short, something went wrong');
    }

    await renameWithSuffix(programme, FileType.POST_PROCESSED, FileType.SUCCESSFUL);

    if (config.keepOriginal) {
      await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.RAW);
      result.keptOriginal = true;
    } else {
      await remove(path);
    }

    result.trimmed = true;
  } catch (err) {
    logger.error(err);
    try {
      await remove(postProcessedPath);
    } catch (err) {
      logger.debug(err);
    }
    await renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.SUCCESSFUL);
  }

  return result;
};

export const record = async (programme: Programme): Promise<void> => {
  const targetMillis = getTargetDuration(programme);
  const targetSeconds = targetMillis / 1000;
  const path = getInProgressPath(programme);

  logger.info(`Recording ${programme.title} for ${targetSeconds} seconds`);
  const recordingStart = currDate();
  try {
    const thumbnailData = await getThumbnail(programme.thumbnail);
    await captureStream(path, targetSeconds, programme, thumbnailData);

    const recordingEnd = currDate();

    logger.info(`Finished recording: ${path}`);

    const expectedDuration = programme.endDate.getTime() - programme.startDate.getTime();
    const actualDuration = await getFileDuration(path);
    logger.debug(`'${path}' duration is ${actualDuration} ms`);

    if (actualDuration - expectedDuration > 0) {
      const postprocessingResult = await postProcess(path, actualDuration, programme);

      if (postprocessingResult.keptOriginal) {
        await writeMetadata(programme, FileType.RAW, {
          start: recordingStart,
          end: currDate(),
          trimmed: false,
          cropped: false
        });
      }

      await writeMetadata(programme, FileType.SUCCESSFUL, {
        start: recordingStart,
        end: recordingEnd,
        ...pick(['trimmed', 'cropped'])(postprocessingResult)
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
      await writeMetadata(programme, FileType.FAILED, {
        start: recordingStart,
        end: currDate()
      });
    }

    logger.error(`Error during recording: '${path}'`);
  }
};
