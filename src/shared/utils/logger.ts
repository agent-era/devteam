import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'errors.log');
const CONSOLE_LOG_FILE = path.join(LOG_DIR, 'console.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure log directory exists
function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    // Silent fail - logging shouldn't crash the app
  }
}

// Rotate log file if it gets too large
function rotateLogIfNeeded(logFile: string): void {
  try {
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > MAX_LOG_SIZE) {
        const rotatedFile = `${logFile}.${Date.now()}`;
        fs.renameSync(logFile, rotatedFile);
      }
    }
  } catch (error) {
    // Silent fail
  }
}

// Format log entry with timestamp
function formatLogEntry(level: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
  return `[${timestamp}] ${level}: ${message}${dataStr}\n`;
}

// Write to log file safely
function writeToLog(logFile: string, entry: string): void {
  try {
    ensureLogDir();
    rotateLogIfNeeded(logFile);
    fs.appendFileSync(logFile, entry);
  } catch (error) {
    // Silent fail - logging shouldn't crash the app
  }
}

// Override console methods to also log to files
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

// Log error function
export function logError(message: string, error?: any): void {
  const entry = formatLogEntry('ERROR', message, error);
  writeToLog(ERROR_LOG_FILE, entry);
  originalConsoleError(message, error);
}

// Log info function
export function logInfo(message: string, data?: any): void {
  const entry = formatLogEntry('INFO', message, data);
  writeToLog(CONSOLE_LOG_FILE, entry);
  originalConsoleLog(message, data);
}

// Log warning function
export function logWarn(message: string, data?: any): void {
  const entry = formatLogEntry('WARN', message, data);
  writeToLog(CONSOLE_LOG_FILE, entry);
  originalConsoleWarn(message, data);
}

// Log debug function
export function logDebug(message: string, data?: any): void {
  const entry = formatLogEntry('DEBUG', message, data);
  writeToLog(CONSOLE_LOG_FILE, entry);
  originalConsoleDebug(message, data);
}

// Initialize file logging by overriding console methods
export function initializeFileLogging(): void {
  console.log = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('LOG', message);
    writeToLog(CONSOLE_LOG_FILE, entry);
    originalConsoleLog(...args);
  };

  console.error = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('ERROR', message);
    writeToLog(ERROR_LOG_FILE, entry);
    originalConsoleError(...args);
  };

  console.warn = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('WARN', message);
    writeToLog(CONSOLE_LOG_FILE, entry);
    originalConsoleWarn(...args);
  };

  console.info = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('INFO', message);
    writeToLog(CONSOLE_LOG_FILE, entry);
    originalConsoleInfo(...args);
  };

  console.debug = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('DEBUG', message);
    writeToLog(CONSOLE_LOG_FILE, entry);
    originalConsoleDebug(...args);
  };
}

// Get log file paths for external access
export function getLogPaths(): { errorLog: string; consoleLog: string } {
  return {
    errorLog: ERROR_LOG_FILE,
    consoleLog: CONSOLE_LOG_FILE
  };
}

// Clear log files
export function clearLogs(): void {
  try {
    if (fs.existsSync(ERROR_LOG_FILE)) {
      fs.unlinkSync(ERROR_LOG_FILE);
    }
    if (fs.existsSync(CONSOLE_LOG_FILE)) {
      fs.unlinkSync(CONSOLE_LOG_FILE);
    }
  } catch (error) {
    // Silent fail
  }
}