import { sentenceCase } from 'change-case';
import type { Descriptor, FieldDescriptor } from './descriptor';
import type { StyleEntry } from './styleRegistry';

export type OptionGroupId = 'components' | 'colors' | 'advanced';

export type OptionFieldSpec = {
  name: string;
  label: string;
  descriptor: FieldDescriptor;
  kind: 'variant' | 'probability' | 'color' | 'plain';
  /** For component fields, the component the option belongs to. */
  component?: string;
  /** For color fields, the palette values of the group. */
  palette?: string[];
};

export type OptionGroup = {
  id: OptionGroupId;
  title: string;
  fields: OptionFieldSpec[];
};

/**
 * Options the panel leaves out: what the plugin sets itself, what has no
 * effect on a still image, and the transforms and gradient settings that
 * belong in the design tool's own hands rather than in this panel.
 */
const HIDDEN = new Set([
  'seed',
  'size',
  'idRandomization',
  'title',
  'animation',
  'animationSpeed',
  'animationDelay',
  'fontFamily',
  'flip',
  'scale',
  'rotate',
  'translateX',
  'translateY',
  'borderRadius',
]);

const HIDDEN_SUFFIXES = ['ColorFill', 'ColorFillStops', 'ColorAngle', 'ColorOrder'];

export function humanize(name: string): string {
  return sentenceCase(name);
}

function endsWithAny(name: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => name.endsWith(suffix) && name.length > suffix.length);
}

/** Sorts a style's options into the groups the panel shows. */
export function groupOptions(entry: StyleEntry): OptionGroup[] {
  const descriptor: Descriptor = entry.descriptor;
  const components = [...entry.style.components().keys()];
  const colors = entry.style.colors();

  /** The swatches of a color group, without the hash, empty when the style has no such group. */
  const palette = (group: string): string[] =>
    colors
      .get(group)
      ?.values()
      .map((value) => value.replace(/^#/, '')) ?? [];
  const componentFields: OptionFieldSpec[] = [];
  const colorFields: OptionFieldSpec[] = [];
  const advanced: OptionFieldSpec[] = [];

  for (const [name, field] of Object.entries(descriptor)) {
    if (HIDDEN.has(name) || /Animation(Speed|Delay)?$/.test(name) || endsWithAny(name, HIDDEN_SUFFIXES)) {
      continue;
    }

    // The font options only act on styles that draw text.
    if (name === 'fontWeight' && !entry.usesText) {
      continue;
    }

    if (name === 'backgroundColor' && field.type === 'color') {
      colorFields.unshift({
        name,
        label: 'Background',
        descriptor: field,
        kind: 'color',
        palette: palette('background'),
      });

      continue;
    }

    if (name.endsWith('Variant') && field.type === 'enum') {
      const component = name.slice(0, -'Variant'.length);

      componentFields.push({ name, label: humanize(component), descriptor: field, kind: 'variant', component });

      continue;
    }

    if (name.endsWith('Probability') && field.type === 'number') {
      const component = name.slice(0, -'Probability'.length);

      componentFields.push({ name, label: 'Probability', descriptor: field, kind: 'probability', component });

      continue;
    }

    if (name.endsWith('Color') && field.type === 'color') {
      const group = name.slice(0, -'Color'.length);

      colorFields.push({ name, label: humanize(group), descriptor: field, kind: 'color', palette: palette(group) });

      continue;
    }

    advanced.push({ name, label: humanize(name), descriptor: field, kind: 'plain' });
  }

  // Variants first, then their probability, in the order the style declares.
  componentFields.sort((a, b) => {
    const order = components.indexOf(a.component!) - components.indexOf(b.component!);

    return order !== 0 ? order : a.kind === 'variant' ? -1 : 1;
  });

  const groups: OptionGroup[] = [
    { id: 'components', title: 'Components', fields: componentFields },
    { id: 'colors', title: 'Colors', fields: colorFields },
    { id: 'advanced', title: 'Advanced', fields: advanced },
  ];

  return groups.filter((group) => group.fields.length > 0);
}
