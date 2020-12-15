import pick from 'lodash.pick';
import fetch from 'node-fetch';
import config from './config';
import logger from './logger';
import { currDate, now, parseDate } from './utils';

const SCHEDULE_BEGIN_OFFSET = -2 * 60 * 60 * 1000;
const SCHEDULE_END_OFFSET = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_AGE = 60 * 60 * 1000;

let scheduleData: Array<Programme> = null;
let scheduleDataTimestamp = 0;

const getApiKey = async (): Promise<string> => {
  try {
    const res = await fetch(`${config.assetsUrl}/nhkworld/common/js/common.js`);
    const text = await res.text();
    const match = text.match(/window\.nw_api_key=window\.nw_api_key\|\|"(?<apiKey>[^"]+)"/);
    const apiKey = match?.groups?.apiKey;
    if (apiKey) {
      logger.debug(`Retrieved API key: ${apiKey}`);
      return apiKey;
    }
  } catch (err) {
    logger.error('Failed to retrieve API');
    logger.error(err);
  }

  logger.debug('Falling back to hardcoded API key');
  return 'EJfK8jdS57GqlupFgAfAAwr573q01y6k';
};

const getScheduleForPeriod = async (apiKey: string, start: Date, end: Date): Promise<Schedule> => {
  const startMillis = start.getTime();
  const endMillis = end.getTime();

  const res = await fetch(
    `${config.scheduleUrl}/nhkworld/epg/v7a/world/s${startMillis}-e${endMillis}.json?apikey=${apiKey}`
  );

  return await res.json();
};

export const getSchedule = async (): Promise<Array<Programme>> => {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('Unable to retrieve API key');
  }

  const start = new Date(now() + SCHEDULE_BEGIN_OFFSET);
  const end = new Date(now() + SCHEDULE_END_OFFSET);

  const rawSchedule = await getScheduleForPeriod(apiKey, start, end);
  const items = rawSchedule?.channel?.item;

  if (items) {
    return items.map((item) => ({
      ...pick(item, ['title', 'subtitle', 'seriesId', 'airingId', 'description', 'thumbnail']),
      content: item.content_clean,
      startDate: parseDate(item.pubDate),
      endDate: parseDate(item.endDate)
    }));
  } else {
    throw new Error('Failed to retrieve schedule');
  }
};

export const getScheduleMemoized = async (): Promise<Array<Programme>> => {
  const cacheAge = now() - scheduleDataTimestamp;
  if (cacheAge < MAX_CACHE_AGE) {
    logger.debug(`Using cached schedule (${cacheAge / 1000} seconds old)`);
    return scheduleData;
  }

  try {
    logger.debug('Retrieving schedule');
    scheduleData = await getSchedule();
    scheduleDataTimestamp = now();

    return scheduleData;
  } catch (err) {
    logger.error('Failed to get schedule data');
    logger.error(err);

    if (scheduleData) {
      logger.info(`Falling back to old cached version (${cacheAge / 1000} seconds old)`);
      return scheduleData;
    }

    throw err;
  }
};

export const getCurrentProgramme = async (): Promise<Programme> => {
  const programmes = await getScheduleMemoized();
  const currTime = now() + config.safetyBuffer;

  const programme = programmes.find(
    ({ startDate, endDate }) => currTime > startDate.getTime() && currTime < endDate.getTime()
  );

  return programme;
};
