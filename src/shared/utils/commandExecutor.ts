import {execFileSync, spawnSync, execFile} from 'child_process';
import {SUBPROCESS_SHORT_TIMEOUT, SUBPROCESS_TIMEOUT} from '../../constants.js';

export function runCommand(args: string[], opts: {timeout?: number; cwd?: string} = {}): string {
  try {
    const output = execFileSync(args[0], args.slice(1), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? SUBPROCESS_TIMEOUT,
      cwd: opts.cwd,
    });
    return output.trim();
  } catch (e) {
    return '';
  }
}

export function runCommandQuick(args: string[], cwd?: string): string {
  try {
    const output = execFileSync(args[0], args.slice(1), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUBPROCESS_SHORT_TIMEOUT,
      cwd,
    });
    return output.trim();
  } catch {
    return '';
  }
}

export function runCommandAsync(args: string[], opts: {timeout?: number; cwd?: string} = {}): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile(args[0], args.slice(1), {
        encoding: 'utf8' as any,
        timeout: opts.timeout ?? SUBPROCESS_TIMEOUT,
        cwd: opts.cwd,
        maxBuffer: 10 * 1024 * 1024,
      }, (err, stdout) => {
        if (err) return resolve('');
        resolve((stdout || '').toString().trim());
      });
    } catch {
      resolve('');
    }
  });
}

export function runCommandQuickAsync(args: string[], cwd?: string): Promise<string> {
  return runCommandAsync(args, {timeout: SUBPROCESS_SHORT_TIMEOUT, cwd});
}

export function commandExitCode(args: string[], cwd?: string): number {
  const result = spawnSync(args[0], args.slice(1), {cwd, stdio: 'ignore'});
  return result.status ?? 1;
}

export function runInteractive(cmd: string, args: string[], opts: {cwd?: string} = {}): number {
  const result = spawnSync(cmd, args, {cwd: opts.cwd, stdio: 'inherit'});
  return result.status ?? 0;
}