<script>
  import { Input } from 'figma-plugin-ds-svelte';
  import { state } from '../stores/state';
  import Label from './Label.svelte';
  import Select from './Select.svelte';

  $: backgroundColors = ['', ...Object.keys($state.data.colors)];

  let versions = ['10.x', '9.x', '8.x', '7.x', '6.x', '5.x'];
</script>

<div class="form">
  <div class="section">
    <Label>Title</Label>
    <Input bind:value={$state.data.frame.settings.title} />
  </div>
  <div class="section">
    <Label>DiceBear version</Label>
    <Select items={versions} bind:value={$state.data.frame.settings.dicebearVersion} />
  </div>
  <div class="section">
    <Label>Background Color</Label>
    <Select items={backgroundColors} bind:value={$state.data.frame.settings.backgroundColorGroupName} />
  </div>
  <div class="section">
    <Label>Shape Rendering</Label>
    <Select
      items={['auto', 'optimizeSpeed', 'crispEdges', 'geometricPrecision']}
      bind:value={$state.data.frame.settings.shapeRendering}
    />
  </div>
  <div class="section">
    <Label>Precision</Label>
    <Input type="number" min="0" max="8" bind:value={$state.data.frame.settings.precision} />
  </div>
</div>

<style lang="scss">
  .section {
    margin: 8px;
  }
</style>
