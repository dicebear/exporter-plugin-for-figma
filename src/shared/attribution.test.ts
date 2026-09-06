import { describe, expect, it } from 'vitest';
import { attributionParts, type StyleMeta } from './attribution';

const meta = (creator: string, source: string, license: string) => ({
  creator: { name: creator, url: 'https://c' },
  source: { name: source, url: 'https://s' },
  license: { name: license, url: 'https://l' },
});

const text = (value: StyleMeta) =>
  attributionParts(value)
    .map((part) => part.text)
    .join('');

describe('attribution', () => {
  it('calls a CC BY style a remix and links its parts', () => {
    const parts = attributionParts(meta('Lisa', 'Lorelei', 'CC BY 4.0'));

    expect(text(meta('Lisa', 'Lorelei', 'CC BY 4.0'))).toBe('Remix of “Lorelei” by Lisa, licensed under CC BY 4.0');
    expect(parts.filter((part) => part.url).map((part) => part.url)).toEqual(['https://s', 'https://c', 'https://l']);
  });

  it('calls an MIT style a port', () => {
    expect(text(meta('Bootstrap', 'Bootstrap Icons', 'MIT'))).toBe(
      'Based on “Bootstrap Icons” by Bootstrap, licensed under MIT',
    );
  });

  it('credits no one upstream for own work', () => {
    expect(text(meta('DiceBear', 'Thumbs', 'CC0 1.0'))).toBe('By DiceBear, licensed under CC0 1.0');
  });

  it('copes with a missing source title', () => {
    expect(text(meta('Pablo', '', 'Free for personal and commercial use'))).toBe(
      'Based on work by Pablo, licensed under Free for personal and commercial use',
    );
  });
});
