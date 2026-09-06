import type { INode } from 'svgson';

import { element, formatNumber, textNode } from '../figma-svg';
import type { ChannelPaint, SerializeHooks } from '../figma-svg';
import { CURRENT_COLOR_GROUP } from '../utils/currentColor';
import { getNameParts } from '../utils/getNameParts';
import { isMotionAvailable } from '../utils/motionSupport';
import { isSupportedColor } from '../utils/isSupportedColor';
import { isSupportedComponent } from '../utils/isSupportedComponent';
import { resolveComponentName } from '../utils/resolveComponentName';
import { animatesOpacity, hasAnimationTracks, readNodeAnimation } from './nodeAnimation';
import {
  createCurrentColorProbe,
  createStyleGroupResolver,
  readReferenceColor,
  type StyleLookup,
} from './referenceColor';

/**
 * What DiceBear adds to the plain SVG of a frame, as hooks for the serializer.
 *
 * The output carries the DiceBear parts in a form svgo leaves alone and the
 * definition converter reads back: palette colors as `{{colors.group}}`,
 * component references as `{{components.group}}` placeholders inside their
 * transform groups, animations as a `data-dbanim` carrier on a wrapping group.
 */

export type DicebearHookOptions = {
  /** Resolves style ids, cached so each one crosses the plugin bridge once. */
  styles: StyleLookup;
};

export function createDicebearHooks(options: DicebearHookOptions): SerializeHooks {
  const styleGroup = createStyleGroupResolver(options.styles);
  const usesCurrentColor = createCurrentColorProbe(styleGroup);
  let animKey = 0;

  /** The bound style, or null when it is not one this export understands. */
  const paintStyle = async (id: string): Promise<PaintStyle | null> => {
    const style = (await options.styles(id)) as PaintStyle | null;

    return style !== null && style.type === 'PAINT' && isSupportedColor(style) ? style : null;
  };

  return {
    /**
     * A reference to a component group becomes its placeholder, inside the
     * group for the scale from the component's size to the instance's and, for
     * a component that paints with `currentColor`, the color the reference
     * passes down. The serializer adds the instance's own transform and
     * opacity, the definition converter folds all of it onto the reference.
     *
     * The same placeholder stands inside a mask. The renderer draws the
     * variant the seed picks there, and its alpha masks the siblings, as the
     * instance does in Figma. A vector mask cannot take the outline of a part
     * that is only chosen at render time, so it uses the paint as well.
     */
    async resolveNode(node) {
      if (node.type !== 'INSTANCE') {
        return undefined;
      }

      const mainComponent = await node.getMainComponentAsync();

      if (mainComponent === null || !isSupportedComponent(mainComponent)) {
        return undefined;
      }

      const componentGroup = resolveComponentName(node, mainComponent).componentName;
      const scale = { x: node.width / mainComponent.width, y: node.height / mainComponent.height };
      const attributes: Record<string, string> = {};

      if (scale.x !== 1 || scale.y !== 1) {
        attributes.transform = `scale(${formatNumber(scale.x)} ${formatNumber(scale.y)})`;
      }

      const referenceColor = (await usesCurrentColor(mainComponent))
        ? await readReferenceColor(node, mainComponent, styleGroup)
        : undefined;

      if (referenceColor !== undefined) {
        attributes.color =
          referenceColor.group !== undefined ? `{{colors.${referenceColor.group}}}` : (referenceColor.value as string);
      }

      return [element('g', attributes, [textNode(`{{components.${componentGroup}}}`)])];
    },

    /**
     * A palette style becomes its placeholder, the alpha lives in the palette
     * value and is only flagged, so a see-through stroke keeps its own
     * element. The `currentColor` marker becomes `currentColor` and keeps the
     * paint's alpha, which belongs to the layer. Any other style falls back to
     * the layer's paints.
     */
    async resolveStyle(_node, _channel, styleId): Promise<ChannelPaint[] | undefined> {
      const style = await paintStyle(styleId);

      if (style === null) {
        return undefined;
      }

      const group = getNameParts(style.name).group;
      const opacity = (style.paints[0] as SolidPaint).opacity ?? 1;

      if (group === CURRENT_COLOR_GROUP) {
        return [{ value: 'currentColor', opacity: opacity === 1 ? undefined : opacity }];
      }

      return [{ value: `{{colors.${group}}}`, translucent: opacity !== 1 ? true : undefined }];
    },

    /**
     * A layer resting at zero opacity is part of the design when its
     * animation brings it in: the static avatar leaves it out, the animated
     * one shows it.
     */
    keepAtZeroOpacity(node) {
      return isMotionAvailable(node) && animatesOpacity(node);
    },

    /**
     * The carrier group for a layer's animation, outside its transform: Figma
     * composes motion outside the layer's resting transform, and the renderer
     * wraps the whole element the same way. URI-encoded so no svgo pass can
     * touch the payload, keyed so identically animated siblings stay apart for
     * `mergePaths`.
     */
    wrapNode(node, elements, asMask, ctx): INode[] {
      if (elements.length === 0 || !isMotionAvailable(node)) {
        return elements;
      }

      // Mask content sits below `defs`, where the schema allows no animation:
      // the renderer's carrier group would never reach the mask.
      if (asMask) {
        if (hasAnimationTracks(node)) {
          ctx.warn(
            `The mask "${node.name}" has an animation, but a mask cannot animate in a definition. It was exported static.`,
          );
        }

        return elements;
      }

      const animation = readNodeAnimation(node, ctx.warn);

      if (animation === null) {
        return elements;
      }

      const attributes: Record<string, string> = {
        'data-dbanim': `${animKey++}:${encodeURIComponent(JSON.stringify(animation.animations))}`,
      };

      // The layer's opacity is the resting state of the static avatar, the
      // track only says how it moves. A layer that shows only while animating
      // rests at zero, one that fades in from nothing rests at one. The
      // renderer animates the carrier, so the resting value moves up to it,
      // where the track replaces it instead of multiplying with it.
      if (animation.animatesOpacity && 'opacity' in node && node.opacity !== 1) {
        attributes.opacity = formatNumber(node.opacity);

        const [only] = elements;

        if (elements.length === 1 && only.type === 'element' && only.attributes.opacity === attributes.opacity) {
          delete only.attributes.opacity;
        }
      }

      return [element('g', attributes, elements)];
    },
  };
}
