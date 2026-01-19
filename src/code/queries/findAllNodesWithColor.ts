import { getColorsByNode } from '../utils/getColorsByNode';

export async function findAllNodesWithColor(node?: ChildrenMixin) {
  const nodes = (node ?? figma.root).findAll((v) => 'fillStyleId' in v || 'strokeStyleId' in v);

  let result: (SceneNode | PageNode)[] = [];

  for (let v of nodes) {
    const colors = await getColorsByNode(v);

    if (colors.size > 0) {
      result.push(v);
    }
  }

  return result;
}
