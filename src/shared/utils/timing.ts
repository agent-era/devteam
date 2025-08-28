/**
 * Timing utilities for measuring operation performance
 */

export interface TimingResult {
  duration: number;
  formatted: string;
}

/**
 * Measure execution time of a synchronous function
 */
export function timeSync<T>(operation: () => T, name?: string): T & { timing: TimingResult } {
  const start = performance.now();
  const result = operation();
  const end = performance.now();
  const duration = Math.round(end - start);
  
  const timing: TimingResult = {
    duration,
    formatted: `${duration}ms (sync)`
  };

  return Object.assign(result as any, { timing });
}

/**
 * Measure execution time of an asynchronous function
 */
export async function timeAsync<T>(operation: () => Promise<T>, name?: string): Promise<T & { timing: TimingResult }> {
  const start = performance.now();
  const result = await operation();
  const end = performance.now();
  const duration = Math.round(end - start);
  
  const timing: TimingResult = {
    duration,
    formatted: `${duration}ms (async)`
  };

  return Object.assign(result as any, { timing });
}

/**
 * Simple timer for manual measurement
 */
export class Timer {
  private startTime: number;
  
  constructor() {
    this.startTime = performance.now();
  }
  
  elapsed(): TimingResult {
    const duration = Math.round(performance.now() - this.startTime);
    return {
      duration,
      formatted: `${duration}ms`
    };
  }
  
  restart(): void {
    this.startTime = performance.now();
  }
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}