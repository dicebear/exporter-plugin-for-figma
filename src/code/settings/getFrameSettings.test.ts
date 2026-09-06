import { describe, expect, it } from 'vitest';
import { getFrameSettings } from './getFrameSettings';

function frameWith(settings: Record<string, unknown>): FrameNode {
  return { getPluginData: () => JSON.stringify(settings) } as unknown as FrameNode;
}

describe('getFrameSettings', () => {
  it('reads the precision an early plugin version stored as a string', () => {
    expect(getFrameSettings(frameWith({ precision: '2' }), []).precision).toBe(2);
    expect(getFrameSettings(frameWith({ precision: '0' }), []).precision).toBe(0);
  });

  it('keeps a numeric precision and clamps it to the field range', () => {
    expect(getFrameSettings(frameWith({ precision: 1 }), []).precision).toBe(1);
    expect(getFrameSettings(frameWith({ precision: 12 }), []).precision).toBe(8);
    expect(getFrameSettings(frameWith({ precision: -1 }), []).precision).toBe(0);
  });

  it('falls back to the default when the value is unusable', () => {
    expect(getFrameSettings(frameWith({}), []).precision).toBe(3);
    expect(getFrameSettings(frameWith({ precision: '' }), []).precision).toBe(3);
    expect(getFrameSettings(frameWith({ precision: 'abc' }), []).precision).toBe(3);
    expect(getFrameSettings(frameWith({ precision: 1.5 }), []).precision).toBe(3);
  });

  it('drops the keys an older version stored and the new one no longer needs', () => {
    const data = getFrameSettings(frameWith({ dicebearVersion: '10.x', title: 'Lorelei' }), []);

    expect(data.title).toBe('Lorelei');
    expect('dicebearVersion' in data).toBe(false);
  });
});
