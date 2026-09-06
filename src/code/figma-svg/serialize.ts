import { stringify, type INode } from 'svgson';

import { blendModeStyle } from './blend';
import { element } from './element';
import { effectReach, effectsToFilter, type FilterBox } from './effects';
import { planMaskedSiblings, type MaskPlanItem } from './masks';
import { IDENTITY, apply, fromTransform, isIdentity, isTranslation, toAttribute, type Matrix } from './matrix';
import { formatNumber } from './numbers';
import { resolvePaint } from './paints';
import type { ChannelPaint, PaintChannel, SerializeContext, SerializeHooks, SerializeOptions } from './types';

/**
 * Writes the SVG of a frame or a component straight from the layer data.
 *
 * Geometry comes from `fillGeometry` and `strokeGeometry`, which already
 * account for corner smoothing, caps, joins and dashes. An inside or outside
 * stroke needs one more step: Figma draws it with twice the weight and masks
 * it by the fill, and `strokeGeometry` is that doubled outline before the
 * mask. Paints, effects, masks, blend modes and transforms are translated one
 * to one. Three hooks let a caller take over a layer, a bound style, or the
 * finished elements of a layer, see {@link SerializeHooks}.
 *
 * The root is exported by its contents: its own fill and transform stay out,
 * like `exportAsync` with `contentsOnly`.
 */

type Context = SerializeContext & {
  hooks: SerializeHooks;
  clipFrames: boolean;
  lastYield: number;
};

/** How long the walk may hold the thread before it yields, in milliseconds. */
const YIELD_AFTER_MS = 12;

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Lets the event loop turn once the walk has held the thread long enough. */
async function breathe(ctx: Context): Promise<void> {
  if (Date.now() - ctx.lastYield < YIELD_AFTER_MS) {
    return;
  }

  await (ctx.host.yield ?? defaultYield)();
  ctx.lastYield = Date.now();
}

type Size = { width: number; height: number };

/**
 * How a layer is being rendered: as ordinary content, as the content of an
 * alpha or luminance mask (as it paints), or as the content of a vector mask
 * (its white outline). Decided once at the mask and passed down, since the
 * children of a group mask carry no mask type of their own.
 */
type MaskMode = false | 'paint' | 'outline';

const SHAPE_TYPES = new Set<string>([
  'RECTANGLE',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'VECTOR',
  'LINE',
  'TEXT',
  'BOOLEAN_OPERATION',
]);

