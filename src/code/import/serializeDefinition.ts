import { DefinitionAnimation } from '../animation/types';
import { DefinitionComponentBase, DefinitionComponents, DefinitionElement, DefinitionFile } from '../types';

export type PreparedRefColor = {
  /** Set when the reference's `color` attribute points to a palette. */
  group?: string;
  /** Set when the reference's `color` attribute is a literal color. */
  value?: string;
};

export type PreparedRef = {
  /** Placeholder id, becomes the layer name when Figma imports the SVG. */
  id: string;
  /** The component name as written in the definition, may be an alias. */
  refName: string;
  /** The `color` the reference passes down for `currentColor` layers. */
  color?: PreparedRefColor;
  /** Declarative animations carried on the reference, applied to the instance. */
  animations?: DefinitionAnimation[];
};

export type PreparedAnim = {
  /** Marker id, becomes the layer name when Figma imports the SVG. */
  id: string;
  animations: DefinitionAnimation[];
};

export type SerializedSvg = {
  /** Null when nothing importable remains after skipping unsupported content. */
  svg: string | null;
  refs: PreparedRef[];
  anims: PreparedAnim[];
};

export type DefinitionSerializer = {
  sentinelByColorGroup: Map<string, string>;
  usedColorGroups: Set<string>;
  /** Marks `currentColor` layers whose color is set per reference. */
  currentColorSentinel: string;
  serialize(elements: DefinitionElement[], width: number, height: number, scope: string): SerializedSvg;
};

/**
 * The color an element inherits for `currentColor`. `group` is set when the
 * value came from a palette reference, so consumption can be tracked.
 */
type ColorContext = {
  value?: string;
  group?: string;
};

type ReferenceObject = { type: string; name: string };

function isReferenceObject(value: unknown): value is ReferenceObject {
  return typeof value === 'object' && value !== null && typeof (value as ReferenceObject).type === 'string';
}

function isColorReference(value: unknown): value is ReferenceObject {
  return isReferenceObject(value) && value.type === 'color';
}

/** Elements that draw something on their own. */
const DRAWABLE_ELEMENTS = new Set([
  'circle',
  'ellipse',
  'image',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'text',
  'use',
]);

/** Containers whose content is not rendered directly. */
const HIDDEN_CONTAINERS = new Set(['clipPath', 'defs', 'mask', 'pattern', 'symbol']);

function isZeroOpacity(value: unknown): boolean {
  return (typeof value === 'string' || typeof value === 'number') && parseFloat(String(value)) === 0;
}

/**
 * Whether an element's own `opacity` is the resting state of an animation.
 *
 * The track carries that value in Figma, the attribute stays behind: a layer
 * resting at zero opacity does not survive Figma's SVG export, so it would
 * come back from the round trip as a missing element. The export writes the
 * attribute again from the start of the track.
 */
function opacityBelongsToAnimation(element: DefinitionElement): boolean {
  return (
    Array.isArray(element.animations) &&
    element.animations.some((animation) => animation?.tracks?.opacity !== undefined)
  );
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function expandHex(hex: string): string | null {
  const value = hex.replace('#', '').toLowerCase();

  if (value.length === 3 || value.length === 4) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
  }

  if (value.length === 6 || value.length === 8) {
    return `#${value.slice(0, 6)}`;
  }

  return null;
}

/**
 * Every hex color that appears anywhere in the definition. Sentinel colors are
 * matched by exact value after the import, so they must not collide with a
 * color the definition really uses.
 */
