import { describe, expect, it } from 'vitest';
import { stringify } from 'svgson';

import { serializeTree } from '../figma-svg/serialize';
import { createDicebearHooks } from './hooks';

const MIXED = Symbol('mixed');

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
] as const;

/** A layer with the properties the serializer reads. */
function layer(type: string, props: Record<string, unknown>) {
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

/** A local component on a page, the kind an instance may reference. */
function component(name: string) {
  const child = layer('RECTANGLE', { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] });

  return {
    ...layer('COMPONENT', { name, children: [child] }),
    id: name,
    parent: { type: 'PAGE' },
    remote: false,
    findAll: () => [child],
  } as unknown as ComponentNode;
}

function instanceOf(main: ComponentNode, props: Record<string, unknown> = {}) {
  return layer('INSTANCE', {
    name: main.name,
    children: [],
    getMainComponentAsync: async () => main,
    ...props,
  });
}

type SvgOptions = {
  styles?: Record<string, unknown>;
  warn?: (message: string) => void;
};

async function svg(children: SceneNode[], options: SvgOptions = {}): Promise<string> {
  const root = layer('FRAME', { children, fillGeometry: [], clipsContent: false }) as SceneNode & ChildrenMixin;
  const hooks = createDicebearHooks({
    styles: async (id) => (options.styles?.[id] ?? null) as BaseStyle | null,
  });
  const tree = await serializeTree(root, { host: { mixed: MIXED }, hooks, clipFrames: false, warn: options.warn });

  return stringify(tree).replace(/^<svg[^>]*>|<\/svg>$/g, '');
}

/** A palette style bound to one solid paint. */
function paintStyle(name: string, opacity = 1) {
  return { type: 'PAINT', name, remote: false, paints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity }] };
}

/** An opacity track from `from` to `to` over one second. */
function opacityTrack(from: number, to: number) {
  return {
    OPACITY: {
      keyframes: [
        { timelinePosition: 0, value: { type: 'FLOAT', value: from } },
        { timelinePosition: 1, value: { type: 'FLOAT', value: to } },
      ],
    },
  };
}

describe('createDicebearHooks', () => {
  it('writes an instance as its component placeholder', async () => {
    const mouth = component('mouth/variant01');

    expect(await svg([instanceOf(mouth)])).toBe('<g>{{components.mouth}}</g>');
  });

  it('keeps the placeholder of an instance that masks its siblings', async () => {
    const mouth = component('mouth/variant01');
    const above = layer('RECTANGLE', { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] });

    expect(await svg([instanceOf(mouth, { isMask: true }), above])).toBe(
      '<g mask="url(#mask0)"><rect width="10" height="10" fill="#ff0000"/></g>' +
        '<defs><mask id="mask0" style="mask-type:alpha"><g>{{components.mouth}}</g></mask></defs>',
    );
  });

  it('flags a translucent palette style so its stroke stays off the fill', async () => {
    const rect = layer('RECTANGLE', {
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }],
      strokes: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
      strokeStyleId: 'S:line',
      strokeAlign: 'INSIDE',
      strokeWeight: 2,
      strokeGeometry: [{ windingRule: 'EVENODD', data: 'M0 0' }],
    });
    const styles = { 'S:line': paintStyle('line/01 ff000080', 0.5) };

    expect(await svg([rect], { styles })).toBe(
      '<rect width="10" height="10" fill="#0000ff"/>' +
        '<rect x="1" y="1" width="8" height="8" fill="none" stroke="{{colors.line}}" stroke-width="2"/>',
    );

    const opaque = { 'S:line': paintStyle('line/01 ff0000') };

    expect(await svg([rect], { styles: opaque })).toBe(
      '<rect width="8" height="8" fill="#0000ff" x="1" y="1" stroke="{{colors.line}}" stroke-width="2"/>',
    );
  });

  it('moves the layer opacity onto the carrier as the resting state instead of multiplying', async () => {
    const rect = layer('RECTANGLE', {
      name: 'blink',
      opacity: 0.5,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      manualKeyframeTracks: opacityTrack(0.5, 1),
    });
    const out = await svg([rect]);

    expect(out.match(/opacity="/g)).toHaveLength(1);
    expect(out).toContain('<g data-dbanim="0:');
    expect(out).toContain('" opacity="0.5"><rect width="10" height="10" fill="#000000"/></g>');
  });

  it('keeps a layer that fades in from nothing visible in the static avatar', async () => {
    const rect = layer('RECTANGLE', {
      name: 'comet',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      manualKeyframeTracks: opacityTrack(0, 1),
    });
    const out = await svg([rect]);

    expect(out).toContain('<g data-dbanim="0:');
    expect(out).not.toContain('opacity=');
  });

  it('hides a layer that rests at zero and only shows while animating', async () => {
    const rect = layer('RECTANGLE', {
      name: 'flash',
      opacity: 0,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      manualKeyframeTracks: opacityTrack(1, 0),
    });
    const out = await svg([rect]);

    expect(out.match(/opacity="/g)).toHaveLength(1);
    expect(out).toContain('" opacity="0"><rect width="10" height="10" fill="#000000"/></g>');
  });

  it('leaves the layer opacity in place when the animation does not drive it', async () => {
    const rect = layer('RECTANGLE', {
      name: 'hop',
      opacity: 0.5,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      manualKeyframeTracks: {
        TRANSLATION_Y: {
          keyframes: [
            { timelinePosition: 0, value: { type: 'FLOAT', value: 0 } },
            { timelinePosition: 1, value: { type: 'FLOAT', value: 4 } },
          ],
        },
      },
    });
    const out = await svg([rect]);

    expect(out).toContain('<g data-dbanim="0:');
    expect(out).toContain('<rect width="10" height="10" fill="#000000" opacity="0.5"/></g>');
  });

  it('exports an animated mask static and says so', async () => {
    const warnings: string[] = [];
    const mask = layer('ELLIPSE', {
      name: 'lid',
      isMask: true,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      manualKeyframeTracks: opacityTrack(1, 0),
    });
    const above = layer('RECTANGLE', { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] });
    const out = await svg([mask, above], { warn: (m) => warnings.push(m) });

    expect(out).not.toContain('data-dbanim');
    expect(warnings).toEqual([
      'The mask "lid" has an animation, but a mask cannot animate in a definition. It was exported static.',
    ]);
  });
});
