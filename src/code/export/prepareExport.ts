import rgbHex from 'rgb-hex';
import { Export, ExportColorGroup, ExportComponentGroup } from '../types';
import { findAllComponentGroups } from '../queries/findAllComponentGroups';
import { findAllColorGroups } from '../queries/findAllColorGroups';
import { findAllNodesWithColor } from '../queries/findAllNodesWithColor';
import { findAllInstanceNodes } from '../queries/findAllInstanceNodes';
import { getFrameSettings } from '../settings/getFrameSettings';
import { getComponentGroupSettings } from '../settings/getComponentGroupSettings';
import { getColorGroupSettings } from '../settings/getColorGroupSettings';
import { getFrameSelection, getColorsByNode } from '../utils/figma';
import { getNameParts } from '../utils/naming';

export async function prepareExport() {
  await figma.loadAllPagesAsync();

  const componentGroups = findAllComponentGroups();
  const colorGroups = await findAllColorGroups();
  const frameSelection = getFrameSelection();
  const queue: ChildrenMixin[] = [frameSelection];

  const exportData: Export = {
    frame: {
      id: frameSelection.id,
      settings: getFrameSettings(frameSelection, [...colorGroups.keys()]),
    },
    components: {},
    colors: {},
  };

  let queueItem;

  for (const [colorGroupName, colorGroup] of colorGroups) {
    const exportColorGroup: ExportColorGroup = (exportData.colors[colorGroupName] = {
      settings: getColorGroupSettings(frameSelection, colorGroupName),
      isUsedByComponents: false,
      collection: {},
    });

    for (const [colorName, color] of colorGroup) {
      const solidPaint = color.paints[0] as SolidPaint;

      exportColorGroup.collection[colorName] = {
        id: color.id,
        name: color.name,
        value: rgbHex(
          Math.round(solidPaint.color.r * 255),
          Math.round(solidPaint.color.g * 255),
          Math.round(solidPaint.color.b * 255),
          solidPaint.opacity === 1 ? undefined : solidPaint.opacity
        ),
      };
    }

    for (const key of colorGroups.keys()) {
      if (typeof exportColorGroup.settings.notEqualTo !== 'object') {
        exportColorGroup.settings.notEqualTo = {};
      }

      exportColorGroup.settings.contrastTo ??= null;
    }
  }

  while ((queueItem = queue.pop())) {
    const allNodesWithColor = await findAllNodesWithColor(queueItem);

    for (let node of allNodesWithColor) {
      const nodeColors = await getColorsByNode(node);

      for (let color of nodeColors.values()) {
        const colorGroupName = getNameParts(color.name).group;

        exportData.colors[colorGroupName].isUsedByComponents = true;
      }
    }

    const allInstanceNodes = await findAllInstanceNodes(queueItem);

    for (let instance of allInstanceNodes) {
      const mainComponent = await instance.getMainComponentAsync();

      if (null === mainComponent) {
        continue;
      }

      const componentGroupName = getNameParts(mainComponent.name).group;

      if (undefined === exportData.components[componentGroupName]) {
        const settings = getComponentGroupSettings(frameSelection, componentGroupName);
        const componentGroup: ExportComponentGroup = (exportData.components[componentGroupName] = {
          settings: {
            ...settings,
            defaults: {},
          },
          collection: {},
          width: 0,
          height: 0,
        });

        for (const [componentName, component] of componentGroups.get(componentGroupName)) {
          componentGroup.width = component.width;
          componentGroup.height = component.height;

          componentGroup.collection[componentName] = {
            id: component.id,
            name: component.name,
          };

          componentGroup.settings.defaults[componentName] = settings.defaults[componentName] ?? true;

          queue.push(component);
        }
      }
    }
  }

  return exportData;
}
