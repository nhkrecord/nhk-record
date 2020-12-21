import yargs from 'yargs';
import defaultConfig from '../config.json';

type inferredConfigType = typeof defaultConfig;
interface Config extends inferredConfigType {
  logLevelConsole: 'debug' | 'info' | 'error' | 'none' | 'silly';
  logLevelFile: 'debug' | 'info' | 'error' | 'none' | 'silly';
}

const config = yargs(process.argv.slice(2))
  .option('a', {
    alias: 'assets-url',
    describe: 'NHK assets url (for JS & thumbnails)',
    type: 'string',
    default: defaultConfig.assetsUrl
  })
  .option('b', {
    alias: 'safety-buffer',
    describe: 'Number of extra milliseconds to record before and after scheduled airtime',
    type: 'number',
    default: defaultConfig.safetyBuffer
  })
  .option('c', {
    alias: 'config',
    describe: 'Location of config file',
    config: true,
    type: 'string'
  })
  .option('C', {
    alias: 'crop',
    describe: [
      'Attempt to automatically detect and crop out breaking news banners',
      '(requires re-encoding) (this uses a lot of memory)'
    ].join(' '),
    type: 'boolean',
    default: defaultConfig.crop
  })
  .option('d', {
    alias: 'save-dir',
    describe: 'Directory in which to save recorded programmes',
    type: 'string',
    default: defaultConfig.saveDir
  })
  .option('f', {
    alias: 'log-file',
    describe: 'Location of log file',
    type: 'string',
    default: defaultConfig.logFile
  })
  .option('i', {
    alias: 'stream-url',
    describe: 'URL from which to record stream',
    type: 'string',
    default: defaultConfig.streamUrl
  })
  .option('j', {
    alias: 'thread-limit',
    describe: 'Maximum threads to use for video processing',
    type: 'number',
    default: defaultConfig.threadLimit
  })
  .option('k', {
    alias: 'log-level-console',
    describe: 'Logging level to output to console',
    choices: ['debug', 'info', 'error', 'none', 'silly'],
    type: 'string',
    default: defaultConfig.logLevelConsole
  })
  .option('K', {
    alias: ['keep-original', 'keep-untrimmed'],
    describe: 'If any post-processing options are enabled, also keep the original copy',
    type: 'boolean',
    default: defaultConfig.keepOriginal
  })
  .option('l', {
    alias: 'log-level-file',
    describe: 'Logging level to output to log file',
    choices: ['debug', 'info', 'error', 'none'],
    type: 'string',
    default: defaultConfig.logLevelFile
  })
  .option('m', {
    alias: 'match-pattern',
    describe: 'Glob pattern of desired program name (can be used multiple times)',
    type: 'string',
    array: true,
    default: defaultConfig.matchPattern
  })
  .option('o', {
    alias: 'time-offset',
    describe: 'Time offset relative to system time in milliseconds (e.g. to handle stream delays)',
    type: 'number',
    default: defaultConfig.timeOffset
  })
  .option('s', {
    alias: 'schedule-url',
    describe: 'NHK schedule API url',
    type: 'string',
    default: defaultConfig.scheduleUrl
  })
  .option('t', {
    alias: 'minimum-duration',
    describe: 'Minimum programme run time to record in milliseconds',
    type: 'number',
    default: defaultConfig.minimumDuration
  })
  .option('T', {
    alias: 'trim',
    describe: 'Attempt to automatically trim video',
    type: 'boolean',
    default: defaultConfig.trim
  }).argv;

//TODO: validate config
export default (config as unknown) as Config;
