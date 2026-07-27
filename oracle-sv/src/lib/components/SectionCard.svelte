<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    subtitle,
    action,
    children,
    flush = false,
  }: {
    title: string;
    subtitle?: string;
    action?: Snippet;
    children: Snippet;
    flush?: boolean;
  } = $props();
</script>

<div class="card">
  <div class="card-head">
    <div class="card-title-block">
      <span class="card-title">{title}</span>
      {#if subtitle}<span class="card-sub">{subtitle}</span>{/if}
    </div>
    {#if action}
      <div class="card-action">{@render action()}</div>
    {/if}
  </div>
  <div class="card-body" class:flush>
    {#if children}{@render children()}{/if}
  </div>
</div>

<style>
  .card {
    background: var(--canvas);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l2);
    overflow: hidden;
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--hairline);
    flex-wrap: wrap;
  }

  .card-title-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.2px;
    line-height: 1.3;
  }

  .card-sub {
    font-size: 11.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    line-height: 1.3;
  }

  .card-action {
    flex-shrink: 0;
  }

  .card-body {
    padding: 16px 20px 20px;
  }

  .card-body.flush {
    padding: 0;
  }
</style>
