import { DefinitionColors } from "../types";
import type { ValuesType } from "utility-types";

function getPriority(color: ValuesType<DefinitionColors>, colors: DefinitionColors) {
  if (color.contrastColor) {
    return colors.findIndex(e => e.name === color.contrastColor) + 1;
  } else if (color.differentFromColor) {
    return colors.findIndex(e => e.name === color.differentFromColor) + 1;
  }
  return 0;
}

export function sortColors(colors: DefinitionColors) {
  colors.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  // Sort by dependencies first and then by name, but keep `background` at the top
  colors.sort((a, b) => {
    // Priorität ermitteln
    const priorityA = getPriority(a, colors);
    const priorityB = getPriority(b, colors);

    // Erst nach Priorität sortieren
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return 0
  });

  // Sort values
  colors.forEach((color) => {
    color.values.sort();
  });

  return colors;
}
