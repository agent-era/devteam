/**
 * Create a throttled batch runner without external deps.
 * Calls within the same tick are merged, and executions are spaced
 * at least `intervalMs` apart. Errors are logged and do not break the queue.
 */
export function createThrottledBatch<TArgs>(
  intervalMs: number,
  runner: (args: TArgs) => Promise<void>,
  merger: (pending: TArgs[]) => TArgs
) {
  let pending: TArgs[] = [];
  let scheduled = false;
  let lastRunAt = 0;
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (args: TArgs) => {
    chain = chain.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, lastRunAt + intervalMs - now);
      if (waitMs > 0) await new Promise(res => setTimeout(res, waitMs));
      await runner(args);
      lastRunAt = Date.now();
    }).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[throttle] runner failed:', err instanceof Error ? err.message : String(err));
    });
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (pending.length === 0) return;
      const merged = merger(pending);
      pending = [];
      enqueue(merged);
    });
  };

  return (args: TArgs) => {
    pending.push(args);
    schedule();
  };
}

