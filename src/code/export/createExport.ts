import { prepareExport } from './prepareExport';
import { createExportFiles } from './createExportFiles';
import { createExportDefinition } from './createExportDefinition';
import { useDefinitionFile } from '../utils/useDefinitionFile';

export async function createExport() {
  const exportData = prepareExport();
  const name = exportData.frame.settings.packageName
    .split('/')
    .slice(-1)[0]
    .replace(/[^a-z0-9\-\_]/gi, '');

  if (useDefinitionFile(exportData.frame.settings.dicebearVersion)) {
    return {
      content: createExportDefinition(exportData),
      name,
    };
  } else {
    return {
      files: await createExportFiles(exportData),
      name,
    }
  };
}