function collectReservedHexes(definition: DefinitionFile): Set<string> {
  const reserved = new Set<string>();

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.match(/#[0-9a-f]{3,8}/gi) ?? []) {
        const hex = expandHex(match);

        if (hex) {
          reserved.add(hex);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  visit(definition);

  return reserved;
}

/**
 * Reads a key that comes from the definition file. A plain property access
 * would walk the prototype chain, and the schema allows names such as
 * `toString` or `constructor`.
 */
function own<T>(collection: Record<string, T> | undefined, key: string): T | undefined {
  return collection && Object.prototype.hasOwnProperty.call(collection, key) ? collection[key] : undefined;
}

/**
 * Resolves a component reference to the name of a non-alias component, or null
 * when the reference cannot be resolved.
 */
export function resolveMasterName(components: DefinitionComponents | undefined, name: string): string | null {
  const entry = own(components, name);

  if (!entry) {
    return null;
  }

  if ('extends' in entry) {
    const master = own(components, entry.extends);

    return master && !('extends' in master) ? entry.extends : null;
  }

  return name;
}

export function createDefinitionSerializer(
  definition: DefinitionFile,
  warn: (message: string) => void,
): DefinitionSerializer {
  const reserved = collectReservedHexes(definition);
  let nextSentinel = 1;

  const allocateSentinel = (): string => {
    for (;;) {
      const hex = `#${(nextSentinel++).toString(16).padStart(6, '0')}`;

      if (!reserved.has(hex)) {
        reserved.add(hex);

        return hex;
      }
    }
  };

  const placeholderFill = allocateSentinel();
  const currentColorSentinel = allocateSentinel();
  const sentinelByColorGroup = new Map<string, string>();

  for (const groupName of Object.keys(definition.colors ?? {})) {
    sentinelByColorGroup.set(groupName, allocateSentinel());
  }

  const usedColorGroups = new Set<string>();
  const warnedMessages = new Set<string>();
  let refCounter = 0;
  let animCounter = 0;
  let anims: PreparedAnim[] = [];
  let sawVisible = false;

  const warnOnce = (message: string): void => {
    if (!warnedMessages.has(message)) {
      warnedMessages.add(message);
      warn(message);
    }
  };

  const firstPaletteValue = (groupName: string): string => {
    return definition.colors?.[groupName]?.values?.[0] ?? '#000000';
  };

  const resolveColorContext = (
    attributes: Record<string, string | ReferenceObject>,
    inherited: ColorContext,
  ): ColorContext => {
    const raw = attributes.color;

    if (raw === undefined) {
      return inherited;
    }

    if (isColorReference(raw)) {
      const sentinel = sentinelByColorGroup.get(raw.name);

      return sentinel ? { value: sentinel, group: raw.name } : inherited;
    }

    if (isReferenceObject(raw)) {
      return inherited;
    }

    return { value: String(raw) };
  };

  const resolveAttributeValue = (
    key: string,
    raw: string | ReferenceObject,
    context: ColorContext,
    scope: string,
  ): string | null => {
    if (key === 'class') {
      warnOnce('Some elements use the "class" attribute, it has no Figma equivalent and was dropped.');

      return null;
    }

    if (isReferenceObject(raw)) {
      if (raw.type !== 'color') {
        warnOnce(
          `${scope}: the "${raw.type}" reference "${raw.name}" on "${key}" cannot be imported, the attribute was dropped.`,
        );

        return null;
      }

      const sentinel = sentinelByColorGroup.get(raw.name);

      if (!sentinel) {
        warnOnce(`${scope}: unknown palette "${raw.name}", black was used instead.`);

        return key === 'color' ? null : '#000000';
      }

      if (key === 'fill' || key === 'stroke') {
        usedColorGroups.add(raw.name);

        return sentinel;
      }

      if (key === 'color') {
        // Consumed through the color context, see resolveColorContext.
        return null;
      }

      warnOnce(
        `${scope}: the palette reference on "${key}" cannot be linked to a Figma color style, ` +
          `the first value of "${raw.name}" was used instead.`,
      );

      return firstPaletteValue(raw.name);
    }

    const value = String(raw);

    if (value === 'currentColor' && (key === 'fill' || key === 'stroke' || key === 'stop-color')) {
      if (context.value === undefined) {
        if (key === 'stop-color') {
          warnOnce(`${scope}: currentColor in a gradient stop cannot be resolved, black was used instead.`);

          return '#000000';
        }

        // The color comes from the element that references this component.
        // The importer resolves the sentinel per instance.
        return currentColorSentinel;
      }

      if (context.group !== undefined) {
        if (key === 'stop-color') {
          warnOnce(
            `${scope}: the palette reference on "stop-color" cannot be linked to a Figma color style, ` +
              `the first value of "${context.group}" was used instead.`,
          );

          return firstPaletteValue(context.group);
        }

        usedColorGroups.add(context.group);
      }

      return context.value;
    }

    return value;
  };

  const serializeComponentReference = (
    element: DefinitionElement,
    inherited: ColorContext,
    scope: string,
    refs: PreparedRef[],
    hidden: boolean,
  ): string => {
    const refName = element.name ?? '';
    const masterName = resolveMasterName(definition.components, refName);

    if (masterName === null) {
      warn(`${scope}: unknown component "${refName}", the reference was skipped.`);

      return '';
    }

    const master = own(definition.components, masterName) as DefinitionComponentBase;
    const attributes = element.attributes ?? {};
    const transformParts: string[] = [];
    const transform = attributes.transform;

    if (typeof transform === 'string' && transform.trim()) {
      transformParts.push(transform.trim());
    }

    const x = isReferenceObject(attributes.x) ? undefined : attributes.x;
    const y = isReferenceObject(attributes.y) ? undefined : attributes.y;

    if (isReferenceObject(attributes.x) || isReferenceObject(attributes.y)) {
      warnOnce(`${scope}: the reference on the position of "${refName}" is resolved at render time and was dropped.`);
    }

    if (x !== undefined || y !== undefined) {
      transformParts.push(`translate(${String(x ?? 0)} ${String(y ?? 0)})`);
    }

    let color: PreparedRefColor | undefined;
    const colorRaw = attributes.color;

    if (colorRaw !== undefined) {
      if (isColorReference(colorRaw)) {
        if (own(definition.colors, colorRaw.name)) {
          color = { group: colorRaw.name };
          usedColorGroups.add(colorRaw.name);
        } else {
          warnOnce(
            `${scope}: unknown palette "${colorRaw.name}" on the reference to "${refName}", the color was dropped.`,
          );
        }
      } else if (!isReferenceObject(colorRaw)) {
        color = { value: String(colorRaw) };
      }
    } else if (inherited.group !== undefined) {
      // A `color` on an ancestor reaches the referenced component's
      // `currentColor` layers at render time, so the reference has to carry it.
      color = { group: inherited.group };
      usedColorGroups.add(inherited.group);
    } else if (inherited.value !== undefined) {
      color = { value: inherited.value };
    }

    let opacityAttribute = '';

    if (
      attributes.opacity !== undefined &&
      !isReferenceObject(attributes.opacity) &&
      !opacityBelongsToAnimation(element)
    ) {
      opacityAttribute = ` opacity="${escapeXml(String(attributes.opacity))}"`;
    }

    for (const key of Object.keys(attributes)) {
      if (key !== 'transform' && key !== 'x' && key !== 'y' && key !== 'color' && key !== 'opacity') {
        warnOnce(`${scope}: attribute "${key}" on the reference to "${refName}" was dropped.`);
      }
    }

    const id = `dbimp-ref-${refCounter++}`;

    if (!hidden && (!isZeroOpacity(attributes.opacity) || opacityBelongsToAnimation(element))) {
      sawVisible = true;
    }

    // The placeholder rect does not survive the import, so animations on the
    // reference ride along on the ref and land on the created instance.
    const animations =
      Array.isArray(element.animations) && element.animations.length > 0 ? element.animations : undefined;

    refs.push({ id, refName, color, animations });

    const transformAttribute = transformParts.length > 0 ? ` transform="${escapeXml(transformParts.join(' '))}"` : '';

    // The rect stands in for the referenced component. Figma turns its SVG
    // transform into node position, size, rotation, and opacity, which are
    // copied to the instance that replaces it.
    return `<rect id="${id}"${transformAttribute}${opacityAttribute} width="${master.width}" height="${master.height}" fill="${placeholderFill}"/>`;
  };

  const serializeElements = (
    elements: DefinitionElement[],
    inherited: ColorContext,
    scope: string,
    refs: PreparedRef[],
    hidden: boolean,
  ): string => {
    let out = '';

    for (const element of elements) {
      out += serializeElement(element, inherited, scope, refs, hidden);
    }

    return out;
  };

  const serializeElement = (
    element: DefinitionElement,
    inherited: ColorContext,
    scope: string,
    refs: PreparedRef[],
    hidden: boolean,
  ): string => {
    if (element.type === 'text') {
      if (isReferenceObject(element.value)) {
        warnOnce(
          `${scope}: the "${element.value.type}" reference "${element.value.name}" is resolved at render time and cannot be imported.`,
        );

        return '';
      }

      return escapeXml(String(element.value ?? ''));
    }

    if (element.type === 'component') {
      return serializeComponentReference(element, inherited, scope, refs, hidden);
    }

    if (element.name === 'style') {
      warnOnce(
        '<style> elements were skipped, raw CSS cannot be imported into Figma. Declarative animations round-trip instead.',
      );

      return '';
    }

    if (element.name === 'filter') {
      warnOnce(`${scope}: contains a <filter> element, Figma's SVG import may not reproduce its effect.`);
    }

    const attributes = element.attributes ?? {};
    const context = resolveColorContext(attributes, inherited);
    let attributeString = '';

    const animatedOpacity = opacityBelongsToAnimation(element);

    for (const [key, raw] of Object.entries(attributes)) {
      if (key === 'opacity' && animatedOpacity) {
        continue;
      }

      const value = resolveAttributeValue(key, raw, context, scope);

      if (value !== null) {
        attributeString += ` ${key}="${escapeXml(value)}"`;
      }
    }

    const name = element.name ?? 'g';
    const childHidden =
      hidden || HIDDEN_CONTAINERS.has(name) || (!animatedOpacity && isZeroOpacity(attributes.opacity));

    if (!childHidden && DRAWABLE_ELEMENTS.has(name)) {
      sawVisible = true;
    }

    const childContent = serializeElements(element.children ?? [], context, scope, refs, childHidden);

    // An animated element gets a marker id so the importer can find its node
    // and write the keyframe tracks. When the element carries an id of its
    // own (it may be the target of a `url(#…)` reference), a wrapper group
    // takes the marker instead. Animating the wrapper is render-equivalent.
    let markerId: string | null = null;

    if (!hidden && Array.isArray(element.animations) && element.animations.length > 0) {
      markerId = `dbimp-anim-${animCounter++}`;

      anims.push({ id: markerId, animations: element.animations });
    }

    const markerWrap = markerId !== null && attributes.id !== undefined;
    const ownMarker = markerId !== null && !markerWrap ? ` id="${markerId}"` : '';

    const markup =
      childContent === ''
        ? `<${name}${ownMarker}${attributeString}/>`
        : `<${name}${ownMarker}${attributeString}>${childContent}</${name}>`;

    return markerWrap ? `<g id="${markerId}">${markup}</g>` : markup;
  };

  const serialize = (elements: DefinitionElement[], width: number, height: number, scope: string): SerializedSvg => {
    const refs: PreparedRef[] = [];
    const rootRaw = (definition.attributes ?? {}) as Record<string, string | ReferenceObject>;
    // The root attributes carry a `color` down to every element below, the same
    // way an element's own `color` does.
    const rootContext = resolveColorContext(rootRaw, {});

    sawVisible = false;
    anims = [];

    const content = serializeElements(elements, rootContext, scope, refs, false);

    // Content without a single visible element, such as the marker groups and
    // permanently transparent overlays of the CSS animation components, would
    // only import empty layers.
    if (content.trim() === '' || !sawVisible) {
      return { svg: null, refs: [], anims: [] };
    }

    let rootAttributes = '';

    for (const [key, raw] of Object.entries(rootRaw)) {
      if (key === 'width' || key === 'height' || key === 'viewBox' || key === 'xmlns') {
        continue;
      }

      const value = resolveAttributeValue(key, raw, rootContext, scope);

      if (value !== null) {
        rootAttributes += ` ${key}="${escapeXml(value)}"`;
      }
    }

    return {
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
        `viewBox="0 0 ${width} ${height}"${rootAttributes}>${content}</svg>`,
      refs,
      anims,
    };
  };

  return {
    sentinelByColorGroup,
    usedColorGroups,
    currentColorSentinel,
    serialize,
  };
}
