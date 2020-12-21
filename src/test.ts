import { detectCropArea, getFileDuration, detectNewsBanners, postProcessRecording } from './ffmpeg';
import { findCropParameters, findTrimParameters, postProcess } from './record';

(async () => {
  //const path = '/Volumes/nhk/The Great Summits - 6113 - 015.mp4';
  // const path =
  //   '/Volumes/nhk/15 Minutes - 3019 - 006 - Through the Kitchen Window Tami Hiyama - Chirashi-Zushi, Home-party Sushi.mp4';
  //const path = '/Volumes/nhk/Direct Talk - 2058 - 520.mp4';
  //const path = '/Volumes/nhk/CATCH JAPAN - 7000 - 452.mp4';
  //const path = '/Volumes/nhk/CATCH JAPAN - 7000 - 453.mp4';
  const path = process.argv[2];
  const outPath = process.argv[3];
  /*
  const trimParameters = await findTrimParameters(path, await getFileDuration(path));
  await trim(path, '/tmp/bla/trimmed.mp4', trimParameters.start, trimParameters.end);
  */
  //console.log(await detectNewsBanners(path));
  //console.log(await detectCropArea(path, 837240 - 750, 1500));
  const trimParameters = await findTrimParameters(path, await getFileDuration(path));
  const cropParameters = await findCropParameters(path, await getFileDuration(path));
  console.log(cropParameters);
  await postProcessRecording(
    path,
    outPath,
    trimParameters.start,
    trimParameters.end,
    cropParameters
  );
  // await postProcess(
})();
