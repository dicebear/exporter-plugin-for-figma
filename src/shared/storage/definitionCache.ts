import { byteSize, type KeyValueStore } from './KeyValueStore';

/**
 * Definitions fetched from the DiceBear API, kept in the store so a style
 * renders offline and opens without a download the second time. Least
 * recently used entries go first when the budget is spent.
 */

export const CACHE_INDEX_KEY = 'cache:index';
export const CACHE_PREFIX = 'cache:style:';

/** Leaves room for the library within the 5 MB Figma grants a plugin. */
export const CACHE_BUDGET = 3 * 1024 * 1024;

/** How long a cached definition is trusted before the API is asked again. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheEntry = { key: string; bytes: number; lastUsed: number; fetchedAt: number; id: string };
export type CacheIndex = { v: 1; entries: CacheEntry[] };

/** What the store holds per definition: the deflated JSON and where it came from. */
export type CachedDefinition = { id: string; bytes: Uint8Array; fetchedAt: number };

/** How long a hit may keep its old `lastUsed` before the index is written again. */
export const CACHE_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export const cacheKey = (name: string): string => `${CACHE_PREFIX}${name}`;

const queues = new WeakMap<KeyValueStore, Promise<unknown>>();

/**
 * Runs one index read-modify-write at a time per store, so two calls in
 * flight cannot overwrite each other's entry.
 */
function serialized<T>(store: KeyValueStore, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(store) ?? Promise.resolve();
  const next = previous.then(task, task);

  queues.set(
    store,
    next.catch(() => undefined),
  );

  return next;
}

async function readIndex(store: KeyValueStore): Promise<CacheIndex> {
  const raw = (await store.get(CACHE_INDEX_KEY)) as Partial<CacheIndex> | undefined;

  if (raw && raw.v === 1 && Array.isArray(raw.entries)) {
    return { v: 1, entries: raw.entries.filter((e) => typeof e.key === 'string') };
  }

  return { v: 1, entries: [] };
}

async function writeIndex(store: KeyValueStore, index: CacheIndex): Promise<void> {
  await store.set(CACHE_INDEX_KEY, index);
}

export function cacheUsage(index: CacheIndex): number {
  return index.entries.reduce((sum, entry) => sum + entry.bytes, 0);
}

export function cacheGet(store: KeyValueStore, name: string, now = Date.now()): Promise<CachedDefinition | null> {
  return serialized(store, async () => {
    const key = cacheKey(name);
    const value = (await store.get(key)) as CachedDefinition | undefined;

    if (!value || !(value.bytes instanceof Uint8Array)) {
      return null;
    }

    const index = await readIndex(store);
    const entry = index.entries.find((e) => e.key === key);

    if (entry && now - entry.lastUsed > CACHE_TOUCH_INTERVAL_MS) {
      entry.lastUsed = now;
      await writeIndex(store, index);
    }

    return value;
  });
}

/** Whether a cached definition is old enough to ask the API again. */
export function isStale(definition: CachedDefinition, now = Date.now()): boolean {
  return now - definition.fetchedAt > CACHE_MAX_AGE_MS;
}

/**
 * Stores a definition, evicting the least recently used ones until the
 * budget holds it. A store that still rejects (Figma counts differently)
 * gets one more eviction round before the error surfaces.
 */
export function cachePut(
  store: KeyValueStore,
  name: string,
  value: CachedDefinition,
  budget = CACHE_BUDGET,
  now = Date.now(),
): Promise<void> {
  return serialized(store, async () => {
    const key = cacheKey(name);
    const size = byteSize(value.bytes) + value.id.length + 32;
    const index = await readIndex(store);

    index.entries = index.entries.filter((e) => e.key !== key);

    const evict = async () => {
      index.entries.sort((a, b) => a.lastUsed - b.lastUsed);

      const victim = index.entries.shift();

      if (!victim) {
        return false;
      }

      await store.delete(victim.key);

      return true;
    };

    while (cacheUsage(index) + size > budget && (await evict())) {
      // keep evicting
    }

    try {
      await store.set(key, value);
    } catch (error) {
      if (!(await evict())) {
        throw error;
      }

      await store.set(key, value);
    }

    index.entries.push({ key, bytes: size, lastUsed: now, fetchedAt: value.fetchedAt, id: value.id });
    await writeIndex(store, index);
  });
}

/** Drops orphaned entries and keys, so a crash between the two writes heals. */
export function cachePrune(store: KeyValueStore): Promise<void> {
  return serialized(store, async () => {
    const index = await readIndex(store);
    const keys = new Set((await store.keys()).filter((key) => key.startsWith(CACHE_PREFIX)));
    const indexed = new Set(index.entries.map((e) => e.key));

    for (const key of keys) {
      if (!indexed.has(key)) {
        await store.delete(key);
      }
    }

    index.entries = index.entries.filter((e) => keys.has(e.key));
    await writeIndex(store, index);
  });
}
