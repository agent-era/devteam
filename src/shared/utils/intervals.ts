import {isAppIntervalsEnabled} from '../../config.js';

/**
 * Start a setInterval only when app intervals are enabled. Returns a cleanup function.
 */
export function startIntervalIfEnabled(callback: () => void, delayMs: number): () => void {
  if (!isAppIntervalsEnabled()) return () => {};
  const id = setInterval(callback, delayMs);
  return () => clearInterval(id);
}

/**
 * Start a one-shot setTimeout only when app intervals are enabled. Returns a cleanup function.
 */
export function startTimeoutIfEnabled(callback: () => void, delayMs: number): () => void {
  if (!isAppIntervalsEnabled()) return () => {};
  const id = setTimeout(callback, delayMs);
  return () => clearTimeout(id);
}

/**
 * Invoke a function only if intervals are enabled; otherwise return a fallback value.
 */
export function withIntervalsEnabled<T>(fn: () => T, fallback?: T): T | undefined {
  if (!isAppIntervalsEnabled()) return fallback;
  return fn();
}

