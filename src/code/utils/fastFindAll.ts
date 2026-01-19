export function fastFindAll(nodes: readonly BaseNode[], filter: (elem: BaseNode) => boolean) {
  const result: BaseNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (filter(node)) {
      result.push(node);
    } else if ('children' in node) {
      result.push(...fastFindAll(node.children, filter));
    }
  }

  return result;
}

export async function fastFindAllAsync(nodes: readonly BaseNode[], filter: (elem: BaseNode) => Promise<boolean>) {
  const result: BaseNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (await filter(node)) {
      result.push(node);
    } else if ('children' in node) {
      result.push(...(await fastFindAllAsync(node.children, filter)));
    }
  }

  return result;
}
