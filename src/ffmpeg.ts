import appRootPath from 'app-root-path';
import compareFunc from 'compare-func';
import IntervalTree from 'node-interval-tree';
import { join } from 'path';
import { head, last } from 'ramda';
import { Readable } from 'stream';
import config from './config';
import logger from './logger';
import { execute } from './utils';

const BLACKFRAME_FILTER_OUTPUT_PATTERN = new RegExp(
  [
    /\[Parsed_blackframe_(?<filterNum>\d+) @ \w+\]/,
    /frame:(?<frame>\d+)/,
    /pblack:(?<pctBlack>\d+)/,
    /pts:\d+/,
    /t:(?<time>[\d.]+)/,
    /type:\w/,
    /last_keyframe:\d+/
  ]
    .map((r) => r.source)
    .join(' ')
);

const SILENCEDETECT_FILTER_OUTPUT_PATTERN = new RegExp(
  [
    /\[silencedetect @ \w+\]/,
    /silence_end: (?<endTime>[\d.]+) \|/,
    /silence_duration: (?<duration>[\d.]+)/
  ]
    .map((r) => r.source)
    .join(' ')
);

interface FrameSearchStrategy {
  name: string;
  filters: Array<number>;
  maxSkip?: number;
  minSilenceSeconds?: number;
  minFrames: number;
}

interface Silence {
  startTime: number;
  endTime: number;
}

interface BlackframeOutput {
  filterNum: number;
  frameNum: number;
  time: number;
}

const MINIMUM_BOUNDARY_SILENCE_SECONDS = 0.1;

const BOUNDARY_STRATEGIES = [
  {
    name: 'black-logo',
    filters: [9],
    minSilenceSeconds: 1.5,
    minFrames: 5
  },
  {
    name: 'white-logo',
    filters: [11],
    minSilenceSeconds: 1.5,
    minFrames: 5
  },
  {
    name: 'white-borders-logo',
    filters: [13],
    minSilenceSeconds: 1.5,
    minFrames: 5
  },
  {
    name: 'no-logo',
    filters: [14],
    minSilenceSeconds: 0.1,
    minFrames: 3
  },
  {
    name: 'newsline',
    filters: [16],
    minSilenceSeconds: 0,
    minFrames: 1
  }
] as Array<FrameSearchStrategy>;

const NEWS_BANNER_STRATEGY = {
  name: 'news-banner-background',
  filters: [13],
  maxSkip: 120,
  minFrames: 60
} as FrameSearchStrategy;

const getFfprobeArguments = (path: string): Array<string> =>
  [['-v', 'quiet'], ['-print_format', 'json'], '-show_format', path].flat();

export const getFileDuration = async (path: string): Promise<number> => {
  const args = getFfprobeArguments(path);

  logger.debug(`Invoking ffprobe with args: ${args.join(' ')}`);

  const { stdout } = await execute('ffprobe', args);
  const {
    format: { duration }
  } = JSON.parse(stdout.join(''));

  return parseFloat(duration) * 1_000;
};

const getFfmpegBoundaryDetectionArguments = (
  path: string,
  from: number,
  limit: number
): Array<string> =>
  [
    '-copyts',
    ['-ss', `${from / 1000}`],
    limit ? ['-t', `${limit / 1000}`] : [],
    ['-i', path],
    ['-i', join(appRootPath.path, 'data/black_cropped.jpg')],
    ['-i', join(appRootPath.path, 'data/white_cropped.jpg')],
    ['-i', join(appRootPath.path, 'data/white_borders_cropped.jpg')],
    ['-i', join(appRootPath.path, 'data/newsline_intro.jpg')],
    [
      '-filter_complex',
      [
        // Extract luma channels
        '[0:0]extractplanes=y[vy]',
        '[1]extractplanes=y[by]',
        '[2]extractplanes=y[wy]',
        '[3]extractplanes=y[wby]',
        '[4]extractplanes=y[nly]',
        '[vy]split=outputs=2[vy0][vy1]',
        // Crop top left corner
        '[vy0]crop=w=960:h=540:x=0:y=0[cvy]',
        '[cvy]split=outputs=4[cvy0][cvy1][cvy2][cvy3]',
        // Detect black frames with logo
        '[cvy0][by]blend=difference,blackframe=99',
        // Detect white frames with logo
        '[cvy1][wy]blend=difference,blackframe=99:50',
        // Detect white frames with logo and border
        '[cvy2][wby]blend=difference,blackframe=99:50',
        // Detect black frames with no logo
        '[cvy3]blackframe=99',
        // Detect Newsline intro
        '[vy1][nly]blend=difference,blackframe=99',
        // Detect silences greater than MINIMUM_BOUNDARY_SILENCE_SECONDS
        `[0:1]silencedetect=n=-50dB:d=${MINIMUM_BOUNDARY_SILENCE_SECONDS}`
      ].join(';')
    ],
    ['-f', 'null'],
    '-'
  ].flat();

