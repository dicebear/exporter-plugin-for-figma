import { styleTitleFromName } from '@shared/styleTitle';
import { THUMBNAIL_SEEDS } from '@shared/thumbnailSeeds';
import { loadFirstFont } from '../utils/loadFirstFont';
import { tick } from '@shared/tick';
import { componentTransform, multiply, Picks } from './componentTransform';
import { BRAND_ACCENT, BRAND_BACKGROUND, LOGO_SVG } from './logo';

export type ThumbnailOptions = {
  /**
   * What the DiceBear renderer picks per seed: the variant of every
   * component, the color of every palette, the transform of every component.
   * The window asks the renderer, the tile only applies the result.
   */
  picksBySeed: Record<string, Picks>;
  title: string;
  /** The finished avatar frame, the sample tiles are clones of it. */
  frame: FrameNode;
  paintStylesByGroup: Map<string, PaintStyle[]>;
  /** The imported main components, named `group/variant`. */
  componentsByGroup: Map<string, ComponentNode[]>;
  warnOnce: (message: string) => void;
  progress: (message: string) => Promise<void>;
};

// The layout mirrors the thumbnails of the existing DiceBear style files:
// a 1600x960 navy frame, the style title above a DiceBear badge on the left,
// and a staircase of sample avatars anchored bottom-right.
const WIDTH = 1600;
const HEIGHT = 960;
const BACKGROUND = BRAND_BACKGROUND;
const ACCENT = BRAND_ACCENT;
const LEFT_MARGIN = 92;
const COLUMN_WIDTH = 702;
const BADGE_TOP = 416;
const BADGE_HEIGHT = 80;
const BADGE_RADIUS = 10;
const LOGO_HEIGHT = 40;
const TITLE_FONT_SIZE = 128;
const TILE_SIZE = 128;
const TILE_PITCH = 148;
const PYRAMID_ROWS = 6;
const PYRAMID_X = 686;
const PYRAMID_Y = 46;

const TITLE_FONTS: FontName[] = [
  { family: 'Manrope', style: 'Bold' },
  { family: 'Inter', style: 'Bold' },
];

function pickHex(picks: Picks, group: string): string | null {
  const value = picks[`${group}Color`];
  const hex = Array.isArray(value) ? value[0] : value;

  return typeof hex === 'string' ? normalizeHex(hex) : null;
}

/**
 * A hex value the way the resolver spells it, without the hash. A style name
 * keeps the definition's short form, the resolver expands it. The alpha
 * channel stays, it tells two palette entries of one color apart.
 */
