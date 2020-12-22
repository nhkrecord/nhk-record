import { spawn } from 'child_process';
import readline from 'readline';
import config from './config';
import { ExecError } from './error';
import { Readable } from 'stream';
import logger from './logger';

export const sleep = async (sleepMillis: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, sleepMillis));

export const parseDate = (dateString: string): Date => new Date(parseInt(dateString, 10));

export const now = (): number => Date.now() + config.timeOffset;

export const currDate = (): Date => new Date(now());

export const execute = (
  command: string,
  args: Array<string>,
  stdin?: Readable
): Promise<{ stdout: Array<string>; stderr: Array<string> }> => {
  const proc = spawn(command, args);
  return new Promise((resolve, reject) => {
    const stderr: Array<string> = [];
    const stdout: Array<string> = [];

    if (stdin) {
      stdin.pipe(proc.stdin);
    }

    readline.createInterface({ input: proc.stdout }).on('line', (l) => {
      logger.silly(l);
      stdout.push(l);
    });

    readline.createInterface({ input: proc.stderr }).on('line', (l) => {
      logger.silly(l);
      stderr.push(l);
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        return reject(new ExecError(`Non-zero exit code: ${code}`, stdout, stderr));
      }

      resolve({ stderr, stdout });
    });
  });
};
