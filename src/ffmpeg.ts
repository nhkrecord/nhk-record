import { exec } from 'child_process';
import { promisify } from 'util';
import config from './config';
import logger from './logger';
import { getInProgressPath, renameFailed, renameSuccessful, writeMetadata } from './storage';

const execAsync = promisify(exec);

const getFfmpegCommand = (path: string, durationSeconds: number): string =>
  [
    'ffmpeg',
    `-i '${config.streamUrl}'`,
    `-t ${durationSeconds}`,
    '-codec copy',
    '-f mpegts',
    `'${path}'`
  ].join(' ');

const getFfprobeCommand = (path: string): string =>
  ['ffprobe', '-v quiet', '-print_format json', '-show_format', `'${path}'`].join(' ');

const getFileDuration = async (path: string): Promise<number> => {
  const command = getFfprobeCommand(path);

  logger.debug(`Invoking ffprobe: ${command}`);

  const { stdout } = await execAsync(command);
  const {
    format: { duration }
  } = JSON.parse(stdout);

  return parseFloat(duration) * 1000;
};

const getTargetDuration = ({ endDate }: Programme): number =>
  endDate.getTime() - Date.now() + config.safetyBuffer;

export const record = async (programme: Programme): Promise<void> => {
  const targetMillis = getTargetDuration(programme);
  const targetSeconds = targetMillis / 1000;
  const path = getInProgressPath(programme);

  logger.info(`Recording ${programme.title} for ${targetSeconds} seconds`);

  const recordingStart = new Date();
  try {
    const command = getFfmpegCommand(path, targetSeconds);
    logger.debug(`Invoking ffmpeg: ${command}`);

    const { stdout } = await execAsync(command);
    const recordingEnd = new Date();

    logger.info(`Finished recording: ${path}`);
    logger.debug(stdout);

    const expectedDuration = programme.endDate.getTime() - programme.startDate.getTime();
    const actualDuration = await getFileDuration(path);
    logger.debug(`'${path}' duration is ${actualDuration} ms`);

    if (actualDuration - expectedDuration > 0) {
      await renameSuccessful(programme);
      await writeMetadata(programme, true, {
        start: recordingStart,
        end: recordingEnd
      });
    } else {
      throw new Error('Recording duration is too short, considering failed');
    }
  } catch (e) {
    if (e.stderr) {
      logger.error(e.stdout);
      logger.debug(e.stderr);
    } else {
      logger.error(e);
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
