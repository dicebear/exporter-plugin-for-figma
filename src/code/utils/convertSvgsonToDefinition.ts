import { DefinitionElement } from '../types';
import { INode } from 'svgson';

export function convertSvgsonToDefinition(node: INode): DefinitionElement {
  if (node.type === 'text') {
    return {
      name: '#text',
      value: node.value,
    };
  }

  const result: DefinitionElement = {
    name: node.name,
    attributes: node.attributes,
  };

  if (node.children && node.children.length > 0) {
    result.children = node.children.map(convertSvgsonToDefinition);
  }

  return result;
}
