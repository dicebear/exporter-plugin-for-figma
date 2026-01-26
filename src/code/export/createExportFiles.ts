import { templates } from '../templates';
import { createTemplateString } from './createTemplateString';
import { Export } from '../types';
import { createExportJsonSchema } from './createExportJsonSchema';
import { handlebars } from '../utils/templates';

export async function createExportFiles(exportData: Export) {
  const schema = createExportJsonSchema(exportData);
  const isMitLicensed = exportData.frame.settings.licenseName && exportData.frame.settings.licenseName === 'MIT';

  const hasPreCreateHook = !!exportData.frame.settings.onPreCreateHook.trim();
  const hasPostCreateHook = !!exportData.frame.settings.onPostCreateHook.trim();

  const hasTransform =
    Object.values(exportData.components).findIndex((v) => {
      return v.settings.offsetX || v.settings.offsetY || v.settings.rotation;
    }) >= 0;

  const files: Record<string, string> = {
    '.editorconfig': templates['.editorconfig'],
    '.gitignore': templates['.gitignore'],
    '.prettierignore': templates['.prettierignore'],
    '.prettierrc': templates['.prettierrc'],
    LICENSE: handlebars.compile(templates['LICENSE'])({
      year: new Date().getFullYear(),
      creator: exportData.frame.settings.creator,
      isMitLicensed,
      sourceTitle: exportData.frame.settings.sourceTitle,
      source: exportData.frame.settings.source,
      homepage: exportData.frame.settings.homepage,
      licenseName: exportData.frame.settings.licenseName,
      licenseUrl: exportData.frame.settings.licenseUrl,
    }),
    'package.json': handlebars.compile(templates['package.json'])({
      packageName: exportData.frame.settings.packageName,
      packageVersion: exportData.frame.settings.packageVersion,
      dicebearVersion: exportData.frame.settings.dicebearVersion.replace('x', '0.0'),
    }),
    'tsconfig.json': templates['tsconfig.json'],
    'README.md': handlebars.compile(templates['README.md'])({
      title: exportData.frame.settings.title,
      sourceTitle: exportData.frame.settings.sourceTitle,
      source: exportData.frame.settings.source,
      creator: exportData.frame.settings.creator,
      homepage: exportData.frame.settings.homepage,
      licenseName: exportData.frame.settings.licenseName,
      licenseUrl: exportData.frame.settings.licenseUrl,
      packageName: exportData.frame.settings.packageName,
      packageVersionMajor: exportData.frame.settings.packageVersion.split('.')[0] ?? '0',
      packageNameLastPart: exportData.frame.settings.packageName.split('/').pop() ?? '',
      properties: schema.properties,
      isDicebearNamespace: exportData.frame.settings.packageName.split('/')[0] === '@dicebear',
      isMitLicensed,
    }),
    'tests/create.test.js': handlebars.compile(templates['tests/create.test.js'])({
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    }),
    'src/index.ts': handlebars.compile(templates['src/index.ts'])({
      title: exportData.frame.settings.title,
      year: new Date().getFullYear(),
      packageName: exportData.frame.settings.packageName,
      creator: exportData.frame.settings.creator,
      homepage: exportData.frame.settings.homepage,
      licenseName: exportData.frame.settings.licenseName,
      licenseUrl: exportData.frame.settings.licenseUrl,
      sourceTitle: exportData.frame.settings.sourceTitle,
      source: exportData.frame.settings.source,
      fileShareUrl: exportData.frame.settings.fileShareUrl,
      isMitLicensed,
      backgroundColorGroupName: exportData.frame.settings.backgroundColorGroupName,
      components: exportData.components,
      colors: exportData.colors,
      size: ((await figma.getNodeByIdAsync(exportData.frame.id)) as FrameNode).width,
      body: await createTemplateString(exportData, (await figma.getNodeByIdAsync(exportData.frame.id)) as FrameNode),
      shapeRendering: exportData.frame.settings.shapeRendering,
      hasPreCreateHook,
      hasPostCreateHook,
    }),
    'src/types.ts': handlebars.compile(templates['src/types.ts'])({
      components: exportData.components,
      colors: exportData.colors,
      backgroundColorGroupName: exportData.frame.settings.backgroundColorGroupName,
      fileShareUrl: exportData.frame.settings.fileShareUrl,
      hasTransform,
    }),
    'src/schema.ts': handlebars.compile(templates['src/schema.ts'])({
      schema: JSON.stringify(schema, undefined, 2),
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    }),
    'src/components/index.ts': handlebars.compile(templates['src/components/index.ts'])({
      components: exportData.components,
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    }),
    'src/utils/getColors.ts': handlebars.compile(templates['src/utils/getColors.ts'])({
      colors: exportData.colors,
      backgroundColorGroupName: exportData.frame.settings.backgroundColorGroupName,
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    }),
    'src/utils/getComponents.ts': handlebars.compile(templates['src/utils/getComponents.ts'])({
      components: exportData.components,
      fileShareUrl: exportData.frame.settings.fileShareUrl,
      hasTransform,
    }),
    'src/utils/pickComponent.ts': handlebars.compile(templates['src/utils/pickComponent.ts'])({
      fileShareUrl: exportData.frame.settings.fileShareUrl,
      hasTransform,
    }),
    'src/utils/convertColor.ts': handlebars.compile(templates['src/utils/convertColor.ts'])({
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    }),
  };

  if (hasPreCreateHook) {
    files['src/hooks/onPreCreate.ts'] = handlebars.compile(templates['src/hooks/onPreCreate.ts'])({
      content: exportData.frame.settings.onPreCreateHook.trim().replace(/\n/g, '\n  '),
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    });
  }

  if (hasPostCreateHook) {
    files['src/hooks/onPostCreate.ts'] = handlebars.compile(templates['src/hooks/onPostCreate.ts'])({
      content: exportData.frame.settings.onPostCreateHook.replace(/\n/g, '\n  '),
      fileShareUrl: exportData.frame.settings.fileShareUrl,
    });
  }

  // Components
  const componentTemplate = handlebars.compile(templates['src/components/[name].ts']);

  for (const componentGroupName in exportData.components) {
    if (false === exportData.components.hasOwnProperty(componentGroupName)) {
      continue;
    }

    const componentGroup = exportData.components[componentGroupName];
    const components: Record<string, string> = {};

    for (const componentName in componentGroup.collection) {
      if (false === componentGroup.collection.hasOwnProperty(componentName)) {
        continue;
      }

      const componentNode = (await figma.getNodeByIdAsync(componentGroup.collection[componentName].id)) as ComponentNode;

      components[componentName] = await createTemplateString(exportData, componentNode);
    }

    files[`src/components/${componentGroupName}.ts`] = componentTemplate({
      name: componentGroupName,
      fileShareUrl: exportData.frame.settings.fileShareUrl,
      components,
    });
  }

  return files;
}
