import type { GenerateLayout, SelectionInfo } from '@shared/messages';
import { gridSize, type Point } from './layoutGrid';

export type Placement = { origin: Point; parent: BaseNode & ChildrenMixin };

/**
 * Where a batch of inserted avatars goes: below the selection when there is
 * one, otherwise centred in the viewport. The parent is the page, or the
 * section the selection sits in, so the avatars stay with their neighbours.
 */
export function resolvePlacement(
  count: number,
  layout: GenerateLayout,
  anchor: 'selection' | 'viewport',
  bounds: SelectionInfo['bounds'],
): Placement {
  const selection = figma.currentPage.selection;

  if (anchor === 'selection' && bounds) {
    const first = selection[0];
    const parent = first && first.parent && first.parent.type === 'SECTION' ? first.parent : figma.currentPage;
    const origin = { x: bounds.x, y: bounds.y + bounds.height + layout.gap };

    // Children of a section are positioned relative to it, and sections never rotate.
    if (parent.type === 'SECTION') {
      origin.x -= parent.absoluteTransform[0][2];
      origin.y -= parent.absoluteTransform[1][2];
    }

    return { origin, parent };
  }

  const size = gridSize(count, layout);
  const center = figma.viewport.center;

  return {
    origin: { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) },
    parent: figma.currentPage,
  };
}