const findSilences = (ffmpegLines: Array<string>): Array<Silence> =>
  ffmpegLines
    .map((line) => line.match(SILENCEDETECT_FILTER_OUTPUT_PATTERN))
    .filter((x) => x)
    .map(({ groups: { endTime, duration } }) => ({
      startTime: Math.round((parseFloat(endTime) - parseFloat(duration)) * 1000),
      endTime: Math.round(parseFloat(endTime) * 1000)
    }));

const findBlackframeGroups = (
  ffmpegLines: Array<string>,
  strategy: FrameSearchStrategy,
  candidateWindows: IntervalTree<number> = new IntervalTree<number>()
): Array<DetectedFeature> =>
  ffmpegLines
    .map((line) => line.match(BLACKFRAME_FILTER_OUTPUT_PATTERN))
    .filter((x) => x)
    .map(
      ({ groups: { filterNum, frame, time } }) =>
        ({
          filterNum: parseInt(filterNum),
          frameNum: parseInt(frame),
          time: Math.round(parseFloat(time) * 1000)
        } as BlackframeOutput)
    )
    .filter(({ filterNum }) => strategy.filters.includes(filterNum))
    .filter(
      ({ time }) =>
        head(candidateWindows.search(time, time)) ?? 0 >= (strategy.minSilenceSeconds ?? 0)
    )
    .sort(compareFunc(['filterNum', 'frame']))
    .reduce((frameGroups, frame) => {
      const frameGroup = last(frameGroups) ?? [];
      if (!frameGroup.length) {
        frameGroups.push(frameGroup);
      }

      const lastFrame = last(frameGroup);
      if (
        !lastFrame ||
        (frame.frameNum - lastFrame.frameNum <= (strategy.maxSkip ?? 1) &&
          frame.filterNum === lastFrame.filterNum)
      ) {
        frameGroup.push(frame);
      } else {
        frameGroups.push([frame]);
      }
      return frameGroups;
    }, [] as Array<Array<BlackframeOutput>>)
    .filter((frameGroup) => frameGroup.length >= strategy.minFrames)
    .map(
      (frameGroup) =>
        ({
          start: head(frameGroup).time,
          end: last(frameGroup).time,
          firstFrame: head(frameGroup).frameNum,
          lastFrame: last(frameGroup).frameNum
        } as DetectedFeature)
    );

export const detectPotentialBoundaries = async (
  path: string,
  from: number,
  limit?: number
): Promise<Array<DetectedFeature>> => {
  const args = getFfmpegBoundaryDetectionArguments(path, from, limit);

  logger.debug(`Invoking ffmpeg with args: ${args.join(' ')}`);

  const ffmpegStartTime = process.hrtime.bigint();
  const { stderr: outputLines } = await execute('ffmpeg', args);
  outputLines.forEach(logger.debug);
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);

  const silences = findSilences(outputLines);
  logger.debug(`Found ${silences.length} silences`, silences);

  if (silences.length === 0) {
    logger.info('No silences of sufficient length, terminating boundary search');
    return [];
  }

  const candidateWindows = silences.reduce((tree, silence) => {
    tree.insert(silence.startTime, silence.endTime, silence.endTime - silence.startTime);
    return tree;
  }, new IntervalTree<number>());

  for (const strategy of BOUNDARY_STRATEGIES) {
    logger.debug(`Searching for candidates using ${strategy.name} strategy`);
    const candidates = findBlackframeGroups(outputLines, strategy, candidateWindows);
    logger.debug(`Found ${candidates.length} boundary candidates`, candidates);
    if (candidates.length > 0) {
      return candidates;
    }
  }

  return [];
};

