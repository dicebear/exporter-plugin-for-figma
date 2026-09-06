import { FrameSettings } from '../types';

const DEFAULTS: FrameSettings = {
  title: '',
  creator: '',
  homepage: '',
  sourceTitle: '',
  source: '',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  licenseText: '',
  shapeRendering: 'auto',
  backgroundColorGroupName: '',
  precision: 3,
};

/** The range the precision field offers. */
const MIN_PRECISION = 0;
const MAX_PRECISION = 8;

/**
 * The precision a file stores. Early plugin versions bound the field to a
 * plain text input and wrote the value as a string, so `"2"` counts as much
 * as `2`. Anything that is not a whole number in range keeps the default.
 */
function readPrecision(value: unknown): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (typeof number !== 'number' || !Number.isInteger(number)) {
    return DEFAULTS.precision;
  }

  return Math.max(MIN_PRECISION, Math.min(MAX_PRECISION, number));
}

/**
 * The settings stored on the avatar frame. Only the known keys are read, so a
 * file written by an older plugin version drops what it no longer needs, such
 * as the DiceBear version or the npm package fields, on the next write.
 */
export function getFrameSettings(frame: FrameNode, colorGroups: string[]): FrameSettings {
  const stored = JSON.parse(frame.getPluginData(`settings`) || '{}') as Partial<Record<keyof FrameSettings, unknown>>;
  const data: FrameSettings = { ...DEFAULTS };

  for (const key of Object.keys(DEFAULTS) as (keyof FrameSettings)[]) {
    const value = stored[key];

    if (typeof value === typeof DEFAULTS[key]) {
      (data as Record<keyof FrameSettings, unknown>)[key] = value;
    }
  }

  data.precision = readPrecision(stored.precision);

  if (!data.title) {
    data.title = 'My Avatar Style';
  }

  if (false === colorGroups.includes(data.backgroundColorGroupName)) {
    data.backgroundColorGroupName = '';
  }

  return data;
}