const CONTAINER_TYPES = new Set<string>(['GROUP', 'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);

function paintAttributes(channel: PaintChannel, paint: ChannelPaint): Record<string, string> {
  const attributes: Record<string, string> = { [channel]: paint.value };

  if (paint.opacity !== undefined) {
    attributes[`${channel}-opacity`] = formatNumber(paint.opacity);
  }

  if (paint.style !== undefined) {
    attributes.style = paint.style;
  }

  return attributes;
}

/**
 * Whether a fill and a stroke can share one element. A paint with a blend
 * mode of its own blends alone in Figma, so it keeps an element of its own.
 */
function shareElement(fill: ChannelPaint | undefined, stroke: ChannelPaint): boolean {
  return fill?.style === undefined && stroke.style === undefined;
}

function pathElement(path: VectorPath, attributes: Record<string, string>): INode {
  const result: Record<string, string> = { d: path.data, ...attributes };

  if (path.windingRule === 'EVENODD') {
    result['fill-rule'] = 'evenodd';
    result['clip-rule'] = 'evenodd';
  }

  return element('path', result);
}

async function channelPaints(ctx: Context, node: SceneNode & GeometryMixin, channel: PaintChannel, size: Size) {
  const paints = channel === 'fill' ? node.fills : node.strokes;

  if (paints === ctx.host.mixed) {
    ctx.warn(`The layer "${node.name}" mixes several ${channel}s in one text and was exported without them.`);

    return [];
  }

  // A bound style keeps its binding while its paint is switched off. Nothing
  // paints then, in Figma and here.
  if (!((paints as ReadonlyArray<Paint>) ?? []).some((paint) => paint.visible !== false)) {
    return [];
  }

  const styleId = channel === 'fill' ? node.fillStyleId : node.strokeStyleId;

  if (typeof styleId === 'string' && styleId !== '' && ctx.hooks.resolveStyle) {
    const resolved = await ctx.hooks.resolveStyle(node, channel, styleId, ctx);

    if (resolved !== undefined) {
      return resolved;
    }
  }

  return ctx.resolvePaints(paints as ReadonlyArray<Paint>, size);
}

type Primitive = { name: 'rect' | 'ellipse' | 'circle'; attributes: Record<string, string> };

const PRIMITIVE_NAMES = new Set<string>(['rect', 'ellipse', 'circle']);

/** The corner radius a rectangle can carry as `rx`, capped at its half size. */
function rectRadius(node: RectangleNode): number {
  return Math.min(node.cornerRadius as number, node.width / 2, node.height / 2);
}

/**
 * The SVG primitive a layer is, when it is one. A rectangle with one radius
 * and no corner smoothing is a `<rect>`, a full ellipse a `<circle>` or an
 * `<ellipse>`. Everything else stays a path from the geometry.
 */
function primitiveOf(ctx: Context, node: SceneNode): Primitive | null {
  if (node.type === 'RECTANGLE') {
    if (node.cornerRadius === ctx.host.mixed) {
      return null;
    }

    const cornerRadius = node.cornerRadius as number;

    if (cornerRadius > 0 && node.cornerSmoothing > 0) {
      return null;
    }

    const attributes: Record<string, string> = {
      width: formatNumber(node.width),
      height: formatNumber(node.height),
    };
    const radius = rectRadius(node);

    if (radius > 0) {
      attributes.rx = formatNumber(radius);
    }

    return { name: 'rect', attributes };
  }

  if (node.type === 'ELLIPSE') {
    const arc = node.arcData;
    const sweep = Math.abs(arc.endingAngle - arc.startingAngle);

    if (arc.innerRadius !== 0 || sweep < Math.PI * 2 - 1e-6) {
      return null;
    }

    const rx = node.width / 2;
    const ry = node.height / 2;

    if (Math.abs(rx - ry) < 1e-6) {
      return { name: 'circle', attributes: { cx: formatNumber(rx), cy: formatNumber(ry), r: formatNumber(rx) } };
    }

    return {
      name: 'ellipse',
      attributes: { cx: formatNumber(rx), cy: formatNumber(ry), rx: formatNumber(rx), ry: formatNumber(ry) },
    };
  }

  return null;
}

/** Moves a pure translation into a primitive's position attributes. */
function placePrimitive(primitive: INode, matrix: Matrix): void {
  if (primitive.name === 'rect') {
    primitive.attributes.x = formatNumber(Number(primitive.attributes.x ?? 0) + matrix.e);
    primitive.attributes.y = formatNumber(Number(primitive.attributes.y ?? 0) + matrix.f);
  } else {
    primitive.attributes.cx = formatNumber(Number(primitive.attributes.cx) + matrix.e);
    primitive.attributes.cy = formatNumber(Number(primitive.attributes.cy) + matrix.f);
  }
}

/**
 * Whether the stroke can travel as `stroke` attributes on the geometry. Figma
 * draws a center stroke the way SVG does, an inside or outside stroke and the
 * arrow caps have no attribute form and use the outlined `strokeGeometry`.
 */
function strokeAsAttributes(ctx: Context, node: SceneNode & GeometryMixin, strokes: ChannelPaint[]): boolean {
  if (node.type === 'TEXT' || node.type === 'BOOLEAN_OPERATION' || strokes.length !== 1) {
    return false;
  }

  if (node.strokeAlign !== 'CENTER' || node.strokeWeight === ctx.host.mixed) {
    return false;
  }

  const cap = node.strokeCap;

  return cap === 'NONE' || cap === 'ROUND' || cap === 'SQUARE';
}

function strokeAttributes(node: SceneNode & GeometryMixin, stroke: ChannelPaint): Record<string, string> {
  const attributes = paintAttributes('stroke', stroke);

  attributes['stroke-width'] = formatNumber(node.strokeWeight as number);

  if (node.strokeCap === 'ROUND') {
    attributes['stroke-linecap'] = 'round';
  } else if (node.strokeCap === 'SQUARE') {
    attributes['stroke-linecap'] = 'square';
  }

  if (node.strokeJoin === 'ROUND') {
    attributes['stroke-linejoin'] = 'round';
  } else if (node.strokeJoin === 'BEVEL') {
    attributes['stroke-linejoin'] = 'bevel';
  } else if (node.strokeMiterLimit !== 4) {
    attributes['stroke-miterlimit'] = formatNumber(node.strokeMiterLimit);
  }

  if (node.dashPattern.length > 0) {
    attributes['stroke-dasharray'] = node.dashPattern.map((v) => formatNumber(v)).join(' ');
  }

  return attributes;
}

/**
 * The primitive a stroke inside or outside a primitive layer runs along:
 * the same shape, moved in or out by half the weight. Figma's own SVG export
 * writes it this way too. A dashed stroke stays outlined, its dashes are laid
 * along the layer's edge and would shift on the shorter or longer line. A
 * radius the move would close, or a shape it would swallow, stays outlined
 * as well.
 */
function alignedPrimitive(
  ctx: Context,
  node: SceneNode & GeometryMixin,
  primitive: Primitive,
  strokes: ChannelPaint[],
): Primitive | null {
  if (node.strokeAlign === 'CENTER' || strokes.length !== 1 || node.strokeWeight === ctx.host.mixed) {
    return null;
  }

  if (node.dashPattern.length > 0) {
    return null;
  }

  const weight = node.strokeWeight as number;
  const delta = node.strokeAlign === 'INSIDE' ? -weight / 2 : weight / 2;

  if (primitive.name === 'rect') {
    const width = node.width + 2 * delta;
    const height = node.height + 2 * delta;
    const radius = rectRadius(node as RectangleNode);

    if (width <= 0 || height <= 0 || (radius > 0 && radius + delta <= 0)) {
      return null;
    }

    const attributes: Record<string, string> = {
      x: formatNumber(-delta),
      y: formatNumber(-delta),
      width: formatNumber(width),
      height: formatNumber(height),
    };

    if (radius > 0) {
      attributes.rx = formatNumber(radius + delta);
    }

    return { name: 'rect', attributes };
  }

  const rx = node.width / 2 + delta;
  const ry = node.height / 2 + delta;

  if (rx <= 0 || ry <= 0) {
    return null;
  }

  const center = { cx: primitive.attributes.cx, cy: primitive.attributes.cy };

  if (primitive.name === 'circle') {
    return { name: 'circle', attributes: { ...center, r: formatNumber(rx) } };
  }

  return { name: 'ellipse', attributes: { ...center, rx: formatNumber(rx), ry: formatNumber(ry) } };
}

/**
 * Whether a stroke covers what lies under it. Only then can the fill and an
 * aligned stroke share one element: the fill would otherwise show through
 * the half of the stroke band that the move took from it.
 */
function coversBelow(paint: ChannelPaint): boolean {
  return paint.opacity === undefined && !paint.translucent;
}

/**
 * Cuts an outlined inside or outside stroke to the side of the fill it
 * belongs on, the way Figma masks its doubled stroke. An inside stroke is
 * clipped to the fill outline, an outside stroke is masked by it. A layer
 * without a fill outline, an open path for example, keeps the outline as
 * it is.
 */
function alignOutlinedStroke(
  ctx: Context,
  node: SceneNode & GeometryMixin,
  outlined: INode[],
  outline: VectorPaths,
): INode[] {
  if (node.strokeAlign === 'CENTER' || outlined.length === 0 || outline.length === 0) {
    return outlined;
  }

  if (node.strokeAlign === 'INSIDE') {
    const id = ctx.nextId('clip');

    ctx.defs.push(
      element(
        'clipPath',
        { id },
        outline.map((path) => pathElement(path, {})),
      ),
    );

    return [element('g', { 'clip-path': `url(#${id})` }, outlined)];
  }

  // A luminance mask: white where the stroke may show, the fill cut out in
  // black. The white covers the stroke's reach, with the miter joins in mind.
  const id = ctx.nextId('mask');
  const margin = strokeWeightOf(ctx, node) * 4;

  ctx.defs.push(
    element('mask', { id }, [
      element('rect', {
        x: formatNumber(-margin),
        y: formatNumber(-margin),
        width: formatNumber(node.width + 2 * margin),
        height: formatNumber(node.height + 2 * margin),
        fill: '#ffffff',
      }),
      ...outline.map((path) => pathElement(path, { fill: '#000000' })),
    ]),
  );

  return [element('g', { mask: `url(#${id})` }, outlined)];
}

/**
 * The centerline a stroke runs along, in the layer's own coordinates. A line
 * layer sits at the bottom edge of its stroke: the stroke rises above the
 * layer's y, and a round or square cap stays inside the layer's width
 * instead of reaching past the end points. Figma's export writes it the same
 * way.
 */
function centerline(node: SceneNode & GeometryMixin, fillGeometry: VectorPaths): VectorPaths {
  if (node.type === 'VECTOR') {
    return node.vectorPaths;
  }

  if (node.type === 'LINE') {
    const half = (node.strokeWeight as number) / 2;
    const inset = node.strokeCap === 'ROUND' || node.strokeCap === 'SQUARE' ? half : 0;

    return [
      {
        windingRule: 'NONE',
        data: `M ${formatNumber(inset)} ${formatNumber(-half)} L ${formatNumber(node.width - inset)} ${formatNumber(-half)}`,
      },
    ];
  }

  return fillGeometry;
}

/**
 * The elements that draw a shape layer, in its own coordinates. One element
 * per fill paint, a stroke on the same element when it is the only one and the
 * stroke has an attribute form, outlined stroke paths otherwise. `outlineOnly`
 * paints the geometry white without a stroke, the way a vector mask uses its
 * outline.
 */
async function shapeElements(
  ctx: Context,
  node: SceneNode & GeometryMixin,
  outlineOnly: boolean,
  primitive: Primitive | null,
): Promise<INode[]> {
  const size: Size = { width: node.width, height: node.height };
  const fills = outlineOnly ? [{ value: '#ffffff' }] : await channelPaints(ctx, node, 'fill', size);
  const strokes = outlineOnly || node.strokeWeight === 0 ? [] : await channelPaints(ctx, node, 'stroke', size);

  // Most containers carry no paint at all, and a primitive never needs its
  // outline, so the geometry is computed on read only where a path comes out.
  if (fills.length === 0 && strokes.length === 0) {
    return [];
  }

  let fillGeometry: VectorPaths | undefined;
  const outline = (): VectorPaths => (fillGeometry ??= node.fillGeometry);
  const elements: INode[] = [];

  // A paint without geometry to draw it with would vanish without a trace,
  // so it is reported with what Figma handed over.
  const missing = (channel: PaintChannel, source: string): void => {
    ctx.warn(
      `The layer "${node.name}" (${node.type}) has a ${channel}, but Figma reports no ${source} for it. The ${channel} was not exported.`,
    );
  };

  /** One primitive, or one path per subpath of the geometry. */
  const draw = (attributes: Record<string, string>, paths: () => VectorPaths): INode[] =>
    primitive !== null
      ? [element(primitive.name, { ...primitive.attributes, ...attributes })]
      : paths().map((path) => pathElement(path, attributes));

  if (fills.length > 0 && primitive === null && outline().length === 0) {
    missing('fill', 'fill geometry');
  }

  for (const fill of fills) {
    elements.push(...draw(paintAttributes('fill', fill), outline));
  }

  if (strokes.length === 0) {
    return elements;
  }

  if (strokeAsAttributes(ctx, node, strokes)) {
    const attributes = strokeAttributes(node, strokes[0]);
    const line = primitive !== null ? [] : centerline(node, outline());

    if (primitive === null && line.length === 0) {
      missing('stroke', node.type === 'VECTOR' ? 'vector path' : 'fill geometry to run along');
    }

    // A single filled element that follows the same outline takes the stroke
    // itself. A vector's fill geometry can differ from its centerline (an
    // open path fills nothing), so those get a stroke element of their own.
    if (
      elements.length === 1 &&
      shareElement(fills[0], strokes[0]) &&
      (primitive !== null || (node.type !== 'VECTOR' && outline().length === 1 && line.length === 1))
    ) {
      Object.assign(elements[0].attributes, attributes);

      return elements;
    }

    elements.push(...draw({ fill: 'none', ...attributes }, () => line));

    return elements;
  }

  // An inside or outside stroke on a primitive runs along a moved primitive.
  const aligned = primitive !== null ? alignedPrimitive(ctx, node, primitive, strokes) : null;

  if (aligned !== null) {
    const attributes = strokeAttributes(node, strokes[0]);

    if (elements.length === 1 && fills.length === 1 && coversBelow(strokes[0]) && shareElement(fills[0], strokes[0])) {
      Object.assign(elements[0].attributes, aligned.attributes, attributes);

      return elements;
    }

    elements.push(element(aligned.name, { ...aligned.attributes, fill: 'none', ...attributes }));

    return elements;
  }

  // Outlined strokes are filled shapes, so they never take the primitive form.
  const strokeGeometry = node.strokeGeometry;
  const outlined: INode[] = [];

  if (strokeGeometry.length === 0) {
    missing('stroke', 'stroke geometry');
  }

  for (const stroke of strokes) {
    for (const path of strokeGeometry) {
      outlined.push(pathElement(path, paintAttributes('fill', stroke)));
    }
  }

  elements.push(...alignOutlinedStroke(ctx, node, outlined, outline()));

  return elements;
}

/**
 * Puts the layer's transform, opacity and blend mode on its elements: on the
 * element itself when there is one, on a group around them otherwise. A pure
 * translation moves into a primitive's position instead of a transform. An
 * element that already carries a transform of its own keeps it inside the
 * layer's.
 */
function placeElements(
  elements: INode[],
  matrix: Matrix,
  attributes: Record<string, string>,
  primitive: boolean,
): INode[] {
  if (elements.length === 0) {
    return [];
  }

  const transform = toAttribute(matrix);

  // A single element takes the layer's attributes itself, unless it already
  // carries one of them. A child's opacity or blend mode composes with the
  // layer's, so that case gets a group.
  if (
    elements.length === 1 &&
    elements[0].type === 'element' &&
    !Object.keys(attributes).some((key) => key in elements[0].attributes)
  ) {
    const [only] = elements;

    // Outlined strokes leave a primitive layer as paths, or as a clipped
    // group, which have no position attributes to move. A gradient is written
    // in the layer's coordinates and only follows a transform, not a position.
    const paintsDef = ['fill', 'stroke'].some((key) => only.attributes[key]?.startsWith('url('));

    if (primitive && !paintsDef && PRIMITIVE_NAMES.has(only.name) && isTranslation(matrix)) {
      if (!isIdentity(matrix)) {
        placePrimitive(only, matrix);
      }
    } else if (transform !== undefined) {
      only.attributes.transform =
        only.attributes.transform === undefined ? transform : `${transform} ${only.attributes.transform}`;
    }

    Object.assign(only.attributes, attributes);

    return [only];
  }

  const groupAttributes: Record<string, string> = { ...attributes };

  if (transform !== undefined) {
    groupAttributes.transform = transform;
  }

  // Nothing to carry, so no group: the elements stand as siblings.
  if (Object.keys(groupAttributes).length === 0) {
    return elements;
  }

  return [element('g', groupAttributes, elements)];
}

/**
 * Opacity and blend mode as attributes. A mask keeps its opacity, which
 * weakens the mask the way it does in Figma, and drops its blend mode, which
 * has nothing to blend with inside `<mask>`. That holds for a vector mask
 * too: Figma takes its outline in place of its paint, but a layer opacity
 * inside it still thins the mask, and Figma's own export writes it the same
 * way (a white outline with the opacity on it).
 */
function blendAttributes(ctx: Context, node: SceneNode, mode: MaskMode): Record<string, string> {
  const attributes: Record<string, string> = {};

  if ('opacity' in node && node.opacity !== 1) {
    attributes.opacity = formatNumber(node.opacity);
  }

  if (mode !== false) {
    return attributes;
  }

  if ('blendMode' in node) {
    const style = blendModeStyle(node.blendMode, ctx.warn);

    if (style !== undefined) {
      attributes.style = style;
    }
  }

  return attributes;
}

/** The stroke weight, the largest side for a rectangle with individual sides. */
function strokeWeightOf(ctx: Context, node: SceneNode & GeometryMixin): number {
  return node.strokeWeight !== ctx.host.mixed
    ? (node.strokeWeight as number)
    : 'strokeTopWeight' in node
      ? Math.max(node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight)
      : 0;
}

/** How far a shape's stroke reaches beyond its box. */
function strokeOutset(ctx: Context, node: SceneNode & GeometryMixin): number {
  const strokes = node.strokes;

  if (strokes === ctx.host.mixed || !strokes.some((stroke) => stroke.visible !== false)) {
    return 0;
  }

  const weight = strokeWeightOf(ctx, node);

  // A line's stroke sits entirely above its zero-height box, see centerline().
  if (node.type === 'LINE') {
    return weight;
  }

  if (node.strokeAlign === 'INSIDE') {
    return 0;
  }

  return node.strokeAlign === 'CENTER' ? weight / 2 : weight;
}

/** The box of a shape: its layout plus the stroke around it. */
function shapeBox(ctx: Context, node: SceneNode): FilterBox {
  const outset = 'strokes' in node ? strokeOutset(ctx, node as SceneNode & GeometryMixin) : 0;

  return { x: -outset, y: -outset, width: node.width + 2 * outset, height: node.height + 2 * outset };
}

/** The axis-aligned box around a box after a transform. */
function mapBox(matrix: Matrix, box: FilterBox): FilterBox {
  const corners = [
    apply(matrix, box.x, box.y),
    apply(matrix, box.x + box.width, box.y),
    apply(matrix, box.x, box.y + box.height),
    apply(matrix, box.x + box.width, box.y + box.height),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** A box grown by a reach on every side. */
function growBox(box: FilterBox, reach: { x: number; y: number }): FilterBox {
  return { x: box.x - reach.x, y: box.y - reach.y, width: box.width + 2 * reach.x, height: box.height + 2 * reach.y };
}

function unionBox(boxes: FilterBox[]): FilterBox {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return { x, y, width: right - x, height: bottom - y };
}

/**
 * The rectangle a layer paints, in the coordinates its elements are written
 * in. A shape is its box plus the stroke around it. A container is its own
 * box joined with the boxes of its visible children, each grown by the
 * reach of the child's own effects and mapped by the child's transform, so
 * children outside the layout and their shadows count too. A group has
 * no box of its own: its children are placed in the parent's coordinates,
 * and so is the group's filter.
 *
 * Figma's render bounds are of no use here: they are cut at a clipping
 * ancestor, and for a group they sit in a coordinate system the elements
 * are not written in.
 */
function paintedBox(ctx: Context, node: SceneNode): FilterBox {
  if (!CONTAINER_TYPES.has(node.type)) {
    return shapeBox(ctx, node);
  }

  const boxes: FilterBox[] = node.type === 'GROUP' ? [] : [shapeBox(ctx, node)];

  if ('children' in node) {
    for (const child of node.children) {
      if (!child.visible) {
        continue;
      }

      const matrix = child.type === 'GROUP' ? IDENTITY : fromTransform(child.relativeTransform);

      boxes.push(mapBox(matrix, growBox(paintedBox(ctx, child), effectReach('effects' in child ? child.effects : []))));
    }
  }

  return boxes.length > 0 ? unionBox(boxes) : { x: 0, y: 0, width: node.width, height: node.height };
}

/**
 * Wraps the layer's elements in the filter for its effects, when it has any.
 * The elements are in the layer's own coordinates, so the region is written
 * in them, see {@link FilterBox}.
 */
function applyEffects(ctx: Context, node: SceneNode, elements: INode[], mode: MaskMode): INode[] {
  if (elements.length === 0 || !('effects' in node) || !node.effects.some((effect) => effect.visible)) {
    return elements;
  }

  // A vector mask is its outline alone, a blur or shadow would not reach it.
  if (mode === 'outline') {
    ctx.warn(`The mask "${node.name}" has effects, which a vector mask cannot carry. It masks by its outline.`);

    return elements;
  }

  const filter = effectsToFilter(node.effects, paintedBox(ctx, node), ctx.nextId('filter'), ctx.warn);

  if (filter === null) {
    return elements;
  }

  ctx.defs.push(filter);

  return [element('g', { filter: `url(#${filter.attributes.id})` }, elements)];
}

/**
 * The elements of a container: its own fill and stroke first, then the
 * children in layer order with masks applied. A frame that clips its content
 * gets a clip path from its outline, when the export clips frames at all.
 */
async function containerElements(ctx: Context, node: SceneNode & ChildrenMixin, mode: MaskMode): Promise<INode[]> {
  // A container's own fill and stroke, never in primitive form: its box is
  // the layout, and its children follow in the same coordinates.
  const own =
    'fillGeometry' in node ? await shapeElements(ctx, node as SceneNode & GeometryMixin, mode === 'outline', null) : [];
  const children = await serializeChildren(ctx, node.children, mode);

  if (ctx.clipFrames && 'clipsContent' in node && node.clipsContent && children.length > 0) {
    const id = ctx.nextId('clip');
    const outline = (node as SceneNode & GeometryMixin).fillGeometry;
    const shape =
      outline.length > 0
        ? outline.map((path) => pathElement(path, {}))
        : [element('rect', { width: formatNumber(node.width), height: formatNumber(node.height) })];

    ctx.defs.push(element('clipPath', { id }, shape));

    return [...own, element('g', { 'clip-path': `url(#${id})` }, children)];
  }

  return [...own, ...children];
}

async function serializeChildren(ctx: Context, children: readonly SceneNode[], mode: MaskMode): Promise<INode[]> {
  const plan = planMaskedSiblings(
    children.filter((child) => child.visible),
    (child) => 'isMask' in child && child.isMask,
  );

  return serializePlan(ctx, plan, mode);
}

async function serializePlan(ctx: Context, plan: MaskPlanItem<SceneNode>[], mode: MaskMode): Promise<INode[]> {
  const result: INode[] = [];

  for (const item of plan) {
    if (item.kind === 'node') {
      result.push(...(await serializeNode(ctx, item.node, mode)));

      continue;
    }

    const masked = await serializePlan(ctx, item.children, mode);

    if (masked.length === 0) {
      continue;
    }

    // An empty mask, or one at zero opacity, hides everything it masks. That
    // is what Figma shows, but rarely what the designer meant, so it is
    // reported.
    if ('opacity' in item.mask && item.mask.opacity === 0) {
      ctx.warn(`The mask "${item.mask.name}" is at zero opacity, so the layers it masks were not exported.`);

      continue;
    }

    const maskType = 'maskType' in item.mask ? item.mask.maskType : 'ALPHA';
    const content = await serializeNode(ctx, item.mask, maskType === 'VECTOR' ? 'outline' : 'paint');

    if (content.length === 0) {
      ctx.warn(`The mask "${item.mask.name}" has no content, so the layers it masks were not exported.`);

      continue;
    }

    const id = ctx.nextId('mask');
    const attributes: Record<string, string> = { id };

    // A vector mask uses its outline, an alpha mask its transparency. Both are
    // alpha masks to SVG, a luminance mask is the SVG default.
    if (maskType !== 'LUMINANCE') {
      attributes.style = 'mask-type:alpha';
    }

    ctx.defs.push(element('mask', attributes, content));
    result.push(element('g', { mask: `url(#${id})` }, masked));
  }

  return result;
}

/**
 * The elements of one layer in its parent's coordinates. A mask mode renders
 * the layer as mask content: a vector mask as its white outline, an alpha or
 * luminance mask as it paints, with its opacity and effects and without its
 * blend mode.
 */
async function serializeNode(ctx: Context, node: SceneNode, mode: MaskMode): Promise<INode[]> {
  await breathe(ctx);

  const asMask = mode !== false;

  // Figma's export leaves a layer at zero opacity out, and so does this one.
  if (!asMask && 'opacity' in node && node.opacity === 0) {
    return [];
  }

  // A group has no coordinate system of its own: Figma places its children,
  // and the group itself, relative to the nearest frame. Its transform is
  // derived from theirs and must not be applied a second time.
  const matrix = node.type === 'GROUP' ? IDENTITY : fromTransform(node.relativeTransform);
  const attributes = blendAttributes(ctx, node, mode);
  let raw = ctx.hooks.resolveNode ? await ctx.hooks.resolveNode(node, asMask, ctx) : undefined;
  let primitive: Primitive | null = null;

  if (raw !== undefined) {
    // The hook owns the layer.
  } else if (CONTAINER_TYPES.has(node.type)) {
    raw = await containerElements(ctx, node as SceneNode & ChildrenMixin, mode);
  } else if (SHAPE_TYPES.has(node.type)) {
    // A text keeps its glyphs even in a vector mask.
    const outlineOnly = mode === 'outline' && node.type !== 'TEXT';

    primitive = primitiveOf(ctx, node);
    raw = await shapeElements(ctx, node as SceneNode & GeometryMixin, outlineOnly, primitive);
  } else {
    ctx.warn(`The layer "${node.name}" (${node.type}) has no SVG equivalent and was not exported.`);

    return [];
  }

  // The filter wraps the elements before they are placed, so its region is in
  // the layer's coordinates and the layer's opacity applies to the shadows
  // too. A filtered primitive is a group by then and takes a transform.
  const filtered = applyEffects(ctx, node, raw, mode);
  const placed = placeElements(filtered, matrix, attributes, primitive !== null && filtered === raw);

  return ctx.hooks.wrapNode ? ctx.hooks.wrapNode(node, placed, asMask, ctx) : placed;
}

function createContext(options: SerializeOptions): Context {
  const warn = options.warn ?? (() => {});
  const ids = new Map<string, number>();
  const nextId = (kind: string): string => {
    const count = ids.get(kind) ?? 0;

    ids.set(kind, count + 1);

    return `${kind}${count}`;
  };
  const ctx: Context = {
    host: options.host,
    hooks: options.hooks ?? {},
    warn,
    clipFrames: options.clipFrames ?? true,
    lastYield: Date.now(),
    defs: [],
    nextId,
    resolvePaints: (paints, size) => {
      const result: ChannelPaint[] = [];

      for (const paint of paints) {
        const resolved = resolvePaint(paint, size, (kind) => nextId(`paint_${kind}`), warn);

        if (resolved === null) {
          continue;
        }

        if (resolved.def) {
          ctx.defs.push(resolved.def);
        }

        // A paint blends on its own, apart from the layer's blend mode.
        const style = blendModeStyle(paint.blendMode ?? 'NORMAL', warn);

        result.push({
          value: resolved.value,
          opacity: resolved.opacity,
          ...(resolved.def ? { translucent: true } : {}),
          ...(style !== undefined ? { style } : {}),
        });
      }

      return result;
    },
  };

  return ctx;
}

/** The `<svg>` tree of the root's contents, definitions last. */
export async function serializeTree(root: SceneNode & ChildrenMixin, options: SerializeOptions): Promise<INode> {
  const ctx = createContext(options);
  const body = await serializeChildren(ctx, root.children, false);
  const children = ctx.defs.length > 0 ? [...body, element('defs', {}, ctx.defs)] : body;

  return element(
    'svg',
    {
      width: formatNumber(root.width),
      height: formatNumber(root.height),
      viewBox: `0 0 ${formatNumber(root.width)} ${formatNumber(root.height)}`,
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
    },
    children,
  );
}

/** The SVG of the root's contents as a string. */
export async function serializeToSvg(root: SceneNode & ChildrenMixin, options: SerializeOptions): Promise<string> {
  return stringify(await serializeTree(root, options));
}
