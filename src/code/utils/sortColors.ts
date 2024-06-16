import { DefinitionColors } from '../types';
import type { ValuesType } from 'utility-types';

function getDependencies(color: ValuesType<DefinitionColors>): string[] {
  const dependencies = new Set<string>();

  if (color.contrastTo) {
    dependencies.add(color.contrastTo);
  }

  if (color.notEqualTo) {
    for (const notEqualTo of color.notEqualTo) {
      dependencies.add(notEqualTo);
    }
  }

  return Array.from(dependencies);
}

export function sortColors(colors: DefinitionColors) {
  colors.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  // Sort by dependencies first and then by name, but keep `background` at the top
  colors.sort((a, b) => {
    const aIncludesB = getDependencies(a).includes(b.name);
    const bIncludesA = getDependencies(b).includes(a.name);

    if (aIncludesB == bIncludesA) {
      return 0;
    } else if (aIncludesB) {
      return 1;
    } else {
      return -1;
    }
  });

  // Sort values
  colors.forEach((color) => {
    color.values.sort();
  });

  return colors;
}
