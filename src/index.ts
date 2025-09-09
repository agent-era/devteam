import {run} from './bootstrap.js';
import {initializeMemoryLogging, logError, dumpLogsToConsole} from './shared/utils/logger.js';
import {commandExists} from './shared/utils/commandExecutor.js';

// Initialize memory logging before running the app
initializeMemoryLogging();

// Proactive check for tmux availability with macOS guidance
try {
  if (!commandExists('tmux')) {
    if (process.platform === 'darwin') {
      // Write directly to stderr to avoid interfering with Ink stdout
      process.stderr.write(
        '\nError: tmux is not installed.\n' +
        'Install it via Homebrew: brew install tmux\n\n'
      );
    } else {
      process.stderr.write(
        '\nError: tmux is not installed. Please install tmux to enable sessions.\n\n'
      );
    }
    process.exit(1);
  }
} catch {
  // Best-effort check; ignore errors
}

// Handle graceful shutdown and dump logs
function handleExit() {
  dumpLogsToConsole();
}

// Register exit handlers
process.on('exit', handleExit);
process.on('SIGINT', () => {
  handleExit();
  process.exit(0);
});
process.on('SIGTERM', () => {
  handleExit();
  process.exit(0);
});

run().catch((err) => {
  logError('Application crashed', err?.stack || err);
  handleExit();
  process.exit(1);
});
