// In-memory log storage
const errorLogs: string[] = [];
const consoleLogs: string[] = [];

// Format log entry with timestamp
function formatLogEntry(level: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
  return `[${timestamp}] ${level}: ${message}${dataStr}\n`;
}

// Store log entry in memory
function storeLogEntry(isError: boolean, entry: string): void {
  if (isError) {
    errorLogs.push(entry);
  } else {
    consoleLogs.push(entry);
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
  storeLogEntry(true, entry);
  originalConsoleError(message, error);
}

// Log info function
export function logInfo(message: string, data?: any): void {
  const entry = formatLogEntry('INFO', message, data);
  storeLogEntry(false, entry);
  originalConsoleLog(message, data);
}

// Log warning function
export function logWarn(message: string, data?: any): void {
  const entry = formatLogEntry('WARN', message, data);
  storeLogEntry(false, entry);
  originalConsoleWarn(message, data);
}

// Log debug function
export function logDebug(message: string, data?: any): void {
  const entry = formatLogEntry('DEBUG', message, data);
  storeLogEntry(false, entry);
  originalConsoleDebug(message, data);
}

// Initialize memory logging by overriding console methods
export function initializeMemoryLogging(): void {
  console.log = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('LOG', message);
    storeLogEntry(false, entry);
    originalConsoleLog(...args);
  };

  console.error = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('ERROR', message);
    storeLogEntry(true, entry);
    originalConsoleError(...args);
  };

  console.warn = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('WARN', message);
    storeLogEntry(false, entry);
    originalConsoleWarn(...args);
  };

  console.info = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('INFO', message);
    storeLogEntry(false, entry);
    originalConsoleInfo(...args);
  };

  console.debug = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const entry = formatLogEntry('DEBUG', message);
    storeLogEntry(false, entry);
    originalConsoleDebug(...args);
  };
}


// Dump logs to console on exit
export function dumpLogsToConsole(): void {
  try {
    let hasContent = false;

    // Only dump error logs if they exist
    if (errorLogs.length > 0) {
      hasContent = true;
      originalConsoleError('\n=== ERROR LOGS ===');
      errorLogs.forEach(log => originalConsoleError(log.trim()));
    }

    // Only dump console logs if they exist
    if (consoleLogs.length > 0) {
      hasContent = true;
      originalConsoleError('\n=== CONSOLE LOGS ===');
      consoleLogs.forEach(log => originalConsoleError(log.trim()));
    }

    // Only show end marker if we dumped any content
    if (hasContent) {
      originalConsoleError('=== END LOGS ===\n');
    }
  } catch (error) {
    originalConsoleError('Failed to dump logs:', error);
  }
}