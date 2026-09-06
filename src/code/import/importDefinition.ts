import {
  ComponentGroupSettings,
  DefinitionComponentBase,
  DefinitionComponents,
  DefinitionFile,
  FrameSettings,
} from '../types';
import { setColorGroupSettings } from '../settings/setColorGroupSettings';
import { setComponentGroupSettings } from '../settings/setComponentGroupSettings';
import { setFrameSettings } from '../settings/setFrameSettings';
import { isSupportedColor } from '../utils/isSupportedColor';
import { isSupportedComponent } from '../utils/isSupportedComponent';
import { createGuide } from './createGuide';
import { definitionPrecision } from './definitionPrecision';
import { createThumbnail } from './createThumbnail';
import { createLicense } from './createLicense';
import { definitionAnimationsToTracks } from '../animation/keyframes';
import { DefinitionAnimation } from '../animation/types';
import { isMotionAvailable } from '../utils/motionSupport';
import { decomposeOriginAnimations } from '../animation/decomposeOrigin';
import { animationLayerName } from '../animation/names';
import { CURRENT_COLOR_GROUP } from '../utils/currentColor';
import { tick } from '@shared/tick';
import { postProgress } from '../utils/postProgress';
import { hexColor } from '../figma-svg';
import {
  createDefinitionSerializer,
  DefinitionSerializer,
  PreparedAnim,
  PreparedRef,
  PreparedRefColor,
  resolveMasterName,
} from './serializeDefinition';

const COMPONENT_GAP = 48;
const GROUP_GAP = 160;
const MAX_ROW_WIDTH = 4000;

type PreparedVariant = {
  name: string;
  svg: string;
  refs: PreparedRef[];
  anims: PreparedAnim[];
};

type PreparedGroup = {
  name: string;
  variants: PreparedVariant[];
};

type ImportContext = {
  components: DefinitionComponents;
  componentIndex: Map<string, ComponentNode>;
  paintStylesByGroup: Map<string, PaintStyle[]>;
  /** The styles that mark a layer as `currentColor`, one per shown color. */
  currentColorStyles: Map<string, PaintStyle>;
  /** The per-reference colors, applied once the masters carry the marker. */
  referenceColors: { instance: InstanceNode; color: PreparedRefColor }[];
  currentColorSentinel: string;
  /**
   * The latest animation end time applied anywhere during this import.
   * Components extend their own timelines as tracks are written, but the
   * avatar frame only holds instances, so its timeline is extended to this
   * value at the end — otherwise the preview stops at Figma's default
   * duration mid-cycle.
   */
  maxTimelineEnd: number;
  warn: (message: string) => void;
  warnOnce: (message: string) => void;
};

function validateDefinition(definition: DefinitionFile): void {
  const canvas = definition?.canvas;

  // `components` is optional in the schema: a definition may draw everything on
  // the canvas.
  if (
    typeof definition !== 'object' ||
    definition === null ||
    typeof canvas !== 'object' ||
    canvas === null ||
    typeof canvas.width !== 'number' ||
    typeof canvas.height !== 'number' ||
    (definition.components !== undefined && typeof definition.components !== 'object')
  ) {
    throw new Error('The selected file does not look like a DiceBear definition file.');
  }

  if (canvas.width <= 0 || canvas.width !== canvas.height) {
    throw new Error('The definition canvas must be square.');
  }
}

/**
 * Why an import into this file is not possible, or null when it is. An
 * import needs a file without a style in it, since it would tangle its
 * palettes and components with the ones already there.
 */
export async function describeImportBlock(): Promise<string | null> {
  // The style check needs no page loading, so it rejects a real style file
  // before the expensive full document load.
  const paintStyles = await figma.getLocalPaintStylesAsync();

  if (paintStyles.some(isSupportedColor)) {
    return 'This file already holds color styles with group names. Import a definition into an empty file.';
  }

  await figma.loadAllPagesAsync();

  const components = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });

  if (components.some(isSupportedComponent)) {
    return 'This file already holds component groups. Import a definition into an empty file.';
  }

  return null;
}

async function ensureEmptyTarget(): Promise<void> {
  const block = await describeImportBlock();

  if (block !== null) {
    throw new Error(block);
  }
}

function createPaintStyles(definition: DefinitionFile, warn: (message: string) => void): Map<string, PaintStyle[]> {
  const stylesByGroup = new Map<string, PaintStyle[]>();

  for (const [groupName, group] of Object.entries(definition.colors ?? {})) {
    if (groupName === CURRENT_COLOR_GROUP) {
      // The marker group carries the `currentColor` layers through Figma, so a
      // palette slot of that name would swallow them on the way back.
      warn(`palette "${groupName}": the name is reserved for currentColor layers, the palette was not created.`);

      continue;
    }

    const values = group.values ?? [];
    // The zero-padded index keeps the palette order stable: the exporter sorts
    // colors by name before writing the definition values.
    const padLength = Math.max(2, String(values.length).length);

    const styles = values.map((hex, index) => {
      const style = figma.createPaintStyle();

      style.name = `${groupName}/${String(index + 1).padStart(padLength, '0')} ${hex.replace('#', '').toLowerCase()}`;

      try {
        style.paints = [figma.util.solidPaint(hex)];
      } catch {
        // Aborting here would leave the half built file behind, and the next
        // attempt would be rejected as non-empty.
        warn(`palette "${groupName}": the value "${hex}" could not be parsed, black was used instead.`);
        style.paints = [figma.util.solidPaint('#000000')];
      }

      return style;
    });

    stylesByGroup.set(groupName, styles);
  }

  return stylesByGroup;
}

