import appRoot from 'app-root-path';
import { join } from 'path';
import yargs from 'yargs';

type Config = {
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
  .option('b', {
    alias: 'safety-buffer',
    describe: 'Number of extra milliseconds to record before and after scheduled airtime',
    type: 'number'
  })
  .option('c', {
    alias: 'config',
    describe: 'Location of config file',
    config: true,
    default: join(appRoot.toString(), 'config.json'),
    type: 'string'
  })
  .option('d', {
    alias: 'save-dir',
    describe: 'Directory in which to save recorded programmes',
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
  .option('t', {
    alias: 'minimum-duration',
    describe: 'Minimum programme run time to record in milliseconds',
    type: 'number'
  }).argv;

//TODO: validate config
export default (config as unknown) as Config;
