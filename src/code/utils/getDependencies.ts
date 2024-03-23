export function getDependencies(svg: string) {
  const components = new Set<string>();
  const colors = new Set<string>();

  const componentRegex = /url\(#component-([^)]+)\)/g;
  var match: RegExpExecArray | null;

  while ((match = componentRegex.exec(svg))) {
    components.add(match[1]);
  }

  const colorRegex = /url\(#color-([^)]+)\)/g;
  while ((match = colorRegex.exec(svg))) {
    colors.add(match[1]);
  }

  return {
    components: Array.from(components),
    colors: Array.from(colors),
  };
}