<script>
  import { Switch } from 'figma-plugin-ds-svelte';
  import { state } from '../stores/state';
  import Label from './Label.svelte';
  import Select from './Select.svelte';

  export let colorGroup;

  $: usedColorGroups = [
    '',
    'background',
    ...Object.keys($state.data.colors).filter(
      (colorGroupName) => $state.data.colors[colorGroupName].isUsedByComponents && colorGroupName !== colorGroup,
    ),
  ];
</script>

<div class="form">
  <div class="section">
    <Label>Should be a contrast color to:</Label>
    <Select items={usedColorGroups} bind:value={$state.data.colors[colorGroup].settings.contrastTo} />
  </div>
  <div class="section">
    <Label>Should not be identical with:</Label>
    {#each Object.values(usedColorGroups) as colorName}
      {#if colorName}
        {#key `colors:${colorGroup}:${colorName}`}
          <Switch bind:checked={$state.data.colors[colorGroup].settings.notEqualTo[colorName]}>
            {colorName}
          </Switch>
        {/key}
      {/if}
    {/each}
  </div>
</div>

<style lang="scss">
  .section {
    margin: 8px;
  }
</style>
