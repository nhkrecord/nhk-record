import { createLogger, format, transports } from 'winston';
import config from './config';

const { combine, timestamp, align, printf } = format;

const logger = createLogger({
  format: combine(
    timestamp(),
    align(),
    printf((info) => `[${info.timestamp}] [${info.level}] ${info.message}`)
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
      filename: config.logFile
    })
  );
}

export default logger;
