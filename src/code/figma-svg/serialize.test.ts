import { describe, expect, it } from 'vitest';
import { stringify } from 'svgson';

import { textNode } from './element';
import { serializeTree } from './serialize';
import type { SerializeOptions } from './types';

const MIXED = Symbol('mixed');

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
] as const;

function translate(x: number, y: number) {
  return [
    [1, 0, x],
    [0, 1, y],
  ] as const;
}

const solid = (r: number, g: number, b: number) => ({ type: 'SOLID', color: { r, g, b } });

/** A shape layer with the properties the serializer reads. */
function shape(type: string, props: Record<string, unknown>) {
  return {
    type,
    name: type.toLowerCase(),
    visible: true,
    opacity: 1,
    blendMode: 'PASS_THROUGH',
    isMask: false,
    maskType: 'ALPHA',
    effects: [],
    relativeTransform: IDENTITY,
    width: 10,
    height: 10,
    fills: [],
    strokes: [],
    fillStyleId: '',
    strokeStyleId: '',
    strokeWeight: 1,
    strokeAlign: 'CENTER',
    strokeCap: 'NONE',
    strokeJoin: 'MITER',
    strokeMiterLimit: 4,
    dashPattern: [],
    cornerRadius: 0,
    cornerSmoothing: 0,
    arcData: { startingAngle: 0, endingAngle: Math.PI * 2, innerRadius: 0 },
    fillGeometry: [{ windingRule: 'NONZERO', data: 'M0 0H10V10H0Z' }],
    strokeGeometry: [],
    vectorPaths: [],
    ...props,
  } as unknown as SceneNode;
}

function container(type: string, children: SceneNode[], props: Record<string, unknown> = {}) {
  return shape(type, { children, fillGeometry: [], clipsContent: false, ...props });
}

function options(extra: Partial<SerializeOptions> = {}): SerializeOptions {
  return {
    host: { mixed: MIXED },
    ...extra,
  };
}

async function svg(root: SceneNode, extra: Partial<SerializeOptions> = {}): Promise<string> {
  return stringify(await serializeTree(root as SceneNode & ChildrenMixin, options(extra))).replace(
    /^<svg[^>]*>|<\/svg>$/g,
    '',
  );
}

