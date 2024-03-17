<script>
  import { saveAs } from 'file-saver';
  import { state } from '../stores/state';
  import { createZip } from '../utils/createZip';

  import Container from './Container.svelte';

  onmessage = async (event) => {
    const message = event.data.pluginMessage;

    if (message) {
      switch (message.type) {
        case 'export':
          if (message.data.files) {
            const blob = await createZip(message.data.files);

            saveAs(blob, `${message.data.name}.zip`);
          } else {
            const blob = new Blob([message.data.content], { type: 'text/plain;charset=utf-8' });

            saveAs(blob, `${message.data.name}.json`);
          }

          parent.postMessage({ pluginMessage: { type: 'init' } }, '*');

          break;

        default:
          state.set(message);
      }
    }
  };

  $: parent.postMessage({ pluginMessage: { type: 'init' } }, '*');
</script>

<Container />

<style lang="scss" global>
  @use '~ress/ress.css';
</style>
