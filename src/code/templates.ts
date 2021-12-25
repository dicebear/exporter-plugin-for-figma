// @ts-nocheck
import editorconfig from './templates/.editorconfig.hbs';
import gitignore from './templates/.gitignore.hbs';
import prettierignore from './templates/.prettierignore.hbs';
import prettierrc from './templates/.prettierrc.hbs';
import LICENSE from './templates/LICENSE.hbs';
import READMEMd from './templates/README.md.hbs';
import packageJson from './templates/package.json.hbs';
import tsconfigJson from './templates/tsconfig.json.hbs';
import testsCreateTestJs from './templates/tests/create.test.js.hbs';
import srcIndexTs from './templates/src/index.ts.hbs';
import srcSchemaTs from './templates/src/schema.ts.hbs';
import srcTypesTs from './templates/src/types.ts.hbs';
import srcComponentsIndexTs from './templates/src/components/index.ts.hbs';
import srcComponentsNameTs from './templates/src/components/[name].ts.hbs';
import srcUtilsGetColorsTs from './templates/src/utils/getColors.ts.hbs';
import srcUtilsGetComponentsTs from './templates/src/utils/getComponents.ts.hbs';
import srcUtilsPickComponentTs from './templates/src/utils/pickComponent.ts.hbs';
import srcHooksOnPreCreateTs from './templates/src/hooks/onPreCreate.ts.hbs';
import srcHooksOnPostCreateTs from './templates/src/hooks/onPostCreate.ts.hbs';

export const templates = {
  '.editorconfig': editorconfig,
  '.gitignore': gitignore,
  '.prettierrc': prettierrc,
  '.prettierignore': prettierignore,
  LICENSE: LICENSE,
  'README.md': READMEMd,
  'package.json': packageJson,
  'tsconfig.json': tsconfigJson,
  'tests/create.test.js': testsCreateTestJs,
  'src/index.ts': srcIndexTs,
  'src/schema.ts': srcSchemaTs,
  'src/types.ts': srcTypesTs,
  'src/components/index.ts': srcComponentsIndexTs,
  'src/components/[name].ts': srcComponentsNameTs,
  'src/utils/getColors.ts': srcUtilsGetColorsTs,
  'src/utils/getComponents.ts': srcUtilsGetComponentsTs,
  'src/utils/pickComponent.ts': srcUtilsPickComponentTs,
  'src/hooks/onPreCreate.ts': srcHooksOnPreCreateTs,
  'src/hooks/onPostCreate.ts': srcHooksOnPostCreateTs,
};
