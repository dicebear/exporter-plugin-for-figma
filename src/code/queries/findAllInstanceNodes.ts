import { fastFindAllAsync } from '../utils/fastFindAll';
import { isSupportedComponent } from '../utils/isSupportedComponent';

export async function findAllInstanceNodes(node?: ChildrenMixin): Promise<InstanceNode[]> {
  return (await fastFindAllAsync((node ?? figma.root).children, async (v) => {
    if (v === undefined || v.type !== 'INSTANCE') {
      return false;
    }

    const mainComponent = await v.getMainComponentAsync();

    return null !== mainComponent && isSupportedComponent(mainComponent);
  })) as InstanceNode[];
}
