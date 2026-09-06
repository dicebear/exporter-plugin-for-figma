/**
 * The credit line a style carries, worded the way the DiceBear website words
 * it. CC BY 4.0 asks a remix to say that the work was changed, which is what
 * "Remix of" carries. A faithful port (MIT) says "Based on", and a style
 * DiceBear drew itself credits no one upstream.
 */

export type StyleMeta = {
  creator: { name: string; url: string };
  source: { name: string; url: string };
  license: { name: string; url: string };
};

export type AttributionPart = { text: string; url?: string };

export function normalizeLicense(name: string): 'CC BY 4.0' | 'CC0 1.0' | 'MIT' | 'Other' {
  if (name.includes('CC BY 4.0')) {
    return 'CC BY 4.0';
  }

  if (name.includes('CC0 1.0')) {
    return 'CC0 1.0';
  }

  if (name.includes('MIT')) {
    return 'MIT';
  }

  return 'Other';
}

export function attributionKind(meta: StyleMeta): 'own-work' | 'port' | 'remix' {
  if (meta.creator.name === 'DiceBear') {
    return 'own-work';
  }

  if (!meta.source.name || normalizeLicense(meta.license.name) === 'MIT') {
    return 'port';
  }

  return 'remix';
}

/** The credit as text runs, some of them links. */
export function attributionParts(meta: StyleMeta): AttributionPart[] {
  const kind = attributionKind(meta);
  const parts: AttributionPart[] = [];
  const license = meta.license.name ? { text: meta.license.name, url: meta.license.url || undefined } : null;

  if (kind === 'own-work') {
    parts.push({ text: 'By DiceBear' });
  } else {
    parts.push({ text: kind === 'port' ? 'Based on ' : 'Remix of ' });

    if (meta.source.name) {
      parts.push({ text: `“${meta.source.name}”`, url: meta.source.url || undefined });
    }

    if (meta.creator.name) {
      parts.push({ text: meta.source.name ? ' by ' : 'work by ' });
      parts.push({ text: meta.creator.name, url: meta.creator.url || undefined });
    }
  }

  if (license) {
    parts.push({ text: ', licensed under ' }, license);
  }

  return parts;
}
