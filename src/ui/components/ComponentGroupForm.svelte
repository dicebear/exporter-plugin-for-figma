<script>
  import { Input, Switch } from 'figma-plugin-ds-svelte';
  import { state } from '../stores/state';
  import Label from './Label.svelte';
  import Select from './Select.svelte';

  export let componentGroup;

  let rotation = ['', 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
  let offsetX = ['', 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  let offsetY = ['', 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
</script>

<div class="form">
  <div class="section">
    <Label>Probability (in percent)</Label>
    <Input
      type="number"
      placeholder="Leave blank to disable option"
      bind:value={$state.data.components[componentGroup].settings.probability}
    />
  </div>

  <div class="section">
    <Label>Allowed Rotation (in deg)</Label>
    <Select
      items={rotation}
      bind:value={$state.data.components[componentGroup].settings.rotation}
    />
  </div>

  <div class="section">
    <Label>Allowed Horizontal Offset</Label>
    <Select
      items={offsetX}
      bind:value={$state.data.components[componentGroup].settings.offsetX}
    />
  </div>

  <div class="section">
    <Label>Allowed Vertical Offset</Label>
    <Select
      items={offsetY}
      bind:value={$state.data.components[componentGroup].settings.offsetY}
    />
  </div>

  <div class="section">
    <Label>Defaults</Label>
    {#each Object.keys($state.data.components[componentGroup].settings.defaults) as componentName}
      {#key `components:${componentGroup}:${componentName}`}
        <Switch
          bind:checked={$state.data.components[componentGroup].settings
            .defaults[componentName]}
        >
          {componentName}
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
