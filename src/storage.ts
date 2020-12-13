import { mkdir, rename, stat, unlink, writeFile } from 'fs/promises';
import hasha from 'hasha';
import { join } from 'path';
import sanitizeFilename from 'sanitize-filename';
import config from './config';
import logger from './logger';

export enum FileType {
  FAILED,
  IN_PROGRESS,
  METADATA,
  RAW,
  SUCCESSFUL,
  THUMBNAIL,
  TRIMMED
}

export const remove = (path: string): Promise<void> => unlink(path);

const getSuffix = (suffixType: FileType, programme: Programme): string =>
  ({
    FAILED: (programme: Programme) =>
      `.${sanitizeFilename(programme.startDate.toISOString())}.failed`,
    IN_PROGRESS: () => '.inprogress',
    METADATA: () => '.metadata',
    RAW: () => '.raw',
    SUCCESSFUL: () => '',
    THUMBNAIL: () => '.jpg',
    TRIMMED: () => '.trimmed'
  }[suffixType](programme));

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

  return sanitizeFilename(`${parts.join(' - ')}.mp4`).replace(/'/g, '');
};

export const getSavePath = (programme: Programme): string =>
  join(config.saveDir, getFilename(programme));

export const getInProgressPath = (programme: Programme): string =>
  `${getSavePath(programme)}${getSuffix(FileType.IN_PROGRESS, programme)}`;

export const getTrimmedPath = (programme: Programme): string =>
  `${getSavePath(programme)}${getSuffix(FileType.TRIMMED, programme)}`;

export const recordingExists = async (programme: Programme): Promise<boolean> =>
  (
    await Promise.all([
      stat(getInProgressPath(programme)).catch(() => null),
      stat(getSavePath(programme)).catch(() => null)
    ])
  ).some((s) => !!s);

export const renameWithSuffix = async (
  programme: Programme,
  fromSuffix: FileType,
  toSuffix: FileType
): Promise<string> => {
  const from = `${getSavePath(programme)}${getSuffix(fromSuffix, programme)}`;
  const to = `${getSavePath(programme)}${getSuffix(toSuffix, programme)}`;

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

export const renameSuccessful = (programme: Programme): Promise<string> =>
  renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.SUCCESSFUL);

export const renameFailed = (programme: Programme): Promise<string> =>
  renameWithSuffix(programme, FileType.IN_PROGRESS, FileType.FAILED);

export const writeThumbnail = async (
  programme: Programme,
  thumbnailData: Buffer
): Promise<string> => {
  const path = getSavePath(programme);
  const thumbnailPath = `${path}${getSuffix(FileType.THUMBNAIL, programme)}`;

  await writeFile(thumbnailPath, thumbnailData);

  return thumbnailPath;
};

export const writeMetadata = async (
  programme: Programme,
  successful: boolean,
  recording: { start: Date; end: Date }
): Promise<string> => {
  const path = `${getSavePath(programme)}${getSuffix(
    successful ? FileType.SUCCESSFUL : FileType.FAILED,
    programme
  )}`;
  const metadataPath = `${path}${getSuffix(FileType.METADATA, programme)}`;

  logger.debug(`Hashing '${path}'`);
  const hashStartTime = process.hrtime.bigint();
  const sha256 = await hasha.fromFile(path, { algorithm: 'sha256' });
  const hashDuration = process.hrtime.bigint() - hashStartTime;
  logger.info(`'${path}' sha256 hash is: ${sha256}, calculated in ${hashDuration / 1_000_000n} ms`);

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
