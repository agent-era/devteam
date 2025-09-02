/**
 * Create a throttled batch runner. Calls to the returned function within the
 * window are merged via the provided merger and executed at most once per interval.
 */
export function createThrottledBatch<TArgs>(
  intervalMs: number,
  runner: (args: TArgs) => Promise<void>,
  merger: (pending: TArgs[]) => TArgs
) {
  let last = 0;
  let running = false;
  let timer: NodeJS.Timeout | null = null;
  let queue: TArgs[] = [];

  const mergeQueue = (): TArgs => {
    const merged = merger(queue);
    queue = [];
    return merged;
  };

  const invoke = async (args: TArgs) => {
    last = Date.now();
    running = true;
    try {
      await runner(args);
    } finally {
      running = false;
      if (queue.length > 0) {
        const merged = mergeQueue();
        schedule(merged);
      }
    }
  };

  const schedule = (args: TArgs) => {
    const now = Date.now();
    const delta = now - last;
    if (delta >= intervalMs && !running) {
      // Fire and log any async errors explicitly
      invoke(args).catch(err => {
        // eslint-disable-next-line no-console
        console.error('[throttle] runner failed:', err instanceof Error ? err.message : String(err));
      });
    } else {
      queue.push(args);
      if (!timer) {
        const wait = Math.max(0, intervalMs - delta);
        timer = setTimeout(() => {
          timer = null;
          const merged = mergeQueue();
          invoke(merged).catch(err => {
            // eslint-disable-next-line no-console
            console.error('[throttle] runner failed (timer):', err instanceof Error ? err.message : String(err));
          });
        }, wait);
      }
    }
  };

  return (args: TArgs) => schedule(args);
}
