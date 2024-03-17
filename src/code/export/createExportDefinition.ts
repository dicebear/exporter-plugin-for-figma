import { Export } from '../types';

export function createExportDefinition(exportData: Export) {
  return JSON.stringify(
    {
      foo: 'bar',
    },
    undefined,
    2
  );
}
