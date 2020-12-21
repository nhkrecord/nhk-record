import appRootPath from 'app-root-path';
import compareFunc from 'compare-func';
import IntervalTree from 'node-interval-tree';
import { join } from 'path';
import { init, head, last } from 'ramda';
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

const CROPDETECT_FILTER_OUTPUT_PATTERN = new RegExp(
  [
    /\[Parsed_cropdetect_(?<filterNum>\d+) @ \w+\]/,
    /x1:(?<x1>\d+)/,
    /x2:(?<x2>\d+)/,
    /y1:(?<y1>\d+)/,
    /y2:(?<y2>\d+)/,
    /w:(?<width>\d+)/,
    /h:(?<height>\d+)/,
    /x:(?<x>\d+)/,
    /y:(?<y>\d+)/,
    /pts:\d+/,
    /t:(?<time>[\d.]+)/,
    /crop=\d+:\d+:\d+:\d+/
  ]
    .map((r) => r.source)
    .join(' ')
);

const FULL_CROP_WIDTH = 1920;

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
  minFrames: 120
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

export const getStreamCount = async (path: string): Promise<number> => {
  const args = getFfprobeArguments(path);

  logger.debug(`Invoking ffprobe with args: ${args.join(' ')}`);

  const { stdout } = await execute('ffprobe', args);
  const {
    format: { nb_streams: numStreams }
  } = JSON.parse(stdout.join(''));

  return parseInt(numStreams);
};

const getFfmpegBoundaryDetectionArguments = (
  path: string,
  from: number,
  limit: number
): Array<string> =>
  [
    '-copyts',
    config.threadLimit > 0 ? ['-threads', `${config.threadLimit}`] : [],
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
    config.threadLimit > 0 ? ['-threads', `${config.threadLimit}`] : [],
    ['-i', path],
    ['-i', join(appRootPath.path, 'data/news_background.jpg')],
    [
      '-filter_complex',
      [
        'nullsrc=size=184x800:r=29.97[base]',
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
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);

  const newsBanners = findBlackframeGroups(outputLines, NEWS_BANNER_STRATEGY);
  return newsBanners;
};

const getFfmpegCropDetectionArguments = (path: string, from: number, limit: number) =>
  [
    '-copyts',
    config.threadLimit > 0 ? ['-threads', `${config.threadLimit}`] : [],
    ['-ss', `${from / 1000}`],
    ['-t', `${limit / 1000}`],
    ['-i', path],
    ['-i', join(appRootPath.path, 'data/news_background.jpg')],
    [
      '-filter_complex',
      [
        // Extract luma channels
        '[0:0]extractplanes=y[vy]',
        '[1]extractplanes=y[iy]',
        // Find difference with news background
        '[vy][iy]blend=difference,crop=1920:928:0:60,split=2[vc0][vc1]',
        // Mirror content to get symmetrical crop
        '[vc0]hflip[vf]',
        '[vf][vc1]blend=addition,cropdetect=24:2:1'
      ].join(';')
    ],
    ['-f', 'null'],
    '-'
  ].flat();

export const detectCropArea = async (path: string, from: number, limit: number) => {
  const args = getFfmpegCropDetectionArguments(path, from, limit);

  logger.debug(`Invoking ffmpeg with args: ${args.join(' ')}`);
  const ffmpegStartTime = process.hrtime.bigint();
  const { stderr: outputLines } = await execute('ffmpeg', args);
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);

  return outputLines
    .map((line) => line.match(CROPDETECT_FILTER_OUTPUT_PATTERN))
    .filter((x) => x)
    .map(({ groups: { width, time } }) => ({
      time: parseFloat(time) * 1000,
      width: parseInt(width)
    }));
};

const getFfmpegCaptureArguments = (
  path: string,
  programme: Programme,
  thumbnail: boolean,
  durationSeconds: number
): Array<string> =>
  [
    '-y',
    config.threadLimit > 0 ? ['-threads', `${config.threadLimit}`] : [],
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
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);

  return outputLines;
};

const generateTimeSequence = (
  calcValue: (w: number) => number,
  cropParameters: Array<CropParameters>
) => {
  const { time, width = FULL_CROP_WIDTH } = last(cropParameters) ?? {};
  if (!time) {
    return `${calcValue(width)}`;
  }

  return `if(gte(t,${time / 1000}),${calcValue(width)},${generateTimeSequence(
    calcValue,
    init(cropParameters)
  )})`;
};

const calculateScaleWidth = (cropWidth: number): number =>
  Math.round((FULL_CROP_WIDTH * FULL_CROP_WIDTH) / cropWidth / 2) * 2;

const calculateOverlayPosition = (cropWidth: number): number =>
  Math.round((cropWidth - FULL_CROP_WIDTH) / 2);

const getFfmpegTrimArguments = (
  inputPath: string,
  outputPath: string,
  start: number,
  end: number,
  cropParameters: Array<CropParameters>,
  hasThumbnail: boolean
): Array<string> =>
  [
    '-y',
    config.threadLimit > 0 ? ['-threads', `${config.threadLimit}`] : [],
    ['-i', inputPath],
    ['-ss', `${start / 1000}`],
    end ? ['-to', `${end / 1000}`] : [],
    ['-codec', 'copy'],
    cropParameters.length > 0
      ? [
          [
            '-filter_complex',
            [
              'nullsrc=size=1920x1080:r=29.97[base]',
              `[base][0:0]overlay='${generateTimeSequence(
                calculateOverlayPosition,
                cropParameters
              )}':0:shortest=1[o]`,
              `[o]scale='${generateTimeSequence(
                calculateScaleWidth,
                cropParameters
              )}':-1:eval=frame:flags=bicubic[s]`,
              '[s]crop=1920:1080:0:0[c]'
            ].join(';')
          ],
          ['-map', '[c]'],
          ['-crf', '19'],
          ['-preset', 'veryfast'],
          ['-codec:v:0', 'libx264']
        ]
      : ['-map', '0:0'],
    ['-map', '0:1'],
    hasThumbnail
      ? [
          ['-filter_complex', `[0:2]setpts=PTS+${start / 1000}/TB[tn]`],
          ['-map', '[tn]'],
          ['-codec:v:1', 'mjpeg']
        ]
      : [],
    ['-map_metadata', '0'],
    ['-f', 'mp4'],
    outputPath
  ].flat(2);

export const postProcessRecording = async (
  inputPath: string,
  outputPath: string,
  start: number,
  end: number,
  cropParameters: Array<CropParameters>
): Promise<void> => {
  const hasThumbnail = (await getStreamCount(inputPath)) > 2;
  const args = getFfmpegTrimArguments(
    inputPath,
    outputPath,
    start,
    end,
    cropParameters,
    hasThumbnail
  );

  logger.debug(`Invoking ffmpeg with args: ${args.join(' ')}`);
  const ffmpegStartTime = process.hrtime.bigint();
  await execute('ffmpeg', args);
  const ffmpegDuration = process.hrtime.bigint() - ffmpegStartTime;
  logger.info(`Done in ${ffmpegDuration / 1_000_000n} ms`);
};
