import {render} from 'ink';
import React from 'react';
import App from './App.js';
import {reinitializeMemoryLogging} from './shared/utils/logger.js';
import {SESSION_PREFIX} from './constants.js';
import {runCommandQuickAsync, runCommandQuick, getCleanEnvironment} from './shared/utils/commandExecutor.js';


export function run() {
  const {waitUntilExit} = render(<App />);
  
  // Re-initialize logging after Ink's render() to ensure our overrides work
  reinitializeMemoryLogging();
  
  // Best-effort cleanup: ensure workspace sessions are killed on unexpected termination
  const tmuxEnv = getCleanEnvironment();
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return; cleaned = true;
    try {
      const output = await runCommandQuickAsync(['tmux', 'list-sessions', '-F', '#S'], undefined, tmuxEnv);
      if (!output) return;
      const sessions = output.split('\n').filter(Boolean);
      const prefix = `${SESSION_PREFIX}workspace-`;
      for (const s of sessions) {
        if (s.startsWith(prefix)) {
          try { runCommandQuick(['tmux', 'kill-session', '-t', s], undefined, tmuxEnv); } catch {}
        }
      }
    } catch {}
  };
  process.on('SIGINT', () => { cleanup().finally(() => process.exit(0)); });
  process.on('SIGTERM', () => { cleanup().finally(() => process.exit(0)); });
  process.on('uncaughtException', () => { cleanup().finally(() => process.exit(1)); });
  process.on('exit', () => { cleanup().catch(() => {}); });
  
  return waitUntilExit();
}
