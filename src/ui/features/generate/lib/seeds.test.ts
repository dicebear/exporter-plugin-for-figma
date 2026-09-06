import { describe, expect, it } from 'vitest';
import { listSeeds, randomSeeds, resolveSeeds } from './seeds';

describe('seeds', () => {
  it('draws the same random seeds for the same salt', () => {
    expect(randomSeeds(42, 3)).toEqual(randomSeeds(42, 3));
    expect(randomSeeds(42, 3)).not.toEqual(randomSeeds(43, 3));
    expect(randomSeeds(1, 2)[0]).toMatch(/^[A-Z][a-z]+$/);
    expect(new Set(randomSeeds(1, 80)).size).toBe(80);
  });

  it('reads a list line by line and repeats it', () => {
    expect(listSeeds(' Alice \n\nBob\r\n')).toEqual(['Alice', 'Bob']);
    expect(resolveSeeds({ kind: 'list', text: 'A\nB' }, { count: 3, layerNames: [] })).toEqual(['A', 'B', 'A']);
    expect(resolveSeeds({ kind: 'list', text: '' }, { count: 3, layerNames: [] })).toEqual([]);
  });

  it('numbers and names', () => {
    expect(resolveSeeds({ kind: 'numbered', prefix: 'user-', start: 7 }, { count: 2, layerNames: [] })).toEqual([
      'user-7',
      'user-8',
    ]);
    expect(resolveSeeds({ kind: 'layerNames' }, { count: 2, layerNames: ['Ada', ' '] })).toEqual(['Ada', 'Layer 2']);
  });

  it('falls back to random seeds when inserting with layer names', () => {
    expect(resolveSeeds({ kind: 'layerNames' }, { count: 3, layerNames: [], mode: 'insert' })).toEqual(
      randomSeeds(0, 3),
    );
    expect(resolveSeeds({ kind: 'layerNames' }, { count: 1, layerNames: ['Ada'], mode: 'fill' })).toEqual(['Ada']);
  });
});
