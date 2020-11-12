import pick from 'lodash.pick';
import memoize from 'memoizee';
import fetch from 'node-fetch';
import config from './config';
import { parseDate } from './utils';

export const getSchedule = async (): Promise<Array<Programme>> => {
  const res = await fetch(config.scheduleUrl);
  const rawSchedule: Schedule = await res.json();
  const items = rawSchedule?.channel?.item;

  if (items) {
    return items.map((item) => ({
      ...pick(item, [
        'title',
        'subtitle',
        'seriesId',
        'airingId',
        'description'
      ]),
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
    ({ startDate, endDate }) =>
      currTime > startDate.getTime() && currTime < endDate.getTime()
  );

  return programme;
};
