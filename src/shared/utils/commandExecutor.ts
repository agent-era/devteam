import {execFileSync, spawnSync, execFile, spawn} from 'child_process';
import {SUBPROCESS_SHORT_TIMEOUT, SUBPROCESS_TIMEOUT, CLAUDE_TIMEOUT, AI_TOOLS} from '../../constants.js';

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
  // In terminal E2E, allow simulation without actually spawning the command
  if (process.env.E2E_SIMULATE_TMUX_ATTACH === '1') {
    return 0;
  }

  // Simply run the interactive command inheriting stdio.
  const result = spawnSync(cmd, args, {cwd: opts.cwd, stdio: 'inherit'});
  return result.status ?? 0;
}

export function runClaudeAsync(
  prompt: string,
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<{success: boolean; output: string; error?: string}> {
  return new Promise((resolve) => {
    const timeoutMs = opts.timeoutMs ?? CLAUDE_TIMEOUT;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('claude', ['-p', prompt], {
        cwd: opts.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error running Claude';
      resolve({success: false, output: '', error: msg});
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch {}
      resolve({success: false, output: '', error: `Claude timed out after ${timeoutMs}ms`});
    }, timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({success: false, output: '', error: err.message});
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && stdout) {
        resolve({success: true, output: stdout.trim()});
      } else {
        resolve({success: false, output: '', error: stderr.trim() || `Claude exited with code ${code}`});
      }
    });
  });
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
