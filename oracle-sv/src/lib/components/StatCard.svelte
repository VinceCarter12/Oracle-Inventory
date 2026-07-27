<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    value,
    label,
    helper,
    href,
    loading = false,
    icon,
  }: {
    value:    string | number;
    label:    string;
    helper?:  string;
    href?:    string;
    loading?: boolean;
    icon?:    Snippet;
  } = $props();

  const displayValue = $derived(loading ? '…' : value);
</script>

<div class="stat-card">
  {#if icon}
    <div class="stat-icon">
      {@render icon()}
    </div>
  {/if}

  <div class="stat-body">
    {#if icon}
      <!-- Icon variant: label top, number below -->
      <div class="stat-label">{label}</div>
      <div class="stat-value">{displayValue}</div>
      {#if helper}<div class="stat-helper">{helper}</div>{/if}
    {:else}
      <!-- Simple variant: number top, label below -->
      <span class="stat-n">{displayValue}</span>
      <span class="stat-l">{label}</span>
      {#if helper}<span class="stat-helper">{helper}</span>{/if}
    {/if}

    {#if href && !loading}
      <a class="stat-link" {href}>View →</a>
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
    gap: 3px;
    min-width: 0;
  }

  /* Simple variant */
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
    line-height: 1.3;
  }

  /* Icon variant */
  .stat-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--mute);
    font-family: var(--font-mono);
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
    font-family: var(--font-sans);
    line-height: 1.3;
  }

  .stat-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 11.5px;
    font-family: var(--font-sans);
    color: var(--mute);
    text-decoration: none;
    transition: color 120ms ease;
  }

  .stat-link:hover {
    color: var(--body);
  }
</style>
