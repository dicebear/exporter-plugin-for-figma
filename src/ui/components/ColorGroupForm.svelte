<script>
  import { state } from '../stores/state';
  import Label from './Label.svelte';
  import Select from './Select.svelte';

  export let colorGroup;

  $: usedColorGroups = [
    'background',
    ...Object.keys($state.data.colors).filter(
      (colorGroupName) => $state.data.colors[colorGroupName].isUsedByComponents && colorGroupName !== colorGroup,
    ),
  ];
</script>

<div class="form">
  <div class="section">
    <Label>Should not be identical with:</Label>
    <Select items={usedColorGroups} bind:value={$state.data.colors[colorGroup].settings.differentFromColor} />
  </div>
  <div class="section">
    <Label>Should be a contrast color to:</Label>
    <Select items={usedColorGroups} bind:value={$state.data.colors[colorGroup].settings.contrastColor} />
  </div>
</div>

<style lang="scss">
  .section {
    margin: 8px;
  }
</style>
