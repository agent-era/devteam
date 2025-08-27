import {run} from './app.js';
import {initializeFileLogging, logError, dumpLogsToConsole} from './shared/utils/logger.js';

// Initialize file logging before running the app
initializeFileLogging();

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
