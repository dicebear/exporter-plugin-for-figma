import type { INode } from 'svgson';

/**
 * What the serializer needs from the plugin environment. Passing it in keeps
 * the walk free of the `figma` global, so it runs against plain objects in
 * tests and outside a plugin sandbox.
 */
export type SerializerHost = {
  /** The sentinel Figma returns for properties that differ within a node. */
  mixed: unknown;
  /**
   * Gives the event loop a turn. Defaults to a zero timeout. The walk reads
   * layers synchronously, so without a break a large frame would hold the
   * thread, and with it the plugin window, until the export is through.
   */
  yield?(): Promise<void>;
};

/** The paint of one channel: the attribute value and the alpha it adds. */
export type ChannelPaint = {
  /** The `fill` or `stroke` value: a color, a `url(#id)`, or a placeholder. */
  value: string;
  /** The `*-opacity` the paint adds, when it is not 1. */
  opacity?: number;
  /** Set when the value carries alpha or references a def, so the paint may not cover what lies under it. */
  translucent?: boolean;
  /** The `style` for the paint's own blend mode, when it does not paint normally. */
  style?: string;
};

export type PaintChannel = 'fill' | 'stroke';

/** What the serializer shares with the hooks while it walks a tree. */
export type SerializeContext = {
  host: SerializerHost;
  warn: (message: string) => void;
  /** Definitions the output references. Hooks append gradients or masks here. */
  defs: INode[];
  /** A fresh id for a definition of the given kind, unique within the export. */
  nextId(kind: string): string;
  /** Resolves plain Figma paints for a shape of the given size. */
  resolvePaints(paints: ReadonlyArray<Paint>, size: { width: number; height: number }): ChannelPaint[];
};

export type SerializeHooks = {
  /**
   * Replaces a layer's elements. The elements are in the layer's own
   * coordinates: the serializer places them with the layer's transform,
   * opacity, blend mode and effects afterwards. Return undefined to let the
   * serializer handle the layer.
   */
  resolveNode?(
    node: SceneNode,
    asMask: boolean,
    ctx: SerializeContext,
  ): Promise<INode[] | undefined> | INode[] | undefined;
  /**
   * The paint of a channel bound to a style. Return undefined to fall back to
   * the layer's plain paints.
   */
  resolveStyle?(
    node: SceneNode,
    channel: PaintChannel,
    styleId: string,
    ctx: SerializeContext,
  ): Promise<ChannelPaint[] | undefined> | ChannelPaint[] | undefined;
  /**
   * Whether a layer at zero opacity is serialized anyway. Figma's export
   * leaves such a layer out, and so does this one unless the hook says
   * otherwise, for a layer whose opacity is only a resting state.
   */
  keepAtZeroOpacity?(node: SceneNode): boolean;
  /**
   * The last word on a layer's elements, called with the placed and filtered
   * output. This is where a wrapper for metadata goes.
   */
  wrapNode?(node: SceneNode, elements: INode[], asMask: boolean, ctx: SerializeContext): Promise<INode[]> | INode[];
};

export type SerializeOptions = {
  host: SerializerHost;
  hooks?: SerializeHooks;
  warn?: (message: string) => void;
  /**
   * Whether frames with `clipsContent` clip their children. Figma's own export
   * does, an export whose consumer moves the content later may not want it.
   * Defaults to true.
   */
  clipFrames?: boolean;
};
