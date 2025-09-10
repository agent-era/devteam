import path from 'node:path';

/**
 * Parse configuration once at startup.
 * Priority: CLI args > Environment variable > Current working directory
 */
function parseProjectsDirectory(): string {
  // Check for command line argument --dir or -d
  const args = process.argv.slice(2);
  const dirFlagIndex = args.findIndex(arg => arg === '--dir' || arg === '-d');
  
  if (dirFlagIndex !== -1 && dirFlagIndex + 1 < args.length) {
    const dirPath = args[dirFlagIndex + 1];
    return path.resolve(dirPath);
  }
  
  // Check for environment variable
  if (process.env.PROJECTS_DIR) {
    return path.resolve(process.env.PROJECTS_DIR);
  }
  
  // Default to current working directory
  return process.cwd();
}

// Compute configuration once on startup
export const PROJECTS_DIRECTORY = parseProjectsDirectory();

/**
 * Get the configured projects directory
 */
export function getProjectsDirectory(): string {
  return PROJECTS_DIRECTORY;
}

/**
 * Whether periodic app intervals (auto-refresh timers) should run.
 * Centralized here to avoid scattering environment checks.
 */
export function isAppIntervalsEnabled(): boolean {
  return process.env.NO_APP_INTERVALS !== '1';
}
