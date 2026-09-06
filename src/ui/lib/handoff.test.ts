import { describe, expect, it } from 'vitest';
import type { AvatarRecord } from '@shared/avatarRecord';
import { apiUrl, codeSnippet, stylesVersion } from './handoff';

const record: AvatarRecord = {
  v: 1,
  source: {
    kind: 'collection',
    name: 'avataaars-neutral',
    version: 'https://cdn.hopjs.net/npm/@dicebear/styles@11.0.0/dist/avataaars-neutral.min.json',
  },
  seed: 'Kai Ø',
  overrides: { backgroundColor: ['b6e3f4', 'ffd5dc'], eyesProbability: 50, mouth: { smile: 2, default: 1 } },
  size: 256,
  at: 0,
};

describe('apiUrl', () => {
  it('writes lists comma separated and weights as name:weight', () => {
    expect(apiUrl(record, 'svg')).toBe(
      'https://api.dicebear.com/11.x/avataaars-neutral/svg?seed=Kai%20%C3%98&backgroundColor=b6e3f4,ffd5dc&eyesProbability=50&mouth=smile:2,default:1',
    );
  });

  it('adds the size for raster formats only, capped at what the API serves', () => {
    expect(apiUrl(record, 'png')).toContain('/png?seed=Kai%20%C3%98&size=256&');
    expect(apiUrl({ ...record, size: 1024 }, 'webp')).toContain('&size=256&');
    expect(apiUrl({ ...record, size: 128 }, 'jpg')).toContain('&size=128&');
  });

  it('has no URL for a library style', () => {
    expect(apiUrl({ ...record, source: { kind: 'library', id: 'x', title: 'Mine' } }, 'svg')).toBeNull();
  });
});

describe('stylesVersion', () => {
  it('reads the package version out of the definition id', () => {
    expect(stylesVersion(record.source)).toBe('11.0.0');
    expect(stylesVersion({ kind: 'collection', name: 'x', version: 'x' })).toBeNull();
  });
});

describe('codeSnippet', () => {
  it('imports the style from @dicebear/styles and lists the options', () => {
    const code = codeSnippet(record);

    expect(code).toContain(
      "import avataaarsNeutral from '@dicebear/styles/avataaars-neutral.json' with { type: 'json' };",
    );
    expect(code).toContain("seed: 'Kai Ø',");
    expect(code).toContain("backgroundColor: ['b6e3f4', 'ffd5dc'],");
    expect(code).toContain('mouth: {\n    smile: 2,\n    default: 1,\n  },');
  });

  it('points a library style at its own file', () => {
    const code = codeSnippet({ ...record, source: { kind: 'library', id: 'x', title: 'Mine' } });

    expect(code).toContain("import definition from './Mine.json' with { type: 'json' };");
    expect(code).toContain('new Style(definition)');
  });

  it('escapes quotes and backslashes in the library file name', () => {
    const code = codeSnippet({ ...record, source: { kind: 'library', id: 'x', title: "Ann's \\ set" } });

    expect(code).toContain("import definition from './Ann\\'s \\\\ set.json' with { type: 'json' };");
  });
});
