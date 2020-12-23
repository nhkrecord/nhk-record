export class ExecError extends Error {
  stdout: string | Array<string>;
  stderr: string | Array<string>;

  constructor(message: string, stdout: string | Array<string>, stderr: string | Array<string>) {
    super(message);
    this.name = 'ExecError';
    this.stdout = stdout;
    this.stderr = stderr;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