function solidPaintHex(paint: Paint): string | null {
  return paint.type === 'SOLID' ? hexColor(paint.color) : null;
}

/**
 * The style that marks a layer as `currentColor` while showing `hex`, created
 * on first use. The layers keep looking the way the inherited color paints
 * them, the binding is what carries the meaning.
 */
function currentColorStyle(hex: string, context: ImportContext): PaintStyle {
  const existing = context.currentColorStyles.get(hex);

  if (existing) {
    return existing;
  }

  const style = figma.createPaintStyle();

  style.name = `${CURRENT_COLOR_GROUP}/${String(context.currentColorStyles.size + 1).padStart(2, '0')} ${hex.replace('#', '')}`;
  style.paints = [figma.util.solidPaint(hex)];

  context.currentColorStyles.set(hex, style);

  return style;
}

/** The color a resolved sentinel paints, as a hex string. */
function sentinelHex(color: SentinelColor): string | null {
  if (color.style) {
    return color.style.paints.length > 0 ? solidPaintHex(color.style.paints[0]) : null;
  }

  return color.paint ? solidPaintHex(color.paint) : null;
}

type PaintBinding = {
  /** Alpha of the paint before the binding replaces it. */
  alpha: number;
  bind: () => Promise<void>;
};

/**
 * The paint alpha a layer can carry as its own opacity, or null when it has to
 * be dropped. A layer bound to a color style takes the style's paint, alpha
 * included, so `fill-opacity` and `stroke-opacity` have nowhere else to go.
 * Layer opacity is applied after the color rather than to it, which makes it an
 * exact stand-in, but it dims everything the layer draws. That only matches the
 * original when the bound paints are all the layer has: they must share one
 * alpha, nothing may paint beside them, and no nested content, effect or
 * existing opacity may ride along.
 */
function getMovableAlpha(node: SceneNode, boundPaints: PaintBinding[], unboundPaints: number): number | null {
  const alpha = boundPaints[0].alpha;

  if (alpha === 1 || unboundPaints > 0 || boundPaints.some((paint) => paint.alpha !== alpha)) {
    return null;
  }

  if (false === 'opacity' in node || node.opacity !== 1) {
    return null;
  }

  if ('children' in node && node.children.length > 0) {
    return null;
  }

  if ('effects' in node && node.effects.length > 0) {
    return null;
  }

  return alpha;
}

async function bindColorStyles(
  root: FrameNode,
  bindings: Map<string, string>,
  warnOnce: (message: string) => void,
): Promise<void> {
  const nodes: SceneNode[] = [root, ...root.findAll()];
  const writes: Promise<void>[] = [];
  let movedOpacity = false;
  let droppedOpacity = false;

  for (const node of nodes) {
    const boundPaints: PaintBinding[] = [];
    let unboundPaints = 0;

    if ('fills' in node) {
      const fills = node.fills;
      const paint = Array.isArray(fills) && fills.length === 1 ? fills[0] : null;
      const hex = paint ? solidPaintHex(paint) : null;
      const styleId = hex ? bindings.get(hex) : undefined;

      if (paint && styleId) {
        boundPaints.push({ alpha: paint.opacity ?? 1, bind: () => node.setFillStyleIdAsync(styleId) });
      } else {
        // Figma's mixed value is not an array and stands for paints this pass
        // cannot read, so it counts as one that stays behind.
        unboundPaints += Array.isArray(fills) ? fills.length : 1;
      }
    }

    if ('strokes' in node) {
      const paint = node.strokes.length === 1 ? node.strokes[0] : null;
      const hex = paint ? solidPaintHex(paint) : null;
      const styleId = hex ? bindings.get(hex) : undefined;

      if (paint && styleId) {
        boundPaints.push({ alpha: paint.opacity ?? 1, bind: () => node.setStrokeStyleIdAsync(styleId) });
      } else {
        unboundPaints += node.strokes.length;
      }
    }

    if (boundPaints.length === 0) {
      continue;
    }

    const movableAlpha = getMovableAlpha(node, boundPaints, unboundPaints);

    if (movableAlpha !== null && 'opacity' in node) {
      node.opacity = movableAlpha;
      movedOpacity = true;
    } else if (boundPaints.some((paint) => paint.alpha < 1)) {
      droppedOpacity = true;
    }

    for (const paint of boundPaints) {
      writes.push(paint.bind());
    }
  }

  await Promise.all(writes);

  if (droppedOpacity) {
    warnOnce(
      'Some layers combine a palette color with their own fill-opacity or stroke-opacity. ' +
        (movedOpacity ? 'Where that alpha covers everything the layer draws, it became the layer opacity. ' : '') +
        'The rest were imported fully opaque, a layer bound to a color style has no other place for it.',
    );
  }
}

