import { describe, expect, it } from 'vitest';
import type { DefinitionElement } from '../types';
import { expandUses } from './expandUses';

const path = (attributes: Record<string, string>): DefinitionElement => ({ type: 'element', name: 'path', attributes });
const el = (name: string, attributes: Record<string, string>, children?: DefinitionElement[]): DefinitionElement => ({
  type: 'element',
  name,
  attributes,
  ...(children ? { children } : {}),
});

describe('expandUses', () => {
  it('replaces a use by a copy of the shape, the use attributes inherited and the transforms composed', () => {
    const elements = [
      el('use', {
        href: '#a',
        fill: 'red',
        'stroke-width': '4',
        'clip-path': 'url(#c)',
        transform: 'rotate(8)',
        x: '2',
      }),
      el('defs', {}, [
        path({ d: 'M0 0H10V10Z', id: 'a', 'fill-rule': 'evenodd', transform: 'scale(2)' }),
        el('clipPath', { id: 'c' }, [el('use', { href: '#a' })]),
      ]),
    ];

    expect(expandUses(elements)).toEqual([
      path({
        fill: 'red',
        'stroke-width': '4',
        'clip-path': 'url(#c)',
        d: 'M0 0H10V10Z',
        'fill-rule': 'evenodd',
        transform: 'rotate(8) translate(2 0) scale(2)',
      }),
      el('defs', {}, [
        path({ d: 'M0 0H10V10Z', id: 'a', 'fill-rule': 'evenodd', transform: 'scale(2)' }),
        el('clipPath', { id: 'c' }, [path({ d: 'M0 0H10V10Z', 'fill-rule': 'evenodd', transform: 'scale(2)' })]),
      ]),
    ]);
  });

  it('wraps a copied group and keeps the animations of the use', () => {
    const group = el('g', { id: 'g', opacity: '.5' }, [path({ d: 'M0 0' })]);
    const use: DefinitionElement = { ...el('use', { href: '#g', fill: 'red' }), animations: [] };

    expect(expandUses([use, el('defs', {}, [group])])).toEqual([
      { ...el('g', { fill: 'red' }, [el('g', { opacity: '.5' }, [path({ d: 'M0 0' })])]), animations: [] },
      el('defs', {}, [group]),
    ]);
  });

  it('leaves a use of an unknown id and a component reference alone', () => {
    const elements: DefinitionElement[] = [
      el('use', { href: '#elsewhere' }),
      { type: 'component', name: 'eyes' },
      el('use', { href: '#a' }),
      el('defs', {}, [path({ d: 'M0 0', id: 'a' })]),
    ];

    const result = expandUses(elements);

    expect(result[0]).toEqual(el('use', { href: '#elsewhere' }));
    expect(result[1]).toEqual({ type: 'component', name: 'eyes' });
    expect(result[2]).toEqual(path({ d: 'M0 0' }));
  });
});
