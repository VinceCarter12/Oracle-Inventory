<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    value,
    label,
    helper,
    icon,
  }: {
    value: string | number;
    label: string;
    helper?: string;
    icon?: Snippet;
  } = $props();
</script>

<div class="stat-card">
  {#if icon}
    <div class="stat-icon">
      {@render icon()}
    </div>
  {/if}
  <div class="stat-body">
    {#if icon}
      <!-- Icon variant: label on top, big number below -->
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value}</div>
      {#if helper}<div class="stat-helper">{helper}</div>{/if}
    {:else}
      <!-- Simple variant: big number on top, label below -->
      <span class="stat-n">{value}</span>
      <span class="stat-l">{label}</span>
    {/if}
  </div>
</div>

<style>
  .stat-card {
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 14px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .stat-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--r-md);
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--body);
  }
  .stat-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Simple variant (no icon) */
  .stat-n {
    font-size: 24px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.8px;
    line-height: 1;
  }
  .stat-l {
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
  }
  /* Icon variant */
  .stat-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .stat-value {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.04em;
    color: var(--ink);
    line-height: 1;
  }
  .stat-helper {
    font-size: 11px;
    color: var(--mute);
  }
</style>