describe('serializeTree', () => {
  it('writes a translated rectangle as a placed rect', async () => {
    const root = container('FRAME', [
      shape('RECTANGLE', { relativeTransform: translate(5, 6), fills: [solid(1, 0, 0)], width: 10, height: 4 }),
    ]);

    expect(await svg(root)).toBe('<rect width="10" height="4" fill="#ff0000" x="5" y="6"/>');
  });

  it('does not apply a group transform, its children already sit in frame coordinates', async () => {
    const child = shape('ELLIPSE', { relativeTransform: translate(20, 20), fills: [solid(0, 0, 1)] });
    const group = container('GROUP', [child], { relativeTransform: translate(20, 20) });

    expect(await svg(container('FRAME', [group]))).toBe('<circle cx="25" cy="25" r="5" fill="#0000ff"/>');
  });

  it('keeps a frame transform and clips its children when asked', async () => {
    const inner = container('FRAME', [shape('RECTANGLE', { fills: [solid(0, 1, 0)] })], {
      relativeTransform: translate(3, 0),
      clipsContent: true,
      fillGeometry: [{ windingRule: 'NONZERO', data: 'M0 0H10V10H0Z' }],
    });

    expect(await svg(container('FRAME', [inner]), { clipFrames: true })).toBe(
      '<g clip-path="url(#clip0)" transform="translate(3 0)"><rect width="10" height="10" fill="#00ff00"/></g>' +
        '<defs><clipPath id="clip0"><path d="M0 0H10V10H0Z"/></clipPath></defs>',
    );
    expect(await svg(container('FRAME', [inner]), { clipFrames: false })).toBe(
      '<rect width="10" height="10" fill="#00ff00" transform="translate(3 0)"/>',
    );
  });

  it('puts a center stroke on the element and clips an outlined inside stroke to the fill', async () => {
    const centered = shape('RECTANGLE', { fills: [solid(0, 0, 0)], strokes: [solid(1, 1, 1)], strokeWeight: 2 });
    // Figma outlines an inside stroke with twice the weight, the half outside
    // the fill has to go.
    const inside = shape('VECTOR', {
      fills: [solid(0, 0, 0)],
      strokes: [solid(1, 1, 1)],
      strokeAlign: 'INSIDE',
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M-1 -1H11V11H-1ZM1 1H9V9H1Z' }],
    });

    expect(await svg(container('FRAME', [centered]))).toBe(
      '<rect width="10" height="10" fill="#000000" stroke="#ffffff" stroke-width="2"/>',
    );
    expect(await svg(container('FRAME', [inside]))).toBe(
      '<path d="M0 0H10V10H0Z" fill="#000000"/>' +
        '<g clip-path="url(#clip0)">' +
        '<path d="M-1 -1H11V11H-1ZM1 1H9V9H1Z" fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd"/>' +
        '</g>' +
        '<defs><clipPath id="clip0"><path d="M0 0H10V10H0Z"/></clipPath></defs>',
    );
  });

  it('masks an outlined outside stroke by the fill', async () => {
    const outside = shape('VECTOR', {
      fills: [solid(0, 0, 0)],
      strokes: [solid(1, 1, 1)],
      strokeAlign: 'OUTSIDE',
      strokeWeight: 1,
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M-1 -1H11V11H-1ZM1 1H9V9H1Z' }],
    });

    expect(await svg(container('FRAME', [outside]))).toBe(
      '<path d="M0 0H10V10H0Z" fill="#000000"/>' +
        '<g mask="url(#mask0)">' +
        '<path d="M-1 -1H11V11H-1ZM1 1H9V9H1Z" fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd"/>' +
        '</g>' +
        '<defs><mask id="mask0">' +
        '<rect x="-4" y="-4" width="18" height="18" fill="#ffffff"/><path d="M0 0H10V10H0Z" fill="#000000"/>' +
        '</mask></defs>',
    );
  });

  it('runs an inside or outside stroke on a primitive along the moved primitive', async () => {
    const circle = shape('ELLIPSE', {
      relativeTransform: translate(40, 60),
      fills: [solid(1, 0, 0)],
      strokes: [solid(0, 0, 0)],
      strokeAlign: 'INSIDE',
      strokeWeight: 2,
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M0 0' }],
    });
    const rounded = shape('RECTANGLE', {
      relativeTransform: translate(3, 4),
      strokes: [solid(0, 0, 0)],
      strokeAlign: 'OUTSIDE',
      strokeWeight: 2,
      cornerRadius: 2,
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M0 0' }],
    });

    // An opaque stroke and the fill share one element: the moved circle with
    // the stroke on it shows the same pixels as Figma.
    expect(await svg(container('FRAME', [circle]))).toBe(
      '<circle cx="45" cy="65" r="4" fill="#ff0000" stroke="#000000" stroke-width="2"/>',
    );
    expect(await svg(container('FRAME', [rounded]))).toBe(
      '<rect x="2" y="3" width="12" height="12" rx="3" fill="none" stroke="#000000" stroke-width="2"/>',
    );
  });

  it('keeps the fill under a translucent aligned stroke on its own element', async () => {
    const rect = shape('RECTANGLE', {
      fills: [solid(1, 0, 0)],
      strokes: [{ ...solid(0, 0, 0), opacity: 0.5 }],
      strokeAlign: 'INSIDE',
      strokeWeight: 2,
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M0 0' }],
    });

    expect(await svg(container('FRAME', [rect]))).toBe(
      '<rect width="10" height="10" fill="#ff0000"/>' +
        '<rect x="1" y="1" width="8" height="8" fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="2"/>',
    );
  });

  it('masks the siblings above a mask with its white outline', async () => {
    const mask = shape('ELLIPSE', { isMask: true, maskType: 'VECTOR', fills: [solid(1, 0, 0)] });
    const above = shape('RECTANGLE', { fills: [solid(0, 0, 1)] });
    const below = shape('RECTANGLE', { fills: [solid(0, 1, 0)] });

    expect(await svg(container('FRAME', [below, mask, above]))).toBe(
      '<rect width="10" height="10" fill="#00ff00"/>' +
        '<g mask="url(#mask0)"><rect width="10" height="10" fill="#0000ff"/></g>' +
        '<defs><mask id="mask0" style="mask-type:alpha"><circle cx="5" cy="5" r="5" fill="#ffffff"/></mask></defs>',
    );
  });

  it('keeps a child opacity under a group opacity instead of replacing it', async () => {
    const child = shape('RECTANGLE', { opacity: 0.8, fills: [solid(0, 0, 0)] });

    expect(await svg(container('FRAME', [container('GROUP', [child], { opacity: 0.5 })]))).toBe(
      '<g opacity="0.5"><rect width="10" height="10" fill="#000000" opacity="0.8"/></g>',
    );
  });

  it('moves an outlined stroke on a primitive by a transform, not by position attributes', async () => {
    // A dashed inside stroke stays outlined, its dashes would shift on a
    // moved primitive. The outline is clipped to the fill like any other.
    const ring = shape('ELLIPSE', {
      relativeTransform: translate(40, 60),
      strokes: [solid(0, 0, 0)],
      strokeAlign: 'INSIDE',
      dashPattern: [2, 2],
      fillGeometry: [{ windingRule: 'NONZERO', data: 'M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5Z' }],
      strokeGeometry: [
        { windingRule: 'EVENODD', data: 'M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5ZM1 5A4 4 0 1 0 9 5A4 4 0 1 0 1 5Z' },
      ],
    });

    expect(await svg(container('FRAME', [ring]))).toBe(
      '<g clip-path="url(#clip0)" transform="translate(40 60)">' +
        '<path d="M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5ZM1 5A4 4 0 1 0 9 5A4 4 0 1 0 1 5Z" fill="#000000" fill-rule="evenodd" clip-rule="evenodd"/>' +
        '</g>' +
        '<defs><clipPath id="clip0"><path d="M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5Z"/></clipPath></defs>',
    );
  });

  it('outlines the children of a vector group mask and warns about an empty mask', async () => {
    const warnings: string[] = [];
    const inner = shape('RECTANGLE', { fills: [solid(1, 0, 0)] });
    const groupMask = container('GROUP', [inner], { isMask: true, maskType: 'VECTOR', name: 'group mask' });
    const above = shape('RECTANGLE', { fills: [solid(0, 0, 1)] });

    expect(await svg(container('FRAME', [groupMask, above]))).toBe(
      '<g mask="url(#mask0)"><rect width="10" height="10" fill="#0000ff"/></g>' +
        '<defs><mask id="mask0" style="mask-type:alpha"><rect width="10" height="10" fill="#ffffff"/></mask></defs>',
    );

    const emptyMask = shape('RECTANGLE', { isMask: true, maskType: 'ALPHA', name: 'empty' });

    expect(await svg(container('FRAME', [emptyMask, above]), { warn: (m) => warnings.push(m) })).toBe('');
    expect(warnings).toEqual(['The mask "empty" has no content, so the layers it masks were not exported.']);
  });

  it('writes the blend mode of a paint on its own element', async () => {
    const layered = shape('RECTANGLE', {
      fills: [solid(0, 0, 0), { ...solid(1, 1, 1), blendMode: 'SCREEN' }],
      strokes: [{ ...solid(1, 0, 0), blendMode: 'MULTIPLY' }],
      strokeWeight: 2,
    });

    expect(await svg(container('FRAME', [layered]))).toBe(
      '<rect width="10" height="10" fill="#000000"/>' +
        '<rect width="10" height="10" fill="#ffffff" style="mix-blend-mode:screen"/>' +
        '<rect width="10" height="10" fill="none" stroke="#ff0000" style="mix-blend-mode:multiply" stroke-width="2"/>',
    );
  });

  it('raises a line stroke above the layer and keeps its caps inside the width', async () => {
    const plain = shape('LINE', { height: 0, width: 10, strokes: [solid(0, 0, 0)], strokeWeight: 2 });
    const capped = shape('LINE', {
      height: 0,
      width: 10,
      strokes: [solid(0, 0, 0)],
      strokeWeight: 2,
      strokeCap: 'ROUND',
    });

    expect(await svg(container('FRAME', [plain]))).toBe(
      '<path d="M 0 -1 L 10 -1" fill="none" stroke="#000000" stroke-width="2"/>',
    );
    expect(await svg(container('FRAME', [capped]))).toBe(
      '<path d="M 1 -1 L 9 -1" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round"/>',
    );
  });

  it('writes a shape filter in layer coordinates and places the filtered group', async () => {
    const line = shape('LINE', {
      relativeTransform: translate(3, 4),
      height: 0,
      width: 10,
      strokes: [solid(0, 0, 0)],
      strokeWeight: 2,
      effects: [{ type: 'LAYER_BLUR', radius: 2, visible: true }],
    });
    const out = await svg(container('FRAME', [line]));

    expect(out).toContain('<g filter="url(#filter0)" transform="translate(3 4)">');
    expect(out).toContain(
      '<filter id="filter0" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="-5" y="-5" width="20" height="10">',
    );
  });

  it('reports a fill or stroke that Figma hands over without geometry', async () => {
    const warnings: string[] = [];
    const noFill = shape('VECTOR', { name: 'blob', fills: [solid(0, 0, 0)], fillGeometry: [] });
    const noCenterline = shape('VECTOR', { name: 'scribble', strokes: [solid(0, 0, 0)], vectorPaths: [] });
    const noOutline = shape('VECTOR', {
      name: 'band',
      strokes: [solid(0, 0, 0)],
      strokeAlign: 'INSIDE',
      strokeGeometry: [],
    });

    expect(await svg(container('FRAME', [noFill, noCenterline, noOutline]), { warn: (m) => warnings.push(m) })).toBe(
      '',
    );
    expect(warnings).toEqual([
      'The layer "blob" (VECTOR) has a fill, but Figma reports no fill geometry for it. The fill was not exported.',
      'The layer "scribble" (VECTOR) has a stroke, but Figma reports no vector path for it. The stroke was not exported.',
      'The layer "band" (VECTOR) has a stroke, but Figma reports no stroke geometry for it. The stroke was not exported.',
    ]);
  });

  it('sizes a line filter for the stroke above the layer even without vertical reach', async () => {
    const line = shape('LINE', {
      height: 0,
      width: 10,
      strokes: [solid(0, 0, 0)],
      strokeWeight: 2,
      effects: [
        { type: 'INNER_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.5 }, offset: { x: 0, y: 0 }, radius: 0, visible: true },
      ],
    });

    expect(await svg(container('FRAME', [line]))).toContain(
      '<filter id="filter0" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="-2" y="-2" width="14" height="4">',
    );
  });

  it('sizes a container filter from its box and its visible children, strokes included', async () => {
    const inside = shape('RECTANGLE', { relativeTransform: translate(30, 30), fills: [solid(0, 0, 0)] });
    const outside = shape('RECTANGLE', {
      relativeTransform: translate(45, 45),
      fills: [solid(0, 0, 0)],
      strokes: [solid(0, 0, 0)],
      strokeWeight: 4,
      strokeAlign: 'OUTSIDE',
    });
    const hidden = shape('RECTANGLE', {
      relativeTransform: translate(90, 90),
      fills: [solid(0, 0, 0)],
      visible: false,
    });
    const frame = container('FRAME', [inside, outside, hidden], {
      relativeTransform: translate(100, 100),
      width: 50,
      height: 50,
      absoluteTransform: translate(100, 100),
      // Cut at a clipping ancestor, so of no use for the region.
      absoluteRenderBounds: { x: 100, y: 100, width: 50, height: 50 },
      effects: [{ type: 'LAYER_BLUR', radius: 2, visible: true }],
    });

    // Frame 0..50, outside child 41..59 with its stroke, blur reach 3.
    expect(await svg(container('FRAME', [frame]))).toContain(
      '<filter id="filter0" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="-3" y="-3" width="65" height="65">',
    );
  });

  it("grows a container filter by the reach of a child's own effects", async () => {
    const child = shape('RECTANGLE', {
      relativeTransform: translate(10, 10),
      fills: [solid(0, 0, 0)],
      effects: [
        {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 1 },
          offset: { x: 30, y: 30 },
          radius: 10,
          visible: true,
        },
      ],
    });
    const frame = container('FRAME', [child], {
      width: 50,
      height: 50,
      effects: [{ type: 'LAYER_BLUR', radius: 2, visible: true }],
    });

    // Child 10..20, its shadow reaches 45 to -35..65, the frame's blur adds 3.
    expect(await svg(container('FRAME', [frame]))).toContain(
      '<filter id="filter1" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="-38" y="-38" width="106" height="106">',
    );
  });

  it("sizes a group filter in the parent's coordinates, where the group's children are placed", async () => {
    const child = shape('RECTANGLE', { relativeTransform: translate(-5, -5), fills: [solid(0, 0, 0)] });
    const group = container('GROUP', [child], {
      relativeTransform: translate(-5, -5),
      absoluteTransform: translate(-5, -5),
      absoluteRenderBounds: { x: 0, y: 0, width: 5, height: 5 },
      effects: [{ type: 'LAYER_BLUR', radius: 2, visible: true }],
    });
    const out = await svg(container('FRAME', [group], { width: 20, height: 20, clipsContent: true }));

    expect(out).toContain('<g filter="url(#filter0)"><rect width="10" height="10" fill="#000000" x="-5" y="-5"/></g>');
    expect(out).toContain(
      '<filter id="filter0" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="-8" y="-8" width="16" height="16">',
    );
  });

  it('moves a primitive with a gradient by a transform so the gradient follows', async () => {
    const rect = shape('RECTANGLE', {
      relativeTransform: translate(20, 30),
      width: 100,
      height: 50,
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          gradientTransform: [
            [0, 1, 0],
            [-1, 0, 1],
          ],
          gradientStops: [
            { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
          ],
        },
      ],
    });

    expect(await svg(container('FRAME', [rect]))).toContain(
      '<rect width="100" height="50" fill="url(#paint_linear0)" transform="translate(20 30)"/>',
    );
  });

  it('leaves out a bound paint that is switched off', async () => {
    const bound = shape('RECTANGLE', { fillStyleId: 'S:1', fills: [{ ...solid(0, 0, 0), visible: false }] });

    expect(
      await svg(container('FRAME', [bound]), {
        hooks: { resolveStyle: () => [{ value: '{{colors.skin}}' }] },
      }),
    ).toBe('');
  });

  it('keeps the fill under a translucent placeholder stroke on its own element', async () => {
    const rect = shape('RECTANGLE', {
      fills: [solid(1, 0, 0)],
      strokes: [solid(0, 0, 0)],
      strokeStyleId: 'S:1',
      strokeAlign: 'INSIDE',
      strokeWeight: 2,
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M0 0' }],
    });

    expect(
      await svg(container('FRAME', [rect]), {
        hooks: { resolveStyle: () => [{ value: '{{colors.line}}', translucent: true }] },
      }),
    ).toBe(
      '<rect width="10" height="10" fill="#ff0000"/>' +
        '<rect x="1" y="1" width="8" height="8" fill="none" stroke="{{colors.line}}" stroke-width="2"/>',
    );
  });

  it('keeps the opacity of any mask and the effects of a painted one, and reports effects on a vector mask', async () => {
    const warnings: string[] = [];
    const above = shape('RECTANGLE', { fills: [solid(0, 0, 1)] });
    const soft = shape('ELLIPSE', {
      name: 'soft',
      isMask: true,
      opacity: 0.5,
      fills: [solid(1, 0, 0)],
      effects: [{ type: 'LAYER_BLUR', radius: 2, visible: true }],
    });

    expect(await svg(container('FRAME', [soft, above]), { warn: (m) => warnings.push(m) })).toBe(
      '<g mask="url(#mask0)"><rect width="10" height="10" fill="#0000ff"/></g>' +
        '<defs><filter id="filter0" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="-3" y="-3" width="16" height="16">' +
        '<feFlood flood-opacity="0" result="r0"/><feBlend mode="normal" in="SourceGraphic" in2="r0" result="r1"/>' +
        '<feGaussianBlur in="r1" stdDeviation="1" result="r2"/></filter>' +
        '<mask id="mask0" style="mask-type:alpha"><g filter="url(#filter0)" opacity="0.5"><circle cx="5" cy="5" r="5" fill="#ff0000"/></g></mask></defs>',
    );
    expect(warnings).toEqual([]);

    const outline = shape('ELLIPSE', { ...soft, maskType: 'VECTOR' });

    // Figma thins a vector mask by the layer opacity as well, its own export
    // writes the white outline with the opacity on it.
    expect(await svg(container('FRAME', [outline, above]), { warn: (m) => warnings.push(m) })).toContain(
      '<mask id="mask0" style="mask-type:alpha"><circle cx="5" cy="5" r="5" fill="#ffffff" opacity="0.5"/></mask>',
    );
    expect(warnings).toEqual([
      'The mask "soft" has effects, which a vector mask cannot carry. It masks by its outline.',
    ]);
  });

  it('keeps the opacity of a layer inside a vector mask group, the way the pixel-art beards are built', async () => {
    const inner = shape('BOOLEAN_OPERATION', { name: 'union', opacity: 0.9, fills: [solid(1, 0, 0)] });
    const mask = container('GROUP', [inner], { name: 'mask', isMask: true, maskType: 'VECTOR' });
    const above = shape('RECTANGLE', { fills: [solid(0, 0, 1)] });

    expect(await svg(container('FRAME', [mask, above]))).toContain(
      '<mask id="mask0" style="mask-type:alpha"><path d="M0 0H10V10H0Z" fill="#ffffff" opacity="0.9"/></mask>',
    );
  });

  it('hides the layers under a mask at zero opacity and says so', async () => {
    const warnings: string[] = [];
    const mask = shape('ELLIPSE', { name: 'off', isMask: true, opacity: 0, fills: [solid(1, 0, 0)] });
    const above = shape('RECTANGLE', { fills: [solid(0, 0, 1)] });

    expect(await svg(container('FRAME', [mask, above]), { warn: (m) => warnings.push(m) })).toBe('');
    expect(warnings).toEqual(['The mask "off" is at zero opacity, so the layers it masks were not exported.']);
  });

  it('places hook output, keeps its transform inside, and hands styles to the hook', async () => {
    const instance = shape('INSTANCE', { relativeTransform: translate(1, 2), opacity: 0.5, children: [] });
    const bound = shape('RECTANGLE', { fillStyleId: 'S:1', fills: [solid(0, 0, 0)] });
    const warnings: string[] = [];

    const result = await svg(container('FRAME', [instance, bound]), {
      warn: (m) => warnings.push(m),
      hooks: {
        resolveNode: (node) =>
          node.type === 'INSTANCE'
            ? [
                {
                  name: 'g',
                  type: 'element',
                  value: '',
                  attributes: { transform: 'scale(2 2)' },
                  children: [textNode('{{components.eyes}}')],
                },
              ]
            : undefined,
        resolveStyle: (_node, channel, styleId) =>
          styleId === 'S:1' ? [{ value: `{{colors.${channel}Group}}` }] : undefined,
        wrapNode: (node, elements) =>
          node.type === 'RECTANGLE'
            ? [{ name: 'g', type: 'element', value: '', attributes: { 'data-x': '1' }, children: elements }]
            : elements,
      },
    });

    expect(result).toBe(
      '<g transform="translate(1 2) scale(2 2)" opacity="0.5">{{components.eyes}}</g>' +
        '<g data-x="1"><rect width="10" height="10" fill="{{colors.fillGroup}}"/></g>',
    );
    expect(warnings).toEqual([]);
  });

  it('skips transparent layers by default and warns about unknown types', async () => {
    const warnings: string[] = [];
    const root = container('FRAME', [shape('RECTANGLE', { opacity: 0, fills: [solid(0, 0, 0)] }), shape('SLICE', {})]);

    expect(await svg(root, { warn: (m) => warnings.push(m) })).toBe('');
    expect(warnings).toEqual(['The layer "slice" (SLICE) has no SVG equivalent and was not exported.']);
  });
});