type SentinelColor = {
  style?: PaintStyle;
  paint?: SolidPaint;
};

/** Turns the color a reference passes down into something Figma can paint. */
function resolveSentinelColor(
  color: PreparedRefColor | undefined,
  context: ImportContext,
  onUnparsable?: (value: string) => void,
): SentinelColor {
  const style = color?.group ? context.paintStylesByGroup.get(color.group)?.[0] : undefined;
  let paint: SolidPaint | undefined;

  if (!style && color?.value) {
    try {
      paint = figma.util.solidPaint(color.value);
    } catch {
      onUnparsable?.(color.value);
    }
  }

  return { style, paint };
}

/**
 * Repaints every layer below `root` that still carries the `currentColor`
 * sentinel. `skipInstances` keeps the pass off nodes that belong to a nested
 * component, those are resolved through their own main component.
 */
/** Whether a node still shows the `currentColor` sentinel on a fill or stroke. */
function hasSentinelPaint(node: SceneNode, context: ImportContext): boolean {
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length === 1) {
    if (solidPaintHex(node.fills[0]) === context.currentColorSentinel) {
      return true;
    }
  }

  return (
    'strokes' in node && node.strokes.length === 1 && solidPaintHex(node.strokes[0]) === context.currentColorSentinel
  );
}

async function paintSentinelLayers(
  root: SceneNode & ChildrenMixin,
  color: SentinelColor,
  context: ImportContext,
  skipInstances: boolean,
  onMissing?: () => void,
): Promise<void> {
  const { style, paint } = color;

  if (!style && !paint && !onMissing) {
    return;
  }

  for (const node of root.findAll()) {
    if (skipInstances && isInsideInstance(node, root)) {
      continue;
    }

    if ('fills' in node && Array.isArray(node.fills) && node.fills.length === 1) {
      if (solidPaintHex(node.fills[0]) === context.currentColorSentinel) {
        if (style) {
          await node.setFillStyleIdAsync(style.id);
        } else if (paint) {
          node.fills = [paint];
        } else {
          onMissing?.();
        }
      }
    }

    if ('strokes' in node && node.strokes.length === 1) {
      if (solidPaintHex(node.strokes[0]) === context.currentColorSentinel) {
        if (style) {
          await node.setStrokeStyleIdAsync(style.id);
        } else if (paint) {
          node.strokes = [paint];
        } else {
          onMissing?.();
        }
      }
    }
  }
}

/**
 * Resolves the `currentColor` sentinel inside one instance. Layers keep the
 * sentinel paint until either this override or the final pass over the main
 * components replaces it. Fills and strokes both carry the marker, so both are
 * overridden.
 */
async function applyReferenceColors(context: ImportContext): Promise<void> {
  const markerIds = new Set([...context.currentColorStyles.values()].map((style) => style.id));

  for (const { instance, color } of context.referenceColors) {
    const resolved = resolveSentinelColor(color, context, (value) =>
      context.warnOnce(`The color "${value}" on a component reference could not be parsed and was dropped.`),
    );

    if (!resolved.style && !resolved.paint) {
      continue;
    }

    for (const node of instance.findAll()) {
      // Assigning paints detaches the inherited style, which is what makes this
      // an override the export can tell apart from the master.
      if ('fillStyleId' in node && typeof node.fillStyleId === 'string' && markerIds.has(node.fillStyleId)) {
        if (resolved.style) {
          await node.setFillStyleIdAsync(resolved.style.id);
        } else if (resolved.paint) {
          node.fills = [resolved.paint];
        }
      }

      if ('strokeStyleId' in node && typeof node.strokeStyleId === 'string' && markerIds.has(node.strokeStyleId)) {
        if (resolved.style) {
          await node.setStrokeStyleIdAsync(resolved.style.id);
        } else if (resolved.paint) {
          node.strokes = [resolved.paint];
        }
      }
    }
  }
}

