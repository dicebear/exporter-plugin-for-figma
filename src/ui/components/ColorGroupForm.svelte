<script>
  import { Input, Switch } from 'figma-plugin-ds-svelte';
  import { state } from '../stores/state';
  import Label from './Label.svelte';
  import Select from './Select.svelte';

  export let colorGroup;

  $: usedColorGroups = Object.keys($state.data.colors).filter((colorGroupName) => $state.data.colors[colorGroupName].isUsedByComponents);
</script>

<div class="form">
  <div class="section">
    <Label>Should not be identical with:</Label>
    {#each usedColorGroups as colorName}
      {#key colorName}
        <Switch
          bind:checked={$state.data.colors[colorGroup].settings.notEqualWith[colorName]}
          disabled={colorName === colorGroup}
        >
        {colorName}
      </Switch>
    {/key}
  {/each}
  </div>
</div>

<style lang="scss">
  .section {
    margin: 8px;
  }
</style>
