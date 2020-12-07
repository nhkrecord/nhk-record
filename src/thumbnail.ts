import fetch from 'node-fetch';
import config from './config';
import logger from './logger';

export const getThumbnail = async (thumbnailUri: string): Promise<Buffer | null> => {
  const url = `${config.assetsUrl}${thumbnailUri}`;

  logger.info(`Retrieving thumbnail: ${url}`);
  try {
    const res = await fetch(url);
    return await res.buffer();
  } catch (err) {
    logger.error('Failed to get thumbnail');
    logger.error(err);
  }

  return null;
};
