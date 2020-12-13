import appRootPath from 'app-root-path';
import { execFile } from 'child_process';
import streamToPromise from 'stream-to-promise';
import { promisify } from 'util';
import config from './config';
import { ExecError } from './error';
import logger from './logger';

const execFileAsync = promisify(execFile);

const getFfprobeArguments = (path: string): Array<string> =>
  [['-v', 'quiet'], ['-print_format', 'json'], '-show_format', path].flat();

export const getFileDuration = async (path: string): Promise<number> => {
  const args = getFfprobeArguments(path);

  logger.debug(`Invoking ffprobe with args: ${args.join(' ')}`);

  const { stdout } = await execFileAsync('ffprobe', args);
  const {
    format: { duration }
  } = JSON.parse(stdout);

  return parseFloat(duration) * 1000;
};

const detectPotentialBoundaries = (path: string) => {};

const getFfmpegCaptureArguments = (
  path: string,
  programme: Programme,
  thumbnail: boolean,
  durationSeconds: number
): Array<string> =>
  [
    ['-i', config.streamUrl],
    thumbnail
      ? [
          ['-i', '-'],
          ['-map', '0'],
          ['-map', '1'],
          ['-disposition:v:1', 'attached_pic']
        ]
      : [],
    ['-t', `${durationSeconds}`],
    ['-codec', 'copy'],
    ['-f', 'mp4'],
    programme.title ? ['-metadata', `show=${programme.title}`] : [],
    programme.subtitle ? ['-metadata', `title=${programme.subtitle}`] : [],
    programme.description ? ['-metadata', `description=${programme.description}`] : [],
    programme.content ? ['-metadata', `synopsis=${programme.content}`] : [],
    programme.startDate ? ['-metadata', `date=${programme.startDate.toISOString()}`] : [],
    ['-metadata', 'network=NHK World'],
    path
  ].flat(2);

export const captureStream = async (
  path: string,
  targetSeconds: number,
  programme: Programme,
  thumbnailData: Buffer | null
) => {
  const ffmpegArgs = getFfmpegCaptureArguments(path, programme, !!thumbnailData, targetSeconds);

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
        return reject(new ExecError(`Non-zero exit code: ${code}`, stdoutContent, stderrContent));
      }

      resolve(stderrContent);
    });
  });
};
