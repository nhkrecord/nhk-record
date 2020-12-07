import { execFile } from 'child_process';
import streamToPromise from 'stream-to-promise';
import { promisify } from 'util';
import config from './config';
import { ExecError } from './error';
import logger from './logger';
import {
  getInProgressPath,
  renameFailed,
  renameSuccessful,
  writeMetadata,
  writeThumbnail
} from './storage';
import { getThumbnail } from './thumbnail';

const execFileAsync = promisify(execFile);

const getFfmpegArguments = (
  path: string,
  programme: Programme,
  thumbnail: boolean,
  durationSeconds: number
): Array<string> =>
  [
    '-i',
    config.streamUrl,
    thumbnail ? ['-i', '-', '-map', '0', '-map', '1', '-disposition:v:1', 'attached_pic'] : [],
    '-t',
    `${durationSeconds}`,
    '-codec',
    'copy',
    '-f',
    'mp4',
    programme.title ? ['-metadata', `show=${programme.title}`] : [],
    programme.subtitle ? ['-metadata', `title=${programme.subtitle}`] : [],
    programme.description ? ['-metadata', `description=${programme.description}`] : [],
    programme.content ? ['-metadata', `synopsis=${programme.content}`] : [],
    programme.startDate ? ['-metadata', `date=${programme.startDate}`] : [],
    path
  ].flat();

const getFfprobeArguments = (path: string): Array<string> => [
  '-v',
  'quiet',
  '-print_format',
  'json',
  '-show_format',
  path
];

const getFileDuration = async (path: string): Promise<number> => {
  const args = getFfprobeArguments(path);

  logger.debug(`Invoking ffprobe with args: ${args.join(' ')}`);

  const { stdout } = await execFileAsync('ffprobe', args);
  const {
    format: { duration }
  } = JSON.parse(stdout);

  return parseFloat(duration) * 1000;
};

const getTargetDuration = ({ endDate }: Programme): number =>
  endDate.getTime() - Date.now() + config.safetyBuffer;

const execFfmpeg = async (
  path: string,
  targetSeconds: number,
  programme: Programme,
  thumbnailData: Buffer | null
) => {
  const ffmpegArgs = getFfmpegArguments(path, programme, !!thumbnailData, targetSeconds);

  logger.debug(`Invoking ffmpeg with args: ${ffmpegArgs.join(' ')}`);
  const proc = execFile('ffmpeg', ffmpegArgs);
  const { stdout, stderr, stdin } = proc;
  if (thumbnailData) {
    stdin.write(thumbnailData);
    stdin.end();
  }

  const [stdoutContent, stderrContent] = (
    await Promise.all([streamToPromise(stdout), streamToPromise(stderr)])
  ).map((b) => b.toString('utf-8'));

  return new Promise((resolve, reject) => {
    proc.on('exit', (code) => {
      if (code !== 0) {
        return reject(new ExecError('Non-zero exit code', stdoutContent, stderrContent));
      }

      resolve(stderrContent);
    });
  });
};

export const record = async (programme: Programme): Promise<void> => {
  const targetMillis = getTargetDuration(programme);
  const targetSeconds = targetMillis / 1000;
  const path = getInProgressPath(programme);

  logger.info(`Recording ${programme.title} for ${targetSeconds} seconds`);
  const recordingStart = new Date();
  try {
    const thumbnailData = await getThumbnail(programme.thumbnail);
    const ffmpegOutput = await execFfmpeg(path, targetSeconds, programme, thumbnailData);

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
