import { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import { filterDefaults } from '../utils/filterDefaults';
import sortObject from 'sort-object-keys';
import type { Export } from '../types';

export function createExportJsonSchema(exportData: Export): JSONSchema7 {
  const schemaProperties: Record<string, JSONSchema7Definition> = {};

  // Components
  for (const componentGroupName in exportData.components) {
    if (false === exportData.components.hasOwnProperty(componentGroupName)) {
      continue;
    }

    const componentGroup = exportData.components[componentGroupName];

    schemaProperties[componentGroupName] = {
      type: 'array',
      items: {
        type: 'string',
        enum: Object.keys(componentGroup.collection),
      },
      default: filterDefaults(componentGroup.settings.defaults),
    };

    if (typeof componentGroup.settings.probability === 'number') {
      schemaProperties[`${componentGroupName}Probability`] = {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        default: componentGroup.settings.probability,
      };
    }
  }

  // Colors
  for (const colorGroupName in exportData.colors) {
    if (false === exportData.colors.hasOwnProperty(colorGroupName)) {
      continue;
    }

    const colorGroup = exportData.colors[colorGroupName];

    const propertyValue: JSONSchema7 = {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^(transparent|[a-fA-F0-9]{6})$',
      },
      default: Object.values(colorGroup.collection).map((v) => v.value),
    };

    if (colorGroup.isUsedByComponents) {
      schemaProperties[`${colorGroupName}Color`] = propertyValue;
    }

    if (exportData.frame.settings.backgroundColorGroupName === colorGroupName) {
      schemaProperties[`backgroundColor`] = propertyValue;
    }
  }

  // Schema JSON
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    properties: sortObject(schemaProperties),
  };
}
