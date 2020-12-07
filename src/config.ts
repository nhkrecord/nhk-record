import yargs from 'yargs';
import defaultConfig from '../config.json';

type Config = {
  assetsUrl: string;
  logFile: string;
  logLevelConsole: 'debug' | 'info' | 'error' | 'none';
  logLevelFile: 'debug' | 'info' | 'error' | 'none';
  matchPattern: Array<string>;
  minimumDuration: number;
  safetyBuffer: number;
  saveDir: string;
  scheduleUrl: string;
  streamUrl: string;
};

const config = yargs(process.argv.slice(2))
  .option('a', {
    alias: 'assets-url',
    describe: 'NHK assets url (for JS & thumbnails)',
    type: 'string'
  })
  .option('b', {
    alias: 'safety-buffer',
    describe: 'Number of extra milliseconds to record before and after scheduled airtime',
    type: 'number'
  })
  .option('c', {
    alias: 'config',
    describe: 'Location of config file',
    config: true,
    type: 'string'
  })
  .option('d', {
    alias: 'save-dir',
    describe: 'Directory in which to save recorded programmes',
    type: 'string'
  })
  .option('f', {
    alias: 'log-file',
    describe: 'Location of log file',
    type: 'string'
  })
  .option('i', {
    alias: 'stream-url',
    describe: 'URL from which to record stream',
    type: 'string'
  })
  .option('k', {
    alias: 'log-level-console',
    describe: 'Logging level to output to console',
    choices: ['debug', 'info', 'error', 'none'],
    type: 'string'
  })
  .option('l', {
    alias: 'log-level-file',
    describe: 'Logging level to output to log file',
    choices: ['debug', 'info', 'error', 'none'],
    type: 'string'
  })
  .option('m', {
    alias: 'match-pattern',
    describe: 'Glob pattern of desired program name (can be used multiple times)',
    type: 'string',
    array: true
  })
  .option('s', {
    alias: 'schedule-url',
    describe: 'NHK schedule API url',
    type: 'string'
  })
  .option('t', {
    alias: 'minimum-duration',
    describe: 'Minimum programme run time to record in milliseconds',
    type: 'number'
  }).argv;

//TODO: validate config
export default ({ ...defaultConfig, ...config } as unknown) as Config;
