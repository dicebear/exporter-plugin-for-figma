import { fastFindAll, isSupportedComponent } from '../utils/figma';

export function findChildrenComponentNodes(node: ChildrenMixin) {
  return fastFindAll(node.children, (v) => v !== undefined && v.type === 'COMPONENT' && isSupportedComponent(v));
}
