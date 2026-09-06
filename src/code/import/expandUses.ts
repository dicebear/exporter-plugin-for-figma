import type { DefinitionElement } from '../types';

type Attributes = NonNullable<DefinitionElement['attributes']>;

/** The id a `use` points at, without the hash. */
function hrefOf(attributes: Attributes): string | null {
  const raw = attributes.href ?? attributes['xlink:href'];

  if (typeof raw !== 'string' || !raw.startsWith('#')) {
    return null;
  }

  return raw.slice(1);
}

function clone(element: DefinitionElement): DefinitionElement {
  return JSON.parse(JSON.stringify(element)) as DefinitionElement;
}

/** The elements with an id, anywhere in the tree. */
function collectTargets(elements: DefinitionElement[], targets: Map<string, DefinitionElement>): void {
  for (const element of elements) {
    const id = element.attributes?.id;

    if (typeof id === 'string' && id !== '') {
      targets.set(id, element);
    }

    collectTargets(element.children ?? [], targets);
  }
}

/** The transform a `use` applies: its own, then its `x` and `y`. */
function useTransform(attributes: Attributes): string | undefined {
  const parts: string[] = [];
  const transform = attributes.transform;

  if (typeof transform === 'string' && transform.trim() !== '') {
    parts.push(transform.trim());
  }

  const x = typeof attributes.x === 'string' ? attributes.x : '0';
  const y = typeof attributes.y === 'string' ? attributes.y : '0';

  if (x !== '0' || y !== '0') {
    parts.push(`translate(${x} ${y})`);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

const USE_ONLY = new Set(['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform']);

/**
 * Replaces a `use` of an element in the same tree by a copy of that element.
 * Figma's SVG import loses a `use` that carries a transform and a clip, and
 * a copy draws the same: the `use` attributes inherit into the copy, the
 * element's own attributes win, and the transforms compose. A shape takes
 * the attributes itself, so a `use` inside a `clipPath` stays valid clip
 * content. A group gets a wrapper. The copy loses the id, the original keeps
 * it for the `url(#…)` references that may still point at it.
 */
function expand(element: DefinitionElement, targets: Map<string, DefinitionElement>, depth: number): DefinitionElement {
  const attributes = element.attributes ?? {};
  const id = element.name === 'use' ? hrefOf(attributes) : null;
  const target = id !== null ? targets.get(id) : undefined;

  if (target === undefined || depth > 8) {
    return {
      ...element,
      ...(element.children ? { children: element.children.map((child) => expand(child, targets, depth)) } : {}),
    };
  }

  const copy = expand(clone(target), targets, depth + 1);
  const copyAttributes = { ...(copy.attributes ?? {}) };

  delete copyAttributes.id;

  const inherited: Attributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (!USE_ONLY.has(key)) {
      inherited[key] = value;
    }
  }

  const transform = useTransform(attributes);

  if (copy.name === 'g') {
    const wrapper: Attributes = { ...inherited };

    if (transform !== undefined) {
      wrapper.transform = transform;
    }

    return {
      type: 'element',
      name: 'g',
      attributes: wrapper,
      children: [{ ...copy, attributes: copyAttributes }],
      ...(element.animations ? { animations: element.animations } : {}),
    };
  }

  const merged: Attributes = { ...inherited, ...copyAttributes };
  const own = copyAttributes.transform;

  if (transform !== undefined) {
    merged.transform = typeof own === 'string' && own.trim() !== '' ? `${transform} ${own.trim()}` : transform;
  }

  return {
    ...copy,
    attributes: merged,
    ...(element.animations ? { animations: element.animations } : {}),
  };
}

/**
 * The elements with every `use` of an element in the same tree replaced by a
 * copy of that element. A `use` of a component, or of an id the tree does
 * not define, stays as it is.
 */
export function expandUses(elements: DefinitionElement[]): DefinitionElement[] {
  const targets = new Map<string, DefinitionElement>();

  collectTargets(elements, targets);

  if (targets.size === 0) {
    return elements;
  }

  return elements.map((element) => expand(element, targets, 0));
}
