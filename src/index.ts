import micromatch from 'micromatch';
import config from './config';
import { record } from './ffmpeg';
import logger from './logger';
import { getCurrentProgramme } from './schedule';
import { makeSaveDirectory, recordingExists } from './storage';
import { now, sleep } from './utils';

const isDesiredProgramme = (programme: Programme) => {
  const duration = programme.endDate.getTime() - programme.startDate.getTime();
  const desiredTitle = micromatch.isMatch(programme.title, config.matchPattern, {
    nocase: true
  });

  return desiredTitle && duration > config.minimumDuration;
};

const recordIfDesired = async (programme: Programme) => {
  const { title } = programme;

  const desired = isDesiredProgramme(programme);
  logger.info(`${title} is ${desired ? '' : 'not '}desired`);

  if (!desired) {
    return;
  }

  if (await recordingExists(programme)) {
    logger.info(`Recording already exists for ${title}`);
    return;
  }

  await record(programme);
};

const main = async () => {
  await makeSaveDirectory();

  for (;;) {
    try {
      const programme = await getCurrentProgramme();

      if (!programme) {
        logger.debug('Nothing currently airing?');
        await sleep(3 * 1000);
        continue;
      }

      const { title, endDate } = programme;

      logger.info(`Currently airing programme is: ${title}`);
      recordIfDesired(programme);

      const sleepMillis = endDate.getTime() - now() - config.safetyBuffer;
      logger.info(`Sleeping ${sleepMillis / 1000} seconds until next programme`);
      await sleep(sleepMillis);
    } catch (e) {
      logger.error(e);
      await sleep(1000);
    }
  }
};

main();
