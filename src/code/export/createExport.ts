import { kebabCase } from 'change-case';
import { prepareExport } from './prepareExport';
import { createExportFiles } from './createExportFiles';
import { createExportDefinition } from './createExportDefinition';
import { useDefinitionFile } from '../utils/useDefinitionFile';

export async function createExport() {
  const exportData = prepareExport();
  const name = kebabCase(exportData.frame.settings.title.replace(/[^a-z0-9\-\_\s]/gi, '').trim()) ?? 'avatar';

  if (useDefinitionFile(exportData.frame.settings.dicebearVersion)) {
    return {
      content: await createExportDefinition(exportData),
      name,
    };
  } else {
    return {
      files: await createExportFiles(exportData),
      name,
    };
  }
}
