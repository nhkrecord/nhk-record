import pick from 'lodash.pick';
import memoize from 'memoizee';
import fetch from 'node-fetch';
import config from './config';
import { parseDate } from './utils';

const getApiKey = async (): Promise<string | undefined> => {
  const res = await fetch('https://www3.nhk.or.jp/nhkworld/common/js/common.js');
  const text = await res.text();
  const match = text.match(/window\.nw_api_key=window\.nw_api_key\|\|"(?<apiKey>[^"]+)"/);
  return match?.groups?.apiKey || 'EJfK8jdS57GqlupFgAfAAwr573q01y6k';
};

const getScheduleForPeriod = async (apiKey: string, start: Date, end: Date): Promise<Schedule> => {
  const startMillis = start.getTime();
  const endMillis = end.getTime();

  const res = await fetch(
    `https://api.nhk.or.jp/nhkworld/epg/v7a/world/s${startMillis}-e${endMillis}.json?apikey=${apiKey}`
  );

  return await res.json();
};

export const getSchedule = async (): Promise<Array<Programme>> => {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('Unable to retrieve API key');
  }

  const start = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 6 * 60 * 60 * 1000);

  const rawSchedule = await getScheduleForPeriod(apiKey, start, end);
  const items = rawSchedule?.channel?.item;

  if (items) {
    return items.map((item) => ({
      ...pick(item, ['title', 'subtitle', 'seriesId', 'airingId', 'description']),
      content: item.content_clean,
      startDate: parseDate(item.pubDate),
      endDate: parseDate(item.endDate)
    }));
  } else {
    throw new Error('Failed to retrieve schedule');
  }
};

export const getScheduleMemoized = memoize(getSchedule, {
  // Cache schedule for 60 minutes
  maxAge: 60 * 60 * 1000,
  promise: true
});

export const getCurrentProgramme = async (): Promise<Programme> => {
  const programmes = await getScheduleMemoized();
  const currTime = Date.now() + config.safetyBuffer;

  const programme = programmes.find(
    ({ startDate, endDate }) => currTime > startDate.getTime() && currTime < endDate.getTime()
  );

  return programme;
};
