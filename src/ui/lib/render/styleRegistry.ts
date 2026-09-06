import { OptionsDescriptor, Style } from '@dicebear/core';
import type { Descriptor } from './descriptor';
import { sourceTitle, type AvatarSource } from '@shared/avatarRecord';
import { forgetRenders } from './renderAvatar';

export type StyleKey = string;

export type StyleEntry = {
  key: StyleKey;
  source: AvatarSource;
  title: string;
  style: Style;
  descriptor: Descriptor;
  license: { name: string; url: string };
  creator: { name: string; url: string };
  sourceMeta: { name: string; url: string };
  animated: boolean;
  componentCount: number;
  /** Whether the style draws text, which is what the font options act on. */
  usesText: boolean;
};

const entries = new Map<StyleKey, StyleEntry>();

/** Whether any element of the definition, nested groups included, is text. */
function drawsText(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(drawsText);
  }

  if (!node || typeof node !== 'object') {
    return false;
  }

  const record = node as Record<string, unknown>;

  return record.type === 'text' || Object.values(record).some(drawsText);
}

export const collectionKey = (name: string): StyleKey => `collection:${name}`;
export const libraryKey = (id: string): StyleKey => `library:${id}`;

export function styleKeyOf(source: AvatarSource): StyleKey {
  return source.kind === 'collection' ? collectionKey(source.name) : libraryKey(source.id);
}

export function parseStyleKey(key: StyleKey): { kind: AvatarSource['kind']; id: string } | null {
  const index = key.indexOf(':');

  if (index === -1) {
    return null;
  }

  const kind = key.slice(0, index);

  if (kind !== 'collection' && kind !== 'library') {
    return null;
  }

  return { kind, id: key.slice(index + 1) };
}

/**
 * Keeps a parsed style per key. Every definition runs through the schema
 * check in `Style`, whether it came from the API or the user.
 */
export function registerStyle(source: AvatarSource, definition: unknown, options: { title?: string } = {}): StyleEntry {
  const key = styleKeyOf(source);
  const style = new Style(definition as never);
  const meta = style.meta();
  const entry: StyleEntry = {
    key,
    source,
    title: options.title ?? sourceTitle(source),
    style,
    descriptor: new OptionsDescriptor(style).toJSON(),
    license: { name: meta.license().name() ?? '', url: meta.license().url() ?? '' },
    creator: { name: meta.creator().name() ?? '', url: meta.creator().url() ?? '' },
    sourceMeta: { name: meta.source().name() ?? '', url: meta.source().url() ?? '' },
    animated: style.hasAnimations(),
    componentCount: style.components().size,
    usesText: drawsText(style.definition()),
  };

  entries.set(key, entry);

  return entry;
}

export function getStyle(key: StyleKey | null): StyleEntry | undefined {
  return key ? entries.get(key) : undefined;
}

export function forgetStyle(key: StyleKey): void {
  entries.delete(key);
  forgetRenders(key);
}
