import rgbHex from 'rgb-hex';
import { Export, ExportColorGroup, ExportComponentGroup } from '../types';
import { findAllComponentGroups } from '../queries/findAllComponentGroups';
import { findAllColorGroups } from '../queries/findAllColorGroups';
import { getFrameSelection } from '../utils/getFrameSelection';
import { getFrameSettings } from '../settings/getFrameSettings';
import { getComponentGroupSettings } from '../settings/getComponentGroupSettings';
import { getColorGroupSettings } from '../settings/getColorGroupSettings';
import { findAllNodesWithColor } from '../queries/findAllNodesWithColor';
import { getColorsByNode } from '../utils/getColorsByNode';
import { getNameParts } from '../utils/getNameParts';
import { findAllInstanceNodes } from '../queries/findAllInstanceNodes';

export function prepareExport() {
  const componentGroups = findAllComponentGroups();
  const colorGroups = findAllColorGroups();
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
      exportColorGroup.settings.differentFromColor ??= null;
      exportColorGroup.settings.contrastColor ??= null;
    }
  }

  while ((queueItem = queue.pop())) {
    for (let node of findAllNodesWithColor(queueItem)) {
      for (let color of getColorsByNode(node).values()) {
        const colorGroupName = getNameParts(color.name).group;

        exportData.colors[colorGroupName].isUsedByComponents = true;
      }
    }

    for (let instance of findAllInstanceNodes(queueItem)) {
      if (null === instance.mainComponent) {
        continue;
      }

      const componentGroupName = getNameParts(instance.mainComponent.name).group;

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
