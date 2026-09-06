export type SeedStrategy =
  | { kind: 'random'; salt: number; picks?: Record<number, string> }
  | { kind: 'layerNames' }
  | { kind: 'list'; text: string }
  | { kind: 'numbered'; prefix: string; start: number };

/**
 * First names from around the world for random seeds, so a layer reads
 * "Lorelei · Mila" instead of a hash. Once the pool runs out, a number keeps
 * the seeds apart.
 */
const NAMES = [
  'Ada',
  'Aiko',
  'Amara',
  'Aneka',
  'Ayla',
  'Bao',
  'Bruno',
  'Chiara',
  'Dara',
  'Diego',
  'Elif',
  'Emil',
  'Enzo',
  'Esme',
  'Felix',
  'Freya',
  'Hugo',
  'Idris',
  'Ines',
  'Isla',
  'Jonas',
  'Juno',
  'Kai',
  'Kira',
  'Lena',
  'Leo',
  'Liam',
  'Luca',
  'Luna',
  'Mateo',
  'Mila',
  'Milo',
  'Nadia',
  'Nia',
  'Noor',
  'Nova',
  'Oscar',
  'Pia',
  'Ravi',
  'Remy',
  'Rosa',
  'Sami',
  'Sana',
  'Sasha',
  'Selin',
  'Tariq',
  'Theo',
  'Tomas',
  'Vera',
  'Yara',
  'Yuki',
  'Zara',
  'Zoe',
];

/** A small deterministic generator, so a preview shows the seeds a job uses. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;

    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSalt(): number {
  const buffer = new Uint32Array(1);

  crypto.getRandomValues(buffer);

  return buffer[0];
}

export function randomSeeds(salt: number, count: number): string[] {
  const next = mulberry32(salt);
  const pool = [...NAMES];
  const seeds: string[] = [];

  // A shuffled pass through the names, then the same names numbered.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));

    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  for (let index = 0; index < count; index++) {
    const round = Math.floor(index / pool.length);
    const name = pool[index % pool.length];

    seeds.push(round === 0 ? name : `${name} ${round + 1}`);
  }

  return seeds;
}

/** A name the current seeds do not use yet, numbered once the pool is spent. */
export function freshSeed(current: string[]): string {
  const used = new Set(current);
  const free = NAMES.filter((name) => !used.has(name));

  if (free.length > 0) {
    return free[Math.floor((randomSalt() / 4294967296) * free.length)];
  }

  const name = NAMES[Math.floor((randomSalt() / 4294967296) * NAMES.length)];
  let round = 2;

  while (used.has(`${name} ${round}`)) {
    round++;
  }

  return `${name} ${round}`;
}

export function listSeeds(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The seeds a job renders, in target order. For fills `count` is the number
 * of targets, for inserts the number the user asked for.
 */
export function resolveSeeds(
  strategy: SeedStrategy,
  context: { count: number; layerNames: string[]; mode?: 'fill' | 'insert' },
): string[] {
  const count = Math.max(0, Math.floor(context.count));

  if (strategy.kind === 'layerNames' && context.mode === 'insert') {
    return randomSeeds(0, count);
  }

  switch (strategy.kind) {
    case 'random': {
      const seeds = randomSeeds(strategy.salt, count);

      for (const [index, seed] of Object.entries(strategy.picks ?? {})) {
        if (Number(index) < seeds.length) {
          seeds[Number(index)] = seed;
        }
      }

      return seeds;
    }
    case 'layerNames':
      return context.layerNames.slice(0, count).map((name, index) => name.trim() || `Layer ${index + 1}`);
    case 'list': {
      const seeds = listSeeds(strategy.text);

      return seeds.length === 0 ? [] : Array.from({ length: count }, (_, index) => seeds[index % seeds.length]);
    }
    case 'numbered':
      return Array.from({ length: count }, (_, index) => `${strategy.prefix}${strategy.start + index}`);
  }
}