async function replaceRefPlaceholders(
  root: FrameNode,
  refs: PreparedRef[],
  context: ImportContext,
  scope: string,
): Promise<void> {
  for (const ref of refs) {
    const placeholder = root.findOne((node) => node.name === ref.id);

    if (!placeholder || !placeholder.parent) {
      context.warn(`${scope}: the reference to "${ref.refName}" was lost during the SVG import.`);

      continue;
    }

    const masterName = resolveMasterName(context.components, ref.refName);
    const mainComponent = masterName === null ? undefined : context.componentIndex.get(masterName);
    const parent = placeholder.parent as BaseNode & ChildrenMixin;

    if (!mainComponent) {
      context.warn(`${scope}: the reference to "${ref.refName}" was removed because the component was not imported.`);
      placeholder.remove();

      continue;
    }

    const index = parent.children.indexOf(placeholder);
    const instance = mainComponent.createInstance();

    // Insert before removing the placeholder, otherwise a group that only
    // holds the placeholder would dissolve.
    parent.insertChild(index, instance);
    // Figma rejects a resize below 0.01, which a reference scaled to zero would
    // ask for.
    instance.resize(Math.max(placeholder.width, 0.01), Math.max(placeholder.height, 0.01));
    instance.relativeTransform = placeholder.relativeTransform;

    if ('opacity' in placeholder) {
      instance.opacity = placeholder.opacity;
    }

    if (masterName !== ref.refName) {
      // Renaming the instance to the alias name is what the exporter reads
      // back as an alias component.
      instance.name = ref.refName;
    }

    if (ref.color) {
      // Applied only after the main components carry the marker style: an
      // override has to sit on top of what the instance inherits, otherwise
      // the later binding on the master covers it again.
      context.referenceColors.push({ instance, color: ref.color });
    }

    if (ref.animations) {
      if (isMotionAvailable(instance)) {
        // The animation rides on a group around the instance, not on the
        // instance itself: the layer name of an instance already carries the
        // alias the export reads back, so there is no room for the animation
        // name next to it.
        const carrier = figma.group([instance], parent, parent.children.indexOf(instance));

        nameAnimatedLayer(carrier, ref.animations, context);

        // The resting opacity sits on the carrier, next to the tracks that
        // replace it while the animation plays.
        if (ref.restingOpacity !== undefined) {
          carrier.opacity = ref.restingOpacity;
        }

        try {
          applyTracksToNode(carrier, ref.animations, root, context);
        } catch (e: any) {
          context.warn(
            `${scope}: the animation on the reference to "${ref.refName}" could not be applied (${e.message}).`,
          );
        }
      } else {
        context.warnOnce(
          'Figma animations are not available for your account. The animations of this definition were skipped.',
        );

        // Without the tracks the instance stays at its resting state.
        if (ref.restingOpacity !== undefined) {
          instance.opacity = ref.restingOpacity;
        }
      }
    }

    placeholder.remove();
  }
}

function prepareComponents(
  components: DefinitionComponents,
  serializer: DefinitionSerializer,
  warn: (message: string) => void,
): Map<string, PreparedGroup> {
  const prepared = new Map<string, PreparedGroup>();

  for (const [groupName, entry] of Object.entries(components)) {
    if ('extends' in entry) {
      continue;
    }

    const variants: PreparedVariant[] = [];
    const emptyVariantWarnings: string[] = [];

    for (const [variantName, variant] of Object.entries(entry.variants ?? {})) {
      const scope = `component "${groupName}" variant "${variantName}"`;
      const serialized = serializer.serialize(variant.elements ?? [], entry.width, entry.height, scope);

      if (serialized.svg === null) {
        emptyVariantWarnings.push(`${scope} is empty after skipping unsupported content and was not imported.`);

        continue;
      }

      variants.push({ name: variantName, svg: serialized.svg, refs: serialized.refs, anims: serialized.anims });
    }

    if (variants.length === 0) {
      warn(
        `component "${groupName}": every variant is empty after skipping unsupported content, the component was not imported.`,
      );

      continue;
    }

    emptyVariantWarnings.forEach(warn);
    prepared.set(groupName, { name: groupName, variants });
  }

  return prepared;
}

function sortGroupsByDependencies(prepared: Map<string, PreparedGroup>, components: DefinitionComponents): string[] {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (name: string): void => {
    const current = state.get(name);

    if (current === 'done') {
      return;
    }

    if (current === 'visiting') {
      throw new Error(`Circular component references involving "${name}" cannot be imported.`);
    }

    state.set(name, 'visiting');

    const group = prepared.get(name);

    if (group) {
      for (const variant of group.variants) {
        for (const ref of variant.refs) {
          const masterName = resolveMasterName(components, ref.refName);

          if (masterName !== null && prepared.has(masterName)) {
            visit(masterName);
          }
        }
      }

      order.push(name);
    }

    state.set(name, 'done');
  };

  for (const name of prepared.keys()) {
    visit(name);
  }

  return order;
}

/**
 * The color each main component should fall back to for its `currentColor`
 * layers: the color that most references to it pass down.
 */
