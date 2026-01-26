import { DefinitionElement } from '../../types';
import { INode } from 'svgson';

export function convertSvgsonToDefinition(node: INode): DefinitionElement {
  const result: DefinitionElement = {
    name: node.name,
    type: node.type,
    value: node.value,
    attributes: { ...node.attributes },
  };

  if (result.attributes) {
    for (const key of Object.keys(result.attributes)) {
      const value = result.attributes[key];

      if (typeof value === 'string') {
        const colorMatch = value.match(/^url\(#color-([a-zA-Z0-9-]+)\)$/);

        if (colorMatch) {
          result.attributes[key] = {
            type: 'color',
            value: colorMatch[1],
          };
        }
      }
    }
  }

  if (result.name === 'use') {
    if (typeof result.attributes?.href === 'string') {
      const componentMatch = result.attributes.href.match(
        /^#component-([a-zA-Z0-9-]+)$/
      );
  
      if (componentMatch) {
        delete result.name;
        delete result.attributes.href;
    
        result.type = 'component';
        result.value = componentMatch[1];
      }
    }
  }

  if (node.children && node.children.length > 0) {
    result.children = node.children.map(convertSvgsonToDefinition);
  }

  return result;
}
