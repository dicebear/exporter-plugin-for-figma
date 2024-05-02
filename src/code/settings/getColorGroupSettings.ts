import { ColorGroupSettings } from '../types';

export function getColorGroupSettings(frame: FrameNode, colorGroup: string): ColorGroupSettings {
  return {
    notEqualTo: {},
    contrastTo: '',
    ...JSON.parse(frame.getPluginData(`colors/${colorGroup}/settings`) || '{}'),
  };
}
