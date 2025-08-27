import {run} from './app.js';
import {initializeFileLogging, logError} from './shared/utils/logger.js';

// Initialize file logging before running the app
initializeFileLogging();

run().catch((err) => {
  logError('Application crashed', err?.stack || err);
  process.exit(1);
});
