import type { INode } from 'svgson';

export function mapSvgsonNodes(node: INode, cb: (value: INode) => INode): INode {
  const result = cb({ ...node });

  if (result.children) {
    result.children = node.children.map((child) => mapSvgsonNodes(child, cb));
  }

  return result;
}
