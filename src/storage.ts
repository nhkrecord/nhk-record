import { mkdir, rename, stat, writeFile } from 'fs/promises';
import hasha from 'hasha';
import { join } from 'path';
import sanitizeFilename from 'sanitize-filename';
import config from './config';
import logger from './logger';

export const makeSaveDirectory = async (): Promise<string> => {
  const { saveDir } = config;
  if (!(await stat(saveDir).catch(() => null))) {
    logger.debug(`${saveDir} does not exist, attempting to create it`);
    await mkdir(saveDir, { recursive: true });
  }

  return saveDir;
};

export const getFilename = (programme: Programme): string => {
  const parts = [programme.title, programme.seriesId];

  if (programme.airingId === '000') {
    parts.push(programme.startDate.toISOString());
  } else {
    parts.push(programme.airingId);
  }

  if (programme.subtitle) {
    parts.push(programme.subtitle);
  }

  return sanitizeFilename(`${parts.join(' - ')}.ts`).replace(/'/g, '');
};

export const getSavePath = (programme: Programme): string =>
  join(config.saveDir, getFilename(programme));

export const getInProgressPath = (programme: Programme): string =>
  `${getSavePath(programme)}.inprogress`;

export const getFailedPath = (programme: Programme): string =>
  `${getSavePath(programme)}.${sanitizeFilename(programme.startDate.toISOString())}.failed`;

export const recordingExists = async (programme: Programme): Promise<boolean> =>
  (
    await Promise.all([
      stat(getInProgressPath(programme)).catch(() => null),
      stat(getSavePath(programme)).catch(() => null)
    ])
  ).some((s) => !!s);

export const renameSuccessful = async (programme: Programme): Promise<string> => {
  const from = getInProgressPath(programme);
  const to = getSavePath(programme);

  logger.debug(`Moving '${from}' to '${to}'`);
  try {
    await rename(from, to);
  } catch (e) {
    logger.error(`Failed to rename '${from}' to '${to}'`);
    logger.debug(e);
    return null;
  }

  return to;
};

export const renameFailed = async (programme: Programme): Promise<string> => {
  const from = getInProgressPath(programme);
  const to = getFailedPath(programme);

  logger.debug(`Moving '${from}' to '${to}'`);
  try {
    await rename(from, to);
  } catch (e) {
    logger.error(`Failed to rename '${from}' to '${to}'`);
    logger.debug(e);
    return null;
  }

  return to;
};

export const writeMetadata = async (
  programme: Programme,
  successful: boolean,
  recording: { start: Date; end: Date }
): Promise<string> => {
  const path = `${successful ? getSavePath(programme) : getFailedPath(programme)}`;
  const metadataPath = `${path}.metadata`;

  logger.debug(`Hashing ${path}`);
  const hashStartTime = process.hrtime.bigint();
  const sha256 = await hasha.fromFile(path, { algorithm: 'sha256' });
  const hashDuration = process.hrtime.bigint() - hashStartTime;
  logger.info(`'${path}' sha256 hash is: ${sha256}, calculated in ${hashDuration} nanos`);

  const metadata = JSON.stringify(
    {
      ...programme,
      recordDateStart: recording?.start?.toISOString(),
      recordDateEnd: recording?.end?.toISOString(),
      sha256
    },
    null,
    2
  );

  logger.debug(`Writing metadata to '${metadataPath}'`);
  await writeFile(metadataPath, metadata);

  return metadataPath;
};
