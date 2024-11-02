import { DefinitionComponents } from '../types';

export function sortComponents(components: DefinitionComponents) {
  // Sort by name
  components.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  // Sort values
  components.forEach((component) => {
    component.variants.sort();
  });

  return components;
}
