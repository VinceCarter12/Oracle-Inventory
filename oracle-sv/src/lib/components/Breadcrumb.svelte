<script lang="ts">
  import { goto } from '$app/navigation';

  interface Crumb {
    label: string;
    href?: string;
  }

  let { crumbs }: { crumbs: Crumb[] } = $props();
</script>

<nav class="breadcrumb" aria-label="Breadcrumb">
  {#each crumbs as crumb, i}
    {#if i > 0}
      <svg
        class="crumb-sep"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    {/if}

    {#if crumb.href && i < crumbs.length - 1}
      <button class="crumb-link" onclick={() => goto(crumb.href!)}>{crumb.label}</button>
    {:else}
      <span class="crumb-current">{crumb.label}</span>
    {/if}
  {/each}
</nav>

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }
  .crumb-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 12.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: color 120ms ease;
  }
  .crumb-link:hover {
    color: var(--body);
  }
  .crumb-sep {
    color: var(--hairline-strong);
    flex-shrink: 0;
  }
  .crumb-current {
    font-size: 12.5px;
    color: var(--body);
    font-family: var(--font-sans);
  }
</style>