function normalizeHex(hex: string): string {
  const value = hex.toLowerCase().replace(/^#/, '');

  if (value.length === 3 || value.length === 4) {
    return value
      .split('')
      .map((digit) => digit + digit)
      .join('');
  }

  return value;
}

/**
 * The name the resolver keys its picks by. An instance the import renamed
 * carries an alias, everything else is named after its main component.
 */
function pickName(instance: InstanceNode, group: string): string {
  return instance.name.includes('/') ? group : instance.name;
}

/**
 * Walks the tile top-down and swaps every instance to the variant the
 * resolver picked, hides the components it left out, and applies the picked
 * transforms. Parents go first: swapping an instance replaces its nested
 * instances, so those are read only after the swap.
 *
 * Figma allows no transform override inside an instance. An instance whose
 * nested components need one is detached after its own swap, so the nested
 * instances sit in a plain frame and take their transform. The detached
 * level loses its variant dropdown, the parts inside keep theirs.
 */
async function applyVariantPicks(
  root: SceneNode & ChildrenMixin,
  picks: Picks,
  variantsByGroup: Map<string, Map<string, ComponentNode>>,
  warnOnce: (message: string) => void,
): Promise<void> {
  const queue: (SceneNode & ChildrenMixin)[] = [root];

  while (queue.length > 0) {
    const parent = queue.shift()!;

    for (const child of parent.children) {
      if (child.type !== 'INSTANCE') {
        if ('children' in child) {
          queue.push(child);
        }

        continue;
      }

      const pick = await resolveInstancePick(child, picks, variantsByGroup);

      if (!pick) {
        continue;
      }

      const { main, group, name, target } = pick;

      if (!target) {
        // No variant means the resolver left the component out.
        child.visible = false;

        continue;
      }

      if (target.id !== main.id) {
        child.swapComponent(target);

        if (name !== group) {
          child.name = name;
        }
      }

      const matrix = componentTransform(picks, name, child.width, child.height);

      if (matrix) {
        if (isInsideInstance(child, root)) {
          warnOnce(`component "${name}" is nested, its transform picks were not applied to the thumbnail.`);
        } else {
          child.relativeTransform = multiply(child.relativeTransform, matrix);
        }
      }

      if (await hasTransformedDescendant(child, picks, variantsByGroup)) {
        warnOnce(
          `component "${name}" was detached in the thumbnail, so the components inside it could take their transform picks.`,
        );
        queue.push(child.detachInstance());
      } else {
        queue.push(child);
      }
    }
  }
}

type InstancePick = {
  main: ComponentNode;
  group: string;
  name: string;
  /** The picked variant's main component, undefined when the resolver left the component out. */
  target: ComponentNode | undefined;
};

/** Reads which imported group an instance belongs to and what the resolver picked for it. */
async function resolveInstancePick(
  instance: InstanceNode,
  picks: Picks,
  variantsByGroup: Map<string, Map<string, ComponentNode>>,
): Promise<InstancePick | null> {
  const main = await instance.getMainComponentAsync();
  const group = main?.name.split('/')[0];
  const variants = group === undefined ? undefined : variantsByGroup.get(group);

  if (!main || group === undefined || !variants) {
    return null;
  }

  const name = pickName(instance, group);
  const variant = picks[`${name}Variant`];

  return { main, group, name, target: typeof variant === 'string' ? variants.get(variant) : undefined };
}

/** True when a visible instance anywhere inside needs a transform of its own. */
async function hasTransformedDescendant(
  instance: InstanceNode,
  picks: Picks,
  variantsByGroup: Map<string, Map<string, ComponentNode>>,
): Promise<boolean> {
  for (const nested of instance.findAll((node) => node.type === 'INSTANCE') as InstanceNode[]) {
    const pick = await resolveInstancePick(nested, picks, variantsByGroup);

    if (pick?.target && componentTransform(picks, pick.name, nested.width, nested.height) !== null) {
      return true;
    }
  }

  return false;
}

/**
 * Rebinds every layer that sits on a palette style to the style of the color
 * the resolver picked for that palette. Layers inside instances take the
 * binding as an override.
 */
async function applyColorPicks(
  root: SceneNode & ChildrenMixin,
  picks: Picks,
  paintStylesByGroup: Map<string, PaintStyle[]>,
): Promise<void> {
  const groupByStyleId = new Map<string, string>();
  const targetByGroup = new Map<string, string>();

  for (const [group, styles] of paintStylesByGroup) {
    const hex = pickHex(picks, group);

    for (const style of styles) {
      groupByStyleId.set(style.id, group);

      // The style name carries the hex the palette entry was created from.
      if (hex !== null && normalizeHex(style.name.split(' ').pop() ?? '') === hex) {
        targetByGroup.set(group, style.id);
      }
    }
  }

  if (targetByGroup.size === 0) {
    return;
  }

  for (const node of [root, ...root.findAll()]) {
    if ('fillStyleId' in node && typeof node.fillStyleId === 'string') {
      const target = targetByGroup.get(groupByStyleId.get(node.fillStyleId) ?? '');

      if (target && target !== node.fillStyleId) {
        await node.setFillStyleIdAsync(target);
      }
    }

    if ('strokeStyleId' in node && typeof node.strokeStyleId === 'string') {
      const target = targetByGroup.get(groupByStyleId.get(node.strokeStyleId) ?? '');

      if (target && target !== node.strokeStyleId) {
        await node.setStrokeStyleIdAsync(target);
      }
    }
  }
}

/**
 * Builds one sample avatar as a clone of the avatar frame with the resolver's
 * picks applied, so the tile stays editable like the frame itself: variants
 * swap through the instance dropdown, colors rebind to the palette styles.
 */
async function createSampleAvatar(
  tile: FrameNode,
  picks: Picks,
  seed: string,
  options: ThumbnailOptions,
  variantsByGroup: Map<string, Map<string, ComponentNode>>,
): Promise<void> {
  const clone = options.frame.clone();

  tile.appendChild(clone);
  clone.name = seed;
  clone.x = 0;
  clone.y = 0;

  // The settings live on the avatar frame alone. A copy that carried them
  // would look like a second style to the export.
  for (const key of clone.getPluginDataKeys()) {
    clone.setPluginData(key, '');
  }

  await applyVariantPicks(clone, picks, variantsByGroup, options.warnOnce);
  await applyColorPicks(clone, picks, options.paintStylesByGroup);

  scaleClone(clone, TILE_SIZE / options.frame.width);
  clone.x = 0;
  clone.y = 0;
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
 * Brings the clone to tile size. `rescale` is out: it writes the transform
 * of every descendant, and inside an instance that is not allowed. A resize
 * with scale constraints does the same job, the way the frame scales when a
 * user drags its corner. The masters carry those constraints already, the
 * layers outside the instances get them here. Constraints leave stroke
 * weights alone, so those are scaled by hand.
 */
function scaleClone(clone: FrameNode, factor: number): void {
  for (const node of clone.findAll((candidate) => !isInsideInstance(candidate, clone))) {
    if ('constraints' in node) {
      node.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    }
  }

  clone.resize(clone.width * factor, clone.height * factor);

  for (const node of [clone, ...clone.findAll()]) {
    if (
      'strokeWeight' in node &&
      typeof node.strokeWeight === 'number' &&
      node.strokeWeight > 0 &&
      node.strokes.length > 0
    ) {
      try {
        node.strokeWeight = node.strokeWeight * factor;
      } catch {
        // A stroke that cannot be overridden keeps its weight.
      }
    }
  }
}

async function createTitle(frame: FrameNode, title: string, warnOnce: (message: string) => void): Promise<void> {
  const font = await loadFirstFont(TITLE_FONTS);

  if (!font) {
    warnOnce('The thumbnail title was skipped because neither Manrope nor Inter is available.');

    return;
  }

  const text = figma.createText();

  frame.appendChild(text);
  text.fontName = font;
  text.fills = [figma.util.solidPaint('#ffffff')];
  text.fontSize = TITLE_FONT_SIZE;
  text.characters = title;

  if (text.width > COLUMN_WIDTH) {
    text.fontSize = Math.max(24, Math.floor((TITLE_FONT_SIZE * COLUMN_WIDTH) / text.width));
  }

  text.x = LEFT_MARGIN;
  text.y = BADGE_TOP - text.height;
}

function createBadge(frame: FrameNode, warnOnce: (message: string) => void): void {
  const badge = figma.createFrame();

  badge.name = 'DiceBear';
  frame.appendChild(badge);
  badge.resize(COLUMN_WIDTH, BADGE_HEIGHT);
  badge.x = LEFT_MARGIN;
  badge.y = BADGE_TOP;
  badge.cornerRadius = BADGE_RADIUS;
  badge.fills = [figma.util.solidPaint(ACCENT)];

  try {
    const logo = figma.createNodeFromSvg(LOGO_SVG);

    logo.name = 'Logo';
    badge.appendChild(logo);
    logo.rescale(LOGO_HEIGHT / logo.height);
    logo.x = 24;
    logo.y = (BADGE_HEIGHT - logo.height) / 2;
  } catch {
    warnOnce('The DiceBear logo could not be added to the thumbnail.');
  }
}

function indexVariants(componentsByGroup: Map<string, ComponentNode[]>): Map<string, Map<string, ComponentNode>> {
  const variantsByGroup = new Map<string, Map<string, ComponentNode>>();

  for (const [group, components] of componentsByGroup) {
    const variants = new Map<string, ComponentNode>();

    for (const component of components) {
      variants.set(component.name.slice(group.length + 1), component);
    }

    variantsByGroup.set(group, variants);
  }

  return variantsByGroup;
}

/**
 * Fills the given page with a cover in the style of the existing DiceBear
 * Figma files and registers it as the file thumbnail.
 */
export async function createThumbnail(page: PageNode, options: ThumbnailOptions): Promise<void> {
  const title = styleTitleFromName(options.title);

  const frame = figma.createFrame();

  frame.name = 'Thumbnail';
  page.appendChild(frame);
  frame.resize(WIDTH, HEIGHT);
  frame.x = 0;
  frame.y = 0;
  frame.fills = [figma.util.solidPaint(BACKGROUND)];

  await createTitle(frame, title, options.warnOnce);
  createBadge(frame, options.warnOnce);

  if (Object.keys(options.picksBySeed).length === 0) {
    options.warnOnce('The sample avatars were skipped, the renderer rejected the definition.');
  } else {
    const variantsByGroup = indexVariants(options.componentsByGroup);
    const totalTiles = (PYRAMID_ROWS * (PYRAMID_ROWS + 1)) / 2;
    const pyramid = figma.createFrame();
    const pyramidSize = (PYRAMID_ROWS - 1) * TILE_PITCH + TILE_SIZE;

    pyramid.name = 'Avatars';
    frame.appendChild(pyramid);
    pyramid.resize(pyramidSize, pyramidSize);
    pyramid.x = PYRAMID_X;
    pyramid.y = PYRAMID_Y;
    pyramid.fills = [];
    pyramid.clipsContent = false;

    let tileIndex = 0;
    let failed = 0;
    let firstError = '';

    for (let row = 0; row < PYRAMID_ROWS; row++) {
      for (let column = 0; column <= row; column++) {
        tileIndex++;
        await options.progress(`Building the thumbnail (${tileIndex} of ${totalTiles})`);

        const tile = figma.createFrame();

        tile.name = `avatar-${tileIndex}`;
        pyramid.appendChild(tile);
        tile.resize(TILE_SIZE, TILE_SIZE);
        tile.x = (PYRAMID_ROWS - 1 - row + column) * TILE_PITCH;
        tile.y = row * TILE_PITCH;
        tile.cornerRadius = TILE_SIZE / 2;
        tile.clipsContent = true;
        // The avatar brings its own background when the style has a
        // background palette, the brand navy only fills the gap for styles
        // without one.
        tile.fills = [figma.util.solidPaint(ACCENT)];

        const seed = THUMBNAIL_SEEDS[(tileIndex - 1) % THUMBNAIL_SEEDS.length];
        const picks = options.picksBySeed[seed];

        try {
          if (!picks) {
            throw new Error(`no picks for seed "${seed}"`);
          }

          await createSampleAvatar(tile, picks, seed, options, variantsByGroup);
        } catch (e: any) {
          failed++;
          firstError ||= String(e?.message ?? e);
        }

        await tick();
      }
    }

    if (failed > 0) {
      options.warnOnce(
        `${failed} of ${totalTiles} sample avatars could not be built for the thumbnail (${firstError}).`,
      );
    }
  }

  try {
    await figma.setFileThumbnailNodeAsync(frame);
  } catch {
    options.warnOnce('The thumbnail frame could not be registered as the file cover.');
  }
}
