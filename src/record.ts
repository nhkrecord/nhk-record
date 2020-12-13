import config from './config';
import { captureStream, getFileDuration } from './ffmpeg';
import logger from './logger';
import {
  getInProgressPath,
  renameFailed,
  renameSuccessful,
  writeMetadata,
  writeThumbnail
} from './storage';
import { getThumbnail } from './thumbnail';

const getTargetDuration = ({ endDate }: Programme): number =>
  endDate.getTime() - Date.now() + config.safetyBuffer;

export const record = async (programme: Programme): Promise<void> => {
  const targetMillis = getTargetDuration(programme);
  const targetSeconds = targetMillis / 1000;
  const path = getInProgressPath(programme);

  logger.info(`Recording ${programme.title} for ${targetSeconds} seconds`);
  const recordingStart = new Date();
  try {
    const thumbnailData = await getThumbnail(programme.thumbnail);
    const ffmpegOutput = await captureStream(path, targetSeconds, programme, thumbnailData);

    const recordingEnd = new Date();

    logger.info(`Finished recording: ${path}`);
    logger.debug(ffmpegOutput);

    const expectedDuration = programme.endDate.getTime() - programme.startDate.getTime();
    const actualDuration = await getFileDuration(path);
    logger.debug(`'${path}' duration is ${actualDuration} ms`);

    if (actualDuration - expectedDuration > 0) {
      await renameSuccessful(programme);
      await writeMetadata(programme, true, {
        start: recordingStart,
        end: recordingEnd
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

    if (await renameFailed(programme)) {
      await writeMetadata(programme, false, {
        start: recordingStart,
        end: new Date()
      });
    }

    logger.error(`Error during recording: '${path}'`);
  }
};
