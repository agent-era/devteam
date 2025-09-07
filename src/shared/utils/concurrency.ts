export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        // Log error and continue with other items; leave hole undefined
        // eslint-disable-next-line no-console
        console.error('[mapLimit] worker failed at index', i, '-', err instanceof Error ? err.message : String(err));
        // @ts-expect-error allow undefined to be placed; callers should guard
        results[i] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

