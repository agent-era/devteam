import {execFileSync, spawnSync, execFile} from 'child_process';
import {SUBPROCESS_SHORT_TIMEOUT, SUBPROCESS_TIMEOUT, AI_TOOLS} from '../../constants.js';

// Consolidated command executors (sync + async) with options
export function runCommand(
  args: string[],
  opts: { timeout?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): string {
  try {
    const output = execFileSync(args[0], args.slice(1), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? SUBPROCESS_TIMEOUT,
      cwd: opts.cwd,
      env: opts.env ?? process.env,
    });
    return output.trim();
  } catch {
    return '';
  }
}

export function runCommandAsync(
  args: string[],
  opts: { timeout?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile(
        args[0],
        args.slice(1),
        {
          encoding: 'utf8' as any,
          timeout: opts.timeout ?? SUBPROCESS_TIMEOUT,
          cwd: opts.cwd,
          env: opts.env ?? process.env,
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout) => {
          if (err) return resolve('');
          resolve((stdout || '').toString().trim());
        }
      );
    } catch {
      resolve('');
    }
  });
}

}

// Clean environment for tmux commands to fix nvm compatibility
export function getCleanEnvironment(): NodeJS.ProcessEnv {
  const cleanEnv = {...process.env};
  // Remove npm_config_prefix that npm link sets, which conflicts with nvm
  delete cleanEnv.npm_config_prefix;
  return cleanEnv;
}

// Backward-compatible wrappers to reduce duplication
export function runCommandQuick(args: string[], cwd?: string, env?: NodeJS.ProcessEnv): string {
  return runCommand(args, { timeout: SUBPROCESS_SHORT_TIMEOUT, cwd, env });
}

export function runCommandQuickAsync(args: string[], cwd?: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return runCommandAsync(args, { timeout: SUBPROCESS_SHORT_TIMEOUT, cwd, env });
}

export function commandExitCode(args: string[], cwd?: string, env?: NodeJS.ProcessEnv): number {
  const result = spawnSync(args[0], args.slice(1), {cwd, env: env ?? process.env, stdio: 'ignore'});
  return result.status ?? 1;
}

export function runInteractive(cmd: string, args: string[], opts: {cwd?: string} = {}): number {
  // Do not manipulate terminal modes; hand over TTY and return
  const result = spawnSync(cmd, args, {cwd: opts.cwd, stdio: 'inherit'});

  // After returning from an interactive program (e.g., tmux attach),
  // nudge Ink to re-measure and repaint without touching terminal modes.
  try {
    const out: any = process.stdout as any;
    const nudge = () => { try { out?.emit?.('resize'); } catch {} };
    // Microtask, short, and longer delays to handle terminals that settle slowly
    try { Promise.resolve().then(nudge); } catch {}
    setTimeout(nudge, 100);
    setTimeout(nudge, 500);
    // Fallback: shallow remount if still stuck
      } catch {}

  return result.status ?? 0;
}

export function runClaudeSync(prompt: string, cwd?: string): {success: boolean; output: string; error?: string} {
  try {
    const res = spawnSync('claude', ['-p', prompt], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUBPROCESS_TIMEOUT,
    });
    
    if (res.status === 0 && res.stdout) {
      return {
        success: true,
        output: res.stdout.trim()
      };
    }
    
    const errorMessage = res.stderr || `Claude exited with code ${res.status}`;
    return {
      success: false,
      output: '',
      error: errorMessage
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error running Claude';
    return {
      success: false,
      output: '',
      error: errorMessage
    };
  }
}

/**
 * Check if a command exists and is executable
 */
export function commandExists(command: string): boolean {
  try {
    const result = spawnSync('which', [command], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Detect which AI tools are available on the system
 */
export function detectAvailableAITools(): (keyof typeof AI_TOOLS)[] {
  const available: (keyof typeof AI_TOOLS)[] = [];
  
  for (const [tool, config] of Object.entries(AI_TOOLS)) {
    if (commandExists(config.command)) {
      available.push(tool as keyof typeof AI_TOOLS);
    }
  }
  
  return available;
}