function voteFallbackColors(allRefs: PreparedRef[], components: DefinitionComponents): Map<string, PreparedRefColor> {
  const votes = new Map<string, Map<string, { color: PreparedRefColor; count: number }>>();

  for (const ref of allRefs) {
    if (!ref.color) {
      continue;
    }

    const masterName = resolveMasterName(components, ref.refName);

    if (masterName === null) {
      continue;
    }

    const key = ref.color.group ? `group:${ref.color.group}` : `value:${ref.color.value}`;
    const groupVotes = votes.get(masterName) ?? new Map();
    const entry = groupVotes.get(key) ?? { color: ref.color, count: 0 };

    entry.count++;
    groupVotes.set(key, entry);
    votes.set(masterName, groupVotes);
  }

  const result = new Map<string, PreparedRefColor>();

  for (const [masterName, groupVotes] of votes) {
    let best: { color: PreparedRefColor; count: number } | undefined;

    for (const entry of groupVotes.values()) {
      if (!best || entry.count > best.count) {
        best = entry;
      }
    }

    if (best) {
      result.set(masterName, best.color);
    }
  }

  return result;
}

/**
 * References carry their scale as the size of the instance that replaces the
 * placeholder, which is also how the export reads it back. Without scaling
 * constraints the instance frame would grow while its artwork stayed at the
 * original size, so they are set explicitly instead of relying on what the SVG
 * import happened to assign. Groups have no constraints of their own, their
 * children carry them.
 */
function applyScaleConstraints(component: ComponentNode): void {
  for (const node of component.findAll()) {
    // Constraints cannot be overridden inside an instance. The instance node
    // itself still gets them, it scales as a whole.
    if (isInsideInstance(node, component)) {
      continue;
    }

    if ('constraints' in node) {
      node.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    }
  }
}

function isInsideInstance(node: BaseNode, root: SceneNode): boolean {
  let current = node.parent;

  while (current && current !== root) {
    if (current.type === 'INSTANCE') {
      return true;
    }

    current = current.parent;
  }

  return false;
}

/**
 * Names the layer that carries a set of animations. Figma merges everything on
 * one node into a single timeline, so only a single shared name survives.
 */
function nameAnimatedLayer(node: SceneNode, animations: DefinitionAnimation[], context: ImportContext): void {
  const names = [...new Set(animations.map((animation) => animation.name).filter((n): n is string => n !== undefined))];

  node.name = animationLayerName(names.length === 1 ? names[0] : undefined);

  if (names.length > 1) {
    context.warnOnce(
      'A layer carries several named animations. Figma merges them into one, so a re-export drops their names.',
    );
  }
}

/**
 * Writes the manual keyframe tracks a node's definition animations describe,
 * and stretches the containing timeline to the animation's end.
 */
function applyTracksToNode(
  node: SceneNode,
  animations: DefinitionAnimation[],
  timelineHost: SceneNode,
  context: ImportContext,
): void {
  // Non-center origins become center-based motion plus a compensating
  // translation before conversion, so Figma plays them correctly. The node's
  // bounds are the model's fill-box.
  const decomposed = decomposeOriginAnimations(
    animations,
    { width: node.width, height: node.height },
    context.warnOnce,
  );

  const { tracks, endTime } = definitionAnimationsToTracks(decomposed, context.warnOnce);

  const entries = Object.entries(tracks);

  if (entries.length === 0) {
    return;
  }

  // The order matters: Figma rejects edits to a timeline that already holds
  // keyframes beyond its end (the UI cannot even create such keyframes). So
  // first materialize the timeline with a minimal in-range keyframe, then
  // extend it to the full cycle, and only then write the real tracks — which
  // replace the bootstrap track again.
  const [bootstrapField, bootstrapTrack] = entries[0];

  node.applyManualKeyframeTrack(
    { type: 'PROPERTY', name: bootstrapField },
    { keyframes: [{ ...bootstrapTrack.keyframes[0], timelinePosition: 0 }] },
  );

  extendTimeline(timelineHost, endTime, context);

  for (const [field, track] of entries) {
    // Both sides read an opacity track as the value itself, not as a factor on
    // the layer's own opacity, so the keyframes travel as they are.
    node.applyManualKeyframeTrack({ type: 'PROPERTY', name: field }, { keyframes: track.keyframes });
  }

  // One Figma timeline serves every layer, so animations of different lengths
  // cannot all loop on it.
  if (context.maxTimelineEnd > 0 && Math.abs(context.maxTimelineEnd - endTime) > 1e-6) {
    context.warnOnce(
      'Layers with animations of different lengths share one Figma timeline. ' +
        'The shorter ones run once per pass and then wait for the longest.',
    );
  }

  context.maxTimelineEnd = Math.max(context.maxTimelineEnd, endTime);
}

/**
 * Extends the timeline of the node's containing top-level frame so it covers
 * the given end time. A shorter timeline would stop the preview mid-cycle.
 */
function extendTimeline(node: SceneNode, endTime: number, context: ImportContext): void {
  if (endTime <= 0) {
    return;
  }

  try {
    const [timeline] = node.timelines;

    if (!timeline) {
      context.warnOnce('The timeline duration could not be adjusted. The animation may be cut off in the preview.');

      return;
    }

    if (timeline.duration < endTime) {
      node.setTimelineDuration(timeline.id, endTime);
    }
  } catch {
    context.warnOnce('The timeline duration could not be adjusted. The animation may be cut off in the preview.');
  }
}

