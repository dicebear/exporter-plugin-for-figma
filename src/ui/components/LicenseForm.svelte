<script>
  import { Input, Textarea } from 'figma-plugin-ds-svelte';
  import { state } from '../stores/state';
  import Label from './Label.svelte';
  import { useDefinitionFile } from '../utils/useDefinitionFile';
</script>

<div class="form">
  <div class="section">
    <Label>Source Title</Label>
    <Input bind:value={$state.data.frame.settings.sourceTitle} />
  </div>

  <div class="section">
    <Label>Source URL</Label>
    <Input bind:value={$state.data.frame.settings.source} />
  </div>

  <div class="section">
    <Label>Creator</Label>
    <Input bind:value={$state.data.frame.settings.creator} />
  </div>

  <div class="section">
    <Label>Homepage URL</Label>
    <Input bind:value={$state.data.frame.settings.homepage} />
  </div>

  <div class="section">
    <Label>License Name</Label>
    <Input bind:value={$state.data.frame.settings.licenseName} />
  </div>

  <div class="section">
    <Label>License URL</Label>
    <Input bind:value={$state.data.frame.settings.licenseUrl} />
  </div>

  {#if useDefinitionFile($state.data.frame.settings.dicebearVersion)}
    <div class="section">
      <Label>License Content</Label>
      <Textarea bind:value={$state.data.frame.settings.licenseContent} />
    </div>
  {/if}
</div>

<style lang="scss">
  .section {
    margin: 8px;
  }
</style>
