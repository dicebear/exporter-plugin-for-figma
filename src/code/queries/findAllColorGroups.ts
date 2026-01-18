import { getNameParts } from '../utils/getNameParts';
import { isSupportedColor } from '../utils/isSupportedColor';

export async function findAllColorGroups() {
  const colorGroups = new Map<string, Map<string, PaintStyle>>();
  const paintStyles = await figma.getLocalPaintStylesAsync();

  for (const paintStyle of paintStyles) {
    if (false === isSupportedColor(paintStyle)) {
      continue;
    }

    const { group: colorGroupName, name: colorName } = getNameParts(paintStyle.name);

    if (false === colorGroups.has(colorGroupName)) {
      colorGroups.set(colorGroupName, new Map());
    }

    colorGroups.get(colorGroupName)?.set(colorName, paintStyle);
  }

  return colorGroups;
}