/**
 * Finds the marker layers the serializer emitted for animated elements and
 * writes their keyframe tracks. The markers are renamed in every case — a
 * later export must never see a `dbimp-anim-…` layer name — so the fallback
 * for users without motion access still walks all of them.
 */
function applyImportedAnimations(
  root: SceneNode & ChildrenMixin,
  anims: PreparedAnim[],
  context: ImportContext,
  scope: string,
): void {
  if (anims.length === 0) {
    return;
  }

  const motionAvailable = isMotionAvailable(root);

  if (!motionAvailable) {
    context.warnOnce(
      'Figma animations are not available for your account. The animations of this definition were skipped.',
    );
  }

  for (const anim of anims) {
    const node = root.findOne((candidate) => candidate.name === anim.id && !isInsideInstance(candidate, root));

    if (!node) {
      context.warn(`${scope}: an animated element was lost during the SVG import, its animation was dropped.`);

      continue;
    }

    // The marker has served its purpose. The layer name keeps the
    // animation's name (`hop`), where the export reads it back and a designer
    // can see and change it. Everything else gets a generic name.
    // The transform origin needs no transport: it is decomposed into native
    // tracks when they are written.
    nameAnimatedLayer(node, anim.animations, context);

    // The resting opacity the markup left out. It is the static state, so it
    // applies whether or not the tracks can be written.
    if (anim.restingOpacity !== undefined && 'opacity' in node) {
      node.opacity = anim.restingOpacity;
    }

    if (!motionAvailable) {
      continue;
    }

    try {
      applyTracksToNode(node, anim.animations, root, context);
    } catch (e: any) {
      context.warn(`${scope}: the animation could not be applied (${e.message}).`);
    }
  }
}

/**
 * Resolves `currentColor` layers that are still on the sentinel color inside
 * the main components. Instances that received a per-reference override keep
 * it, all others inherit this fallback.
 */
async function bindRemainingCurrentColor(
  fallbackColors: Map<string, PreparedRefColor>,
  componentsByGroup: Map<string, ComponentNode[]>,
  context: ImportContext,
): Promise<void> {
  for (const [groupName, components] of componentsByGroup) {
    const inherited = resolveSentinelColor(fallbackColors.get(groupName), context);
    const hex = sentinelHex(inherited);

    // The layers show the inherited color, but they bind to the currentColor
    // style rather than to the palette: that is what tells the export they
    // were `currentColor` and not a color of their own.
    const carrier: SentinelColor = hex === null ? {} : { style: currentColorStyle(hex, context) };

    for (const component of components) {
      await paintSentinelLayers(component, carrier, context, true, () =>
        context.warnOnce(
          `component "${groupName}" uses currentColor without an inherited color, the affected layers kept a placeholder color.`,
        ),
      );
    }
  }
}

