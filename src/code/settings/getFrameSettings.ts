import { FrameSettings } from '../types';
import { useDefinitionFile } from '../utils/useDefinitionFile';

export function getFrameSettings(frame: FrameNode, colorGroups: string[]): FrameSettings {
  const titlePlaceholder = 'My Avatar Style';

  const data: FrameSettings = {
    dicebearVersion: '9.x',
    packageName: '',
    packageVersion: '',
    title: '',
    creator: '',
    homepage: '',
    sourceTitle: '',
    source: '',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    licenseText: '',
    shapeRendering: 'auto',
    backgroundColorGroupName: '',
    onPreCreateHook: '',
    onPostCreateHook: '',
    precision: 3,
    ...JSON.parse(frame.getPluginData(`settings`) || '{}'),
  };

  if (!data.title) {
    data.title = titlePlaceholder;
  }

  if (!useDefinitionFile(data.dicebearVersion)) {
    if (!data.sourceTitle || data.sourceTitle === titlePlaceholder) {
      data.sourceTitle = data.title;
    }

    if (!data.packageName) {
      data.packageName = '@dicebear/my-avatar-style';
    }

    if (!data.packageVersion) {
      data.packageVersion = '1.0.0';
    }
  }

  if (false === colorGroups.includes(data.backgroundColorGroupName)) {
    data.backgroundColorGroupName = '';
  }

  return data;
}
