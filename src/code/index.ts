import { prepareExport } from './export/prepareExport';
import { createExport } from './export/createExport';
import { setComponentGroupSettings } from './settings/setComponentGroupSettings';
import { setFrameSettings } from './settings/setFrameSettings';
import { setColorGroupSettings } from './settings/setColorGroupSettings';
import { getFrameSelection } from './utils/figma';
import { processTask } from './utils';

figma.showUI(__html__, { width: 720, height: 400 });

figma.on('selectionchange', () =>
  processTask(async () => ({
    type: 'loaded',
    data: await prepareExport(),
  }))
);

figma.ui.onmessage = async (msg) => {
  const typeSplit = msg.type.split(':');

  switch (typeSplit[0]) {
    case 'init':
      processTask(async () => ({
        type: 'loaded',
        data: await prepareExport(),
      }));
      break;

    case 'set':
      switch (typeSplit[1]) {
        case 'frame':
          setFrameSettings(getFrameSelection(), msg.data);
          break;

        case 'components':
          setComponentGroupSettings(getFrameSelection(), typeSplit[2], msg.data);
          break;

        case 'colors':
          setColorGroupSettings(getFrameSelection(), typeSplit[2], msg.data);
          break;
      }
      break;

    case 'export':
      processTask(async () => ({
        type: 'export',
        data: await createExport(),
      }));
      break;
  }
};
