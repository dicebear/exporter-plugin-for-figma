import { Avatar, Style } from '@dicebear/core';
import { PREVIEW_SEED } from '@/lib/api';
import { optionsFingerprint, type Overrides } from './avatarOptions';
import { boundedSet } from './renderAvatar';
import type { StyleEntry } from './styleRegistry';

/**
 * Renders one component on its own, the way the documentation's playground
 * shows variants: a synthetic style whose canvas holds nothing but that
 * component, without the offsets it carries on the real avatar. Everything
 * is kept per style entry, so it goes when the entry does.
 */
type Previews = {
  styles: Map<string, Style | null>;
  renders: Map<string, string>;
};

const RENDER_LIMIT = 300;
const previews = new WeakMap<StyleEntry, Previews>();

function previewsOf(entry: StyleEntry): Previews {
  let known = previews.get(entry);

  if (!known) {
    known = { styles: new Map(), renders: new Map() };
    previews.set(entry, known);
  }

  return known;
}

function syntheticStyle(entry: StyleEntry, componentName: string): Style | null {
  const { styles } = previewsOf(entry);

  if (styles.has(componentName)) {
    return styles.get(componentName)!;
  }

  const component = entry.style.components().get(componentName);
  let style: Style | null = null;

  if (component) {
    const definition = entry.style.definition();
    const components = { ...definition.components };
    const sourceName = component.sourceName();
    const source = components[sourceName];

    if (source && !('extends' in source)) {
      components[sourceName] = {
        width: source.width,
        height: source.height,
        probability: source.probability,
        variants: source.variants,
      };
    }

    style = new Style({
      canvas: {
        width: component.width(),
        height: component.height(),
        elements: [{ type: 'component', name: componentName }],
      },
      attributes: definition.attributes,
      components,
      colors: definition.colors,
    });
  }

  styles.set(componentName, style);

  return style;
}

/**
 * The data URI of one variant, in the palette choices of the current avatar.
 * `colors` holds only the color options, see `colorOverrides`.
 */
export function renderComponentVariant(
  entry: StyleEntry,
  componentName: string,
  variant: string,
  colors: Overrides,
  seed = PREVIEW_SEED,
): string {
  const { renders } = previewsOf(entry);
  const key = `${componentName}|${variant}|${seed}|${optionsFingerprint(colors)}`;
  const known = renders.get(key);

  if (known !== undefined) {
    return known;
  }

  const style = syntheticStyle(entry, componentName);

  if (!style) {
    return '';
  }

  const options: Record<string, unknown> = {
    seed,
    size: 64,
    animation: false,
    ...colors,
    backgroundColor: [],
    [`${componentName}Probability`]: 100,
    [`${componentName}Variant`]: variant,
  };

  return boundedSet(renders, key, new Avatar(style, options as never).toDataUri(), RENDER_LIMIT);
}
