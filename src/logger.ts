import { createLogger, format, transports } from 'winston';
import config from './config';

const { combine, timestamp, align, printf, metadata } = format;

const logger = createLogger({
  format: combine(
    metadata(),
    timestamp(),
    align(),
    printf((info) =>
      [
        `[${info.timestamp}]`,
        `[${info.level}]`,
        info.message,
        Object.keys(info.metadata).length ? `\n${JSON.stringify(info.metadata, null, 2)}` : ''
      ]
        .join(' ')
        .trim()
    )
  )
});

if (config.logLevelConsole !== 'none') {
  logger.add(
    new transports.Console({
      level: config.logLevelConsole
    })
  );
}

if (config.logFile && config.logLevelFile !== 'none') {
  logger.add(
    new transports.File({
      level: config.logLevelFile,
      filename: config.logFile,
      maxsize: 1024 * 1024 * 5,
      maxFiles: 10,
      tailable: true,
      zippedArchive: true
    })
  );
}

export default logger;
