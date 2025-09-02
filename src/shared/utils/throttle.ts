import pThrottle from 'p-throttle';

/**
 * Create a throttled batch runner using p-throttle. Calls within the window are
 * merged via the provided merger and executed at most once per interval.
 */
export function createThrottledBatch<TArgs>(
  intervalMs: number,
  runner: (args: TArgs) => Promise<void>,
  merger: (pending: TArgs[]) => TArgs
) {
  const throttledRunner = pThrottle({limit: 1, interval: intervalMs})(async (args: TArgs) => {
    await runner(args);
  });

  let pending: TArgs[] = [];
  let scheduled = false;

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // Coalesce synchronous bursts into a single merged call, then let p-throttle pace it
    queueMicrotask(async () => {
      scheduled = false;
      const merged = merger(pending);
      pending = [];
      try {
        await (throttledRunner as any)(merged);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[throttle] runner failed:', err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (args: TArgs) => {
    pending.push(args);
    schedule();
  };
}
