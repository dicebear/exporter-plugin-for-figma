import { cleanSvg } from '@shared/cleanSvg';
import { errorMessage } from '@shared/errors';
import { toDataUri } from './render/renderAvatar';

/** The hosted DiceBear API, which serves the collection the plugin offers. */
export const API_BASE = 'https://api.dicebear.com/11.x';

/** The seed every catalog preview uses, the same face the documentation shows. */
export const PREVIEW_SEED = 'Felix';

const FETCH_TIMEOUT_MS = 15000;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(FETCH_TIMEOUT_MS);
}

function describeFailure(name: string, error: unknown): Error {
  const reason = errorMessage(error);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return new Error(
    offline ? `Could not load ${name}: you appear to be offline.` : `Could not load ${name} (${reason}).`,
  );
}

export async function fetchStyleNames(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE}/`, { signal: timeoutSignal() });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = (await response.json()) as { styles?: unknown };

    if (!Array.isArray(body.styles)) {
      throw new Error('unexpected response');
    }

    return body.styles.filter((name): name is string => typeof name === 'string');
  } catch (error) {
    throw describeFailure('the style list', error);
  }
}

/**
 * The definition of a collection style as text. The API caches for a long
 * time, so a refresh asks the browser to revalidate instead of trusting its
 * copy.
 */
export async function fetchDefinitionText(name: string, refresh = false): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/${name}/definition.json`, {
      signal: timeoutSignal(),
      cache: refresh ? 'no-cache' : 'default',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    throw describeFailure(name, error);
  }
}

export function thumbnailUrl(name: string, size = 64): string {
  return `${API_BASE}/${name}/svg?seed=${encodeURIComponent(PREVIEW_SEED)}&size=${size}`;
}

/**
 * A catalog preview as an SVG data URI, so it can be kept in the store and
 * stays crisp at any zoom. The renderer's metadata block only adds weight.
 */
export async function fetchThumbnail(name: string, size = 64): Promise<string> {
  const response = await fetch(thumbnailUrl(name, size), { signal: timeoutSignal() });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return toDataUri(cleanSvg(await response.text()));
}
