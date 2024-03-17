<script>
  import { state } from '../stores/state';
  import { activeStage } from '../stores/activeStage';

  import MenuItem from './MenuItem.svelte';
  import GeneralForm from './GeneralForm.svelte';
  import PackageForm from './PackageForm.svelte';
  import LicenseForm from './LicenseForm.svelte';
  import HookForm from './HookForm.svelte';
  import ComponentGroupForm from './ComponentGroupForm.svelte';
  import ColorGroupForm from './ColorGroupForm.svelte';

  $: activeStageSplit = $activeStage.split(':');
  $: usedColorGroups = Object.keys($state.data.colors).filter((colorGroupName) => $state.data.colors[colorGroupName].isUsedByComponents);
</script>

<div class="left">
  <div class="menu-wrapper">
    <div class="menu-section">Frame</div>
    <MenuItem stage={'general'}>General</MenuItem>
    {#if $state.data.frame.settings.compatibility != '8.x'}
      <MenuItem stage={'package'}>Package</MenuItem>
    {/if}
    <MenuItem stage={'license'}>License</MenuItem>
    {#if $state.data.frame.settings.compatibility != '8.x'}
      <MenuItem stage={'hook'}>Hooks</MenuItem>
    {/if}
  </div>

  {#if Object.keys($state.data.components).length > 0}
    <div class="menu-wrapper">
      <div class="menu-section">Components</div>
      {#each Object.keys($state.data.components) as componentGroup}
        <MenuItem stage={`component:${componentGroup}`}>
          {componentGroup}
        </MenuItem>
      {/each}
    </div>
  {/if}

  {#if usedColorGroups.length > 0}
    <div class="menu-wrapper">
      <div class="menu-section">Colors</div>
      {#each usedColorGroups as colorGroup}
        <MenuItem stage={`color:${colorGroup}`}>
          {colorGroup}
        </MenuItem>
      {/each}
    </div>
  {/if}
</div>
{#key $activeStage}
  <div class="right">
    {#if activeStageSplit[0] === 'component'}
      <ComponentGroupForm componentGroup={activeStageSplit[1]} />
    {:else if activeStageSplit[0] === 'color'}
      <ColorGroupForm colorGroup={activeStageSplit[1]} />
    {:else if activeStageSplit[0] === 'package'}
      <PackageForm />
    {:else if activeStageSplit[0] === 'license'}
      <LicenseForm />
    {:else if activeStageSplit[0] === 'general'}
      <GeneralForm />
    {:else if activeStageSplit[0] === 'hook'}
      <HookForm />
    {/if}
  </div>
{/key}

<style lang="scss">
  .left {
    width: 241px;
    border-right: 1px solid #e5e5e5;
    flex-shrink: 0;
    overflow: auto;
  }

  .right {
    width: 100%;
    overflow: auto;
  }

  .menu-section {
    height: 32px;
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0px 16px;
    font-size: 11px;
    font-weight: 600;
  }

  .menu-wrapper {
    margin: 8px 0;
  }
</style>