export async function importDefinition(
  definition: DefinitionFile,
  styleName: string,
  picksBySeed: Record<string, Record<string, unknown>>,
): Promise<string[]> {
  validateDefinition(definition);
  await ensureEmptyTarget();

  figma.commitUndo();

  // The pages the file already had. Only a fresh file's single empty default
  // page is removed at the end, pages the user created stay.
  const startPages = [...figma.root.children];
  const components: DefinitionComponents = definition.components ?? {};
  const warnings: string[] = [];
  const warnedOnce = new Set<string>();
  const warn = (message: string) => warnings.push(message);
  const warnOnce = (message: string) => {
    if (!warnedOnce.has(message)) {
      warnedOnce.add(message);
      warnings.push(message);
    }
  };
  const serializer = createDefinitionSerializer(definition, warn);

  // Everything is serialized before the first node is created. An error in
  // here then leaves the file untouched, while a half built file would be
  // rejected as non-empty on the next attempt.
  const prepared = prepareComponents(components, serializer, warn);
  const order = sortGroupsByDependencies(prepared, components);

  const canvas = definition.canvas;
  const canvasSerialized = serializer.serialize(canvas.elements ?? [], canvas.width, canvas.height, 'canvas');

  await postProgress('Creating color styles');

  const paintStylesByGroup = createPaintStyles(definition, warn);
  const bindings = new Map<string, string>();

  for (const [groupName, sentinel] of serializer.sentinelByColorGroup) {
    const styles = paintStylesByGroup.get(groupName);

    if (styles && styles.length > 0) {
      bindings.set(sentinel, styles[0].id);
    }
  }

  const allRefs: PreparedRef[] = [...canvasSerialized.refs];

  for (const group of prepared.values()) {
    for (const variant of group.variants) {
      allRefs.push(...variant.refs);
    }
  }

  const fallbackColors = voteFallbackColors(allRefs, components);

  const componentIndex = new Map<string, ComponentNode>();
  const componentsByGroup = new Map<string, ComponentNode[]>();
  const createdVariants = new Map<string, string[]>();

  const context: ImportContext = {
    components,
    componentIndex,
    paintStylesByGroup,
    currentColorStyles: new Map(),
    referenceColors: [],
    currentColorSentinel: serializer.currentColorSentinel,
    maxTimelineEnd: 0,
    warn,
    warnOnce,
  };

  const avatarPage = figma.createPage();
  avatarPage.name = 'Avatar';

  const componentsPage = figma.createPage();
  componentsPage.name = 'Components';

  let cursorY = 0;

  for (let groupIndex = 0; groupIndex < order.length; groupIndex++) {
    const group = prepared.get(order[groupIndex])!;

    await postProgress(`Importing component ${groupIndex + 1} of ${order.length}: ${group.name}`);

    let x = 0;
    let rowY = cursorY;
    let rowHeight = 0;

    for (const variant of group.variants) {
      let svgFrame: FrameNode;

      try {
        svgFrame = figma.createNodeFromSvg(variant.svg);
      } catch (e: any) {
        warn(`component "${group.name}" variant "${variant.name}": Figma could not parse the SVG (${e.message}).`);

        continue;
      }

      componentsPage.appendChild(svgFrame);
      await bindColorStyles(svgFrame, bindings, warnOnce);
      await replaceRefPlaceholders(
        svgFrame,
        variant.refs,
        context,
        `component "${group.name}" variant "${variant.name}"`,
      );

      // The rendered SVG clips only at the canvas (the always-on border
      // radius clip). Component defs render unclipped. createNodeFromSvg
      // enables clipping by default, which would hide content that leaves
      // the component box — planets' orbiting moon, for instance.
      svgFrame.clipsContent = false;

      // Before the frame becomes a component: setTimelineDuration works on
      // frames but silently fails on components (the API accepts the value
      // and reads it back, yet the player and the UI keep the old duration).
      // The timeline created and extended here survives the conversion.
      applyImportedAnimations(svgFrame, variant.anims, context, `component "${group.name}" variant "${variant.name}"`);

      const component = figma.createComponentFromNode(svgFrame);

      component.name = `${group.name}/${variant.name}`;
      applyScaleConstraints(component);

      if (x > 0 && x + component.width > MAX_ROW_WIDTH) {
        x = 0;
        rowY += rowHeight + COMPONENT_GAP;
        rowHeight = 0;
      }

      component.x = x;
      component.y = rowY;
      rowHeight = Math.max(rowHeight, component.height);
      x += component.width + COMPONENT_GAP;

      if (!componentIndex.has(group.name)) {
        componentIndex.set(group.name, component);
      }

      const siblings = componentsByGroup.get(group.name) ?? [];

      siblings.push(component);
      componentsByGroup.set(group.name, siblings);

      const names = createdVariants.get(group.name) ?? [];

      names.push(variant.name);
      createdVariants.set(group.name, names);

      await tick();
    }

    cursorY = rowY + rowHeight + GROUP_GAP;
  }

  await postProgress('Building the avatar frame');

  let imported: FrameNode | null = null;

  if (canvasSerialized.svg !== null) {
    try {
      imported = figma.createNodeFromSvg(canvasSerialized.svg);
    } catch (e: any) {
      // Aborting here would leave the components and color styles behind, and
      // the next attempt would be rejected as non-empty.
      warn(`canvas: Figma could not parse the SVG (${e.message}), the avatar frame was left empty.`);
    }
  }

  let frame: FrameNode;

  if (imported) {
    frame = imported;
    avatarPage.appendChild(frame);
    await bindColorStyles(frame, bindings, warnOnce);
    await replaceRefPlaceholders(frame, canvasSerialized.refs, context, 'canvas');
    applyImportedAnimations(frame, canvasSerialized.anims, context, 'canvas');

    // The frame plays the component timelines through its instances, so its
    // own timeline must span the longest cycle applied anywhere.
    if (context.maxTimelineEnd > 0 && isMotionAvailable(frame)) {
      extendTimeline(frame, context.maxTimelineEnd, context);
    }
  } else {
    frame = figma.createFrame();
    frame.resize(canvas.width, canvas.height);
    frame.fills = [];
    avatarPage.appendChild(frame);
  }

  await bindRemainingCurrentColor(fallbackColors, componentsByGroup, context);
  await applyReferenceColors(context);

  // On the canvas there is no element left to inherit from, so the SVG default
  // for `color` applies. Without this the layers would keep the sentinel. The
  // style is only created when a layer actually needs it, otherwise every
  // import would leave an unused black style behind.
  const canvasSentinel = frame.findOne((node) => !isInsideInstance(node, frame) && hasSentinelPaint(node, context));

  if (canvasSentinel) {
    await paintSentinelLayers(frame, { style: currentColorStyle('#000000', context) }, context, true);
  }

  const meta = definition.meta ?? {};
  // The file name, not `meta.source.name`: the source names the artwork the
  // style is based on, which is a credit rather than the style's own name.
  const title = styleName;

  frame.name = title;
  frame.x = 0;
  frame.y = 0;

  // The frame's own fill carries the background palette, so the frame looks
  // finished for people who copy it without ever running the plugin. The
  // export renders the frame contents only, which leaves that fill out of the
  // definition. Layers bound to the background palette stay in, they are
  // ordinary layers to the export.
  const backgroundStyle = paintStylesByGroup.get('background')?.[0];

  if (backgroundStyle) {
    await frame.setFillStyleIdAsync(backgroundStyle.id);
  }

  for (const groupName of Object.keys(definition.colors ?? {})) {
    if (groupName !== 'background' && !serializer.usedColorGroups.has(groupName)) {
      warn(`palette "${groupName}" is not used by any imported layer and will not survive an export.`);
    }
  }

  await postProgress('Writing settings');

  const shapeRendering = definition.attributes?.['shape-rendering'];

  const frameSettings: FrameSettings = {
    title,
    creator: meta.creator?.name ?? '',
    homepage: meta.creator?.url ?? '',
    sourceTitle: meta.source?.name ?? '',
    source: meta.source?.url ?? '',
    licenseName: meta.license?.name ?? '',
    licenseUrl: meta.license?.url ?? '',
    licenseText: meta.license?.text ?? '',
    backgroundColorGroupName: definition.colors?.background ? 'background' : '',
    shapeRendering: typeof shapeRendering === 'string' ? shapeRendering : 'auto',
    precision: definitionPrecision(definition),
  };

  setFrameSettings(frame, frameSettings);

  for (const [groupName, variantNames] of createdVariants) {
    const entry = components[groupName] as DefinitionComponentBase;
    const settings: ComponentGroupSettings = {
      defaults: {},
      weights: {},
      tags: {},
      probability: entry.probability ?? null,
      rotation: entry.rotate ?? null,
      scale: entry.scale ?? null,
      translateX: entry.translate?.x ?? null,
      translateY: entry.translate?.y ?? null,
    };

    for (const variantName of variantNames) {
      const variant = entry.variants[variantName];

      settings.defaults[variantName] = true;
      settings.weights[variantName] = variant?.weight ?? 1;
      settings.tags[variantName] = variant?.tags ?? [];
    }

    setComponentGroupSettings(frame, groupName, settings);
  }

  for (const [groupName, group] of Object.entries(definition.colors ?? {})) {
    const notEqualTo: Record<string, boolean> = {};

    for (const other of group.notEqualTo ?? []) {
      notEqualTo[other] = true;
    }

    setColorGroupSettings(frame, groupName, {
      notEqualTo,
      contrastTo: group.contrastTo ?? null,
    });
  }

  await postProgress('Building the thumbnail');

  const thumbnailPage = figma.createPage();

  thumbnailPage.name = 'Thumbnail';

  try {
    await createThumbnail(thumbnailPage, {
      picksBySeed,
      title,
      frame,
      paintStylesByGroup,
      componentsByGroup,
      warnOnce,
      progress: postProgress,
    });
    figma.root.insertChild(0, thumbnailPage);
  } catch (e: any) {
    thumbnailPage.remove();
    warn(`The thumbnail could not be created (${e.message}).`);
  }

  await postProgress('Adding the guide');

  let guide: SceneNode | null = null;

  try {
    guide = await createGuide(avatarPage, frame, { paintStylesByGroup, warnOnce });
  } catch (e: any) {
    warn(`The guide could not be created (${e.message}).`);
  }

  // The license gets a page of its own, so it is found without the plugin.
  // Without a license the card would credit an unknown designer, which is
  // worse than no card.
  if (frameSettings.licenseName.trim() || frameSettings.licenseText.trim()) {
    await postProgress('Adding the license');

    const licensePage = figma.createPage();

    licensePage.name = 'License';

    try {
      await createLicense(licensePage, { settings: frameSettings, warnOnce });
    } catch (e: any) {
      licensePage.remove();
      warn(`The License page could not be created (${e.message}).`);
    }
  } else {
    warn('The definition names no license, the License page was skipped.');
  }

  await figma.setCurrentPageAsync(avatarPage);

  // The empty default page a fresh file starts with. A file the user already
  // set up keeps its pages, empty ones included.
  if (startPages.length === 1 && startPages[0].children.length === 0) {
    startPages[0].remove();
  }

  avatarPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView(guide ? [frame, guide] : [frame]);

  const uniqueWarnings = [...new Set(warnings)];

  figma.notify(
    uniqueWarnings.length > 0
      ? `Imported "${title}" with ${uniqueWarnings.length} warning${uniqueWarnings.length === 1 ? '' : 's'}.`
      : `Imported "${title}".`,
  );

  return uniqueWarnings;
}
