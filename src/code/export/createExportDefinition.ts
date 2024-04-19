import { DefinitionColors, DefinitionComponents, Export } from '../types';
import { removeEmptyValuesFromObject } from '../utils/removeEmptyValuesFromObject';
import { createTemplateString } from './createTemplateString';
import { sortComponents } from '../utils/sortComponents';
import { sortColors } from '../utils/sortColors';

export async function createExportDefinition(exportData: Export) {
  const size = (figma.getNodeById(exportData.frame.id) as FrameNode).width;
  const components: DefinitionComponents = [];
  const colors: DefinitionColors = [];

  // Collect components
  for (const [componentGroupKey, componentGroupValue] of Object.entries(exportData.components)) {
    const rotation = componentGroupValue.settings.rotation;
    const probability = componentGroupValue.settings.probability;

    const offsetX = componentGroupValue.settings.offsetX;
    const offsetY = componentGroupValue.settings.offsetY;

    const index = components.push({
      name: componentGroupKey,
      rotation: typeof rotation === 'number' ? (rotation === 0 ? [rotation] : [rotation * -1, rotation]) : undefined,
      probability: typeof probability === 'number' ? probability : undefined,
      offset: {
        x: typeof offsetX === 'number' ? (offsetX === 0 ? [offsetX] : [offsetX * -1, offsetX]) : undefined,
        y: typeof offsetY === 'number' ? (offsetY === 0 ? [offsetY] : [offsetY * -1, offsetY]) : undefined,
      },
      values: [],
    });

    for (const [componentKey, componentValue] of Object.entries(componentGroupValue.collection)) {
      const componentNode = figma.getNodeById(componentValue.id) as ComponentNode;
      const componentContent = await createTemplateString(exportData, componentNode);

      components[index - 1].values.push({
        name: componentKey,
        content: componentContent,
        default: componentGroupValue.settings.defaults[componentKey] ?? false,
      });
    }
  }

  // Collect background color
  if (exportData.frame.settings.backgroundColorGroupName) {
    const colorGroup = exportData.colors[exportData.frame.settings.backgroundColorGroupName];

    if (colorGroup) {
      colors.push({
        name: 'background',
        values: Object.values(colorGroup.collection).map((v) => v.value),
      });
    }
  }

  // Collect colors
  for (const [colorGroupKey, colorGroupValue] of Object.entries(exportData.colors)) {
    if (!colorGroupValue.isUsedByComponents) {
      continue;
    }

    const differentFromColor = colorGroupValue.settings.differentFromColor;
    const contrastColor = colorGroupValue.settings.contrastColor;

    colors.push({
      name: colorGroupKey,
      differentFromColor:
        differentFromColor === 'background' ||
        (differentFromColor && exportData.colors[differentFromColor]?.isUsedByComponents)
          ? differentFromColor
          : undefined,
      contrastColor:
        contrastColor === 'background' || (contrastColor && exportData.colors[contrastColor]?.isUsedByComponents)
          ? contrastColor
          : undefined,
      values: Object.values(colorGroupValue.collection).map((v) => v.value),
    });
  }

  // Create definition
  const bodyContent = await createTemplateString(exportData, figma.getNodeById(exportData.frame.id) as FrameNode);

  return JSON.stringify(
    removeEmptyValuesFromObject({
      $schema: 'https://static.dicebear.com/schema/definition.json#',
      $comment:
        'This file was generated by the DiceBear Exporter for Figma. https://www.figma.com/community/plugin/1005765655729342787',
      metadata: {
        license: {
          name: exportData.frame.settings.licenseName,
          url: exportData.frame.settings.licenseUrl,
          content: exportData.frame.settings.licenseContent,
        },
        creator: {
          name: exportData.frame.settings.creator,
          url: exportData.frame.settings.homepage,
        },
        source: {
          name: exportData.frame.settings.sourceTitle,
          url: exportData.frame.settings.source,
        },
        canvas: {
          size: size,
        },
      },
      body: bodyContent,
      attributes: [
        {
          name: 'fill',
          value: 'none',
        },
        {
          name: 'shape-rendering',
          value: exportData.frame.settings.shapeRendering,
        },
      ],
      components: sortComponents(components),
      colors: sortColors(colors),
    }),
    undefined,
    2
  );
}