const getFfmpegNewsBannerDetectionArguments = (path: string): Array<string> =>
  [
    ['-i', path],
    ['-i', join(appRootPath.path, 'data/news_background.jpg')],
    [
      '-filter_complex',
      [
        'nullsrc=size=184x800[base]',
        // Extract luma channels
        '[0:0]extractplanes=y[vy]',
        '[1]extractplanes=y[iy]',
        '[vy]split=2[vy0][vy1]',
        '[iy]split=2[iy0][iy1]',
        // Crop left and right margin areas
        '[vy0]crop=92:800:0:174[vyl]',
        '[vy1]crop=92:800:1828:174[vyr]',
        '[iy0]crop=92:800:0:174[iyl]',
        '[iy1]crop=92:800:1828:174[iyr]',
        // Compare left and right margins with news banner background
        '[vyl][iyl]blend=difference[dl]',
        '[vyr][iyr]blend=difference[dr]',
        '[base][dl]overlay=0:0:shortest=1[ol]',
        '[ol][dr]overlay=92:0,blackframe=99:16'
      ].join(';')
    ],
    ['-f', 'null'],
    '-'
  ].flat();

export const detectNewsBanners = async (path: string): Promise<Array<DetectedFeature>> => {
  const args = getFfmpegNewsBannerDetectionArguments(path);

  logger.debug(`Invoking ffmpeg with args: ${args.join(' ')}`);
  const ffmpegStartTime = process.hrtime.bigint();
  const { stderr: outputLines } = await execute('ffmpeg', args);
  outputLines.forEach(logger.silly);
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);

  const newsBanners = findBlackframeGroups(outputLines, NEWS_BANNER_STRATEGY);
  return newsBanners;
};

const getFfmpegCaptureArguments = (
  path: string,
  programme: Programme,
  thumbnail: boolean,
  durationSeconds: number
): Array<string> =>
  [
    '-y',
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
    programme.airingId ? ['-metadata', `episode_id=${programme.airingId}`] : [],
    ['-metadata', 'network=NHK World'],
    path
  ].flat(2);

export const captureStream = async (
  path: string,
  targetSeconds: number,
  programme: Programme,
  thumbnailData: Buffer | null
): Promise<Array<string>> => {
  const args = getFfmpegCaptureArguments(path, programme, !!thumbnailData, targetSeconds);

  const thumbnailStream = thumbnailData ? Readable.from(thumbnailData) : null;

  logger.debug(`Invoking ffmpeg with args: ${args.join(' ')}`);
  const ffmpegStartTime = process.hrtime.bigint();
  const { stderr: outputLines } = await execute('ffmpeg', args, thumbnailStream);
  outputLines.forEach(logger.debug);
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);

  return outputLines;
};

const getFfmpegTrimArguments = (
  inputPath: string,
  outputPath: string,
  start: number,
  end: number
): Array<string> =>
  [
    '-y',
    ['-i', inputPath],
    ['-ss', `${start / 1000}`],
    end ? ['-to', `${end / 1000}`] : [],
    ['-map', '0'],
    ['-map_metadata', '0'],
    ['-codec', 'copy'],
    ['-f', 'mp4'],
    outputPath
  ].flat();

export const trim = async (
  inputPath: string,
  outputPath: string,
  start: number,
  end: number
): Promise<void> => {
  const args = getFfmpegTrimArguments(inputPath, outputPath, start, end);

  logger.debug(`Invoking ffmpeg with args: ${args.join(' ')}`);
  const ffmpegStartTime = process.hrtime.bigint();
  const { stderr: outputLines } = await execute('ffmpeg', args);
  outputLines.forEach(logger.debug);
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);
};
