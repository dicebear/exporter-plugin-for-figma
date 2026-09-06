import type { AvatarRecord, AvatarSource } from '@shared/avatarRecord';
import { API_BASE } from './api';

/**
 * What a developer needs to render the same avatar again: the API URL for a
 * collection style, and the JavaScript that draws it locally.
 */

export type ApiFormat = 'svg' | 'png' | 'jpg' | 'webp';

export const API_FORMATS: ApiFormat[] = ['svg', 'png', 'jpg', 'webp'];

/** The largest raster image the API serves. */
const API_MAX_RASTER_SIZE = 256;

/** One option as the API reads it: lists comma separated, weights as `name:weight`. */
function queryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => encodeURIComponent(String(item))).join(',');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([name, weight]) => `${encodeURIComponent(name)}:${encodeURIComponent(String(weight))}`)
      .join(',');
  }

  return encodeURIComponent(String(value));
}

/** The API URL of a collection avatar, null for a style the API does not host. */
export function apiUrl(record: AvatarRecord, format: ApiFormat): string | null {
  if (record.source.kind !== 'collection') {
    return null;
  }

  const params = [`seed=${encodeURIComponent(record.seed)}`];

  if (format !== 'svg') {
    params.push(`size=${Math.min(record.size, API_MAX_RASTER_SIZE)}`);
  }

  for (const [name, value] of Object.entries(record.overrides)) {
    params.push(`${name}=${queryValue(value)}`);
  }

  return `${API_BASE}/${record.source.name}/${format}?${params.join('&')}`;
}

/** The `@dicebear/styles` version a collection record was rendered with, if its id says. */
export function stylesVersion(source: AvatarSource): string | null {
  if (source.kind !== 'collection') {
    return null;
  }

  return /@dicebear\/styles@([^/]+)/.exec(source.version)?.[1] ?? null;
}

function literal(value: unknown, indent: string): string {
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => literal(item, indent)).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    const inner = indent + '  ';
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([name, item]) => `${inner}${key(name)}: ${literal(item, inner)},`,
    );

    return `{\n${entries.join('\n')}\n${indent}}`;
  }

  return String(value);
}

function key(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : literal(name, '');
}

function identifier(name: string): string {
  const camel = name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

  return /^[A-Za-z_$]/.test(camel) ? camel : `style${camel}`;
}

/** The JavaScript that renders the avatar with `@dicebear/core`, in the docs' wording. */
export function codeSnippet(record: AvatarRecord): string {
  const { source } = record;
  const name = source.kind === 'collection' ? identifier(source.name) : 'definition';
  const importLine =
    source.kind === 'collection'
      ? `import ${name} from '@dicebear/styles/${source.name}.json' with { type: 'json' };`
      : `// The definition file you uploaded to the plugin's library.\nimport ${name} from ${literal(`./${source.title}.json`, '')} with { type: 'json' };`;
  const options = literal({ seed: record.seed, ...record.overrides }, '');

  return [
    "import { Style, Avatar } from '@dicebear/core';",
    importLine,
    '',
    `const style = new Style(${name});`,
    `const avatar = new Avatar(style, ${options});`,
    '',
    'const svg = avatar.toString();',
  ].join('\n');
}
