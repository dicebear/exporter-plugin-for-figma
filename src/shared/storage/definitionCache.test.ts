import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from './KeyValueStore';
import { CACHE_INDEX_KEY, cacheGet, cachePrune, cachePut, cacheKey, isStale } from './definitionCache';

const bytes = (n: number) => new Uint8Array(n);
const def = (n: number, id = 'x') => ({ id, bytes: bytes(n), fetchedAt: 0 });

describe('definitionCache', () => {
  it('round-trips a definition', async () => {
    const store = new MemoryKeyValueStore();

    await cachePut(store, 'lorelei', def(10, 'v1'));

    const hit = await cacheGet(store, 'lorelei');

    expect(hit?.id).toBe('v1');
    expect(hit?.bytes.byteLength).toBe(10);
    expect(await cacheGet(store, 'bottts')).toBeNull();
  });

  it('evicts the least recently used entry when the budget is spent', async () => {
    const store = new MemoryKeyValueStore();
    const budget = 300;

    await cachePut(store, 'a', def(100), budget, 1);
    await cachePut(store, 'b', def(100), budget, 2);
    await cacheGet(store, 'a', 3 + 60 * 60 * 1000 + 1);
    await cachePut(store, 'c', def(100), budget, 4 + 60 * 60 * 1000);

    expect(await store.get(cacheKey('a'))).toBeDefined();
    expect(await store.get(cacheKey('b'))).toBeUndefined();
    expect(await store.get(cacheKey('c'))).toBeDefined();
  });

  it('retries once after the store rejects for quota', async () => {
    const store = new MemoryKeyValueStore();

    store.quota = 330;
    await cachePut(store, 'a', def(100), 10_000, 1);
    await cachePut(store, 'b', def(100), 10_000, 2);

    expect(await store.get(cacheKey('a'))).toBeUndefined();
    expect(await store.get(cacheKey('b'))).toBeDefined();
  });

  it('prunes orphans in both directions', async () => {
    const store = new MemoryKeyValueStore();

    await cachePut(store, 'a', def(10));
    await store.set(cacheKey('orphan'), def(10));
    await store.delete(cacheKey('a'));
    await cachePrune(store);

    expect(await store.keys()).toEqual([CACHE_INDEX_KEY]);
  });

  it('keeps both index entries when a get and a put overlap', async () => {
    const store = new MemoryKeyValueStore();
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    // The bridge waits a round trip and hands back copies, not the objects.
    const copy = (key: string, value: unknown) =>
      key === CACHE_INDEX_KEY && value !== undefined ? JSON.parse(JSON.stringify(value)) : value;

    store.get = async (key) => {
      await settle();

      return copy(key, store.data.get(key));
    };
    store.set = async (key, value) => {
      await settle();
      store.data.set(key, copy(key, value));
    };

    await cachePut(store, 'a', def(10), 10_000, 1);

    const hour = 60 * 60 * 1000;

    await Promise.all([cacheGet(store, 'a', hour + 2), cachePut(store, 'b', def(10), 10_000, hour + 3)]);

    const index = (await store.get(CACHE_INDEX_KEY)) as { entries: { key: string; lastUsed: number }[] };

    expect(index.entries.map((e) => [e.key, e.lastUsed])).toEqual([
      [cacheKey('a'), hour + 2],
      [cacheKey('b'), hour + 3],
    ]);
  });

  it('knows when a definition is stale', () => {
    expect(isStale({ id: 'x', bytes: bytes(1), fetchedAt: 0 }, 1000)).toBe(false);
    expect(isStale({ id: 'x', bytes: bytes(1), fetchedAt: 0 }, 8 * 24 * 3600 * 1000)).toBe(true);
  });
});
