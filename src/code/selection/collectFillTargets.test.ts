import { describe, expect, it } from 'vitest';
import { collectFillTargets, type FillCandidate } from './collectFillTargets';

function node(type: string, id: string, extra: Partial<FillCandidate> = {}): FillCandidate {
  return { id, name: id, type, width: 10, height: 10, locked: false, ...extra };
}

describe('collectFillTargets', () => {
  it('keeps shapes and frames, drops text', () => {
    const targets = collectFillTargets([node('RECTANGLE', 'a'), node('TEXT', 'b'), node('FRAME', 'c')]);

    expect(targets.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('flattens groups to their fillable children', () => {
    const group = node('GROUP', 'g', { children: [node('ELLIPSE', 'e'), node('TEXT', 't')] });

    expect(collectFillTargets([group]).map((t) => t.id)).toEqual(['e']);
  });

  it('looks through nested groups but not into a fillable frame', () => {
    const frame = node('FRAME', 'f', { children: [node('VECTOR', 'v')] });
    const group = node('GROUP', 'g', { children: [node('GROUP', 'inner', { children: [frame] })] });

    expect(collectFillTargets([group]).map((t) => t.id)).toEqual(['f']);
  });

  it('reports locked nodes instead of filtering them', () => {
    expect(collectFillTargets([node('RECTANGLE', 'a', { locked: true })])[0].locked).toBe(true);
  });

  it('lists a node once even when selected twice through a group', () => {
    const rect = node('RECTANGLE', 'a');
    const group = node('GROUP', 'g', { children: [rect] });

    expect(collectFillTargets([rect, group])).toHaveLength(1);
  });
});
