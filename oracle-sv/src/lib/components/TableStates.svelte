<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    loading = false,
    error = '',
    empty = false,
    loadingText = 'Loading…',
    emptyTitle = 'No results',
    emptyMessage = '',
    onRetry,
    emptyActions,
  }: {
    loading?: boolean;
    error?: string;
    empty?: boolean;
    loadingText?: string;
    emptyTitle?: string;
    emptyMessage?: string;
    onRetry?: () => void;
    emptyActions?: Snippet;
  } = $props();
</script>

{#if loading}
  <div class="state-body">
    <span class="state-text">{loadingText}</span>
  </div>
{:else if error}
  <div class="state-body">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
      <path
        d="M12 8V12M12 16H12.01"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
    <p class="state-text">{error}</p>
    {#if onRetry}
      <button class="btn-retry" onclick={onRetry}>Retry</button>
    {/if}
  </div>
{:else if empty}
  <div class="empty-state">
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      style="color:var(--hairline-strong)"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9h6M9 12h6M9 15h4" stroke-linecap="round" />
    </svg>
    <p class="empty-title">{emptyTitle}</p>
    {#if emptyMessage}
      <p class="empty-sub">{emptyMessage}</p>
    {/if}
    {#if emptyActions}
      <div class="empty-actions">
        {@render emptyActions()}
      </div>
    {/if}
  </div>
{/if}

<style>
  .state-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    color: var(--mute);
  }
  .state-text {
    font-size: 13.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    text-align: center;
  }
  .btn-retry {
    padding: 6px 16px;
    border-radius: var(--r-md);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--body);
    cursor: pointer;
    transition: background 100ms ease;
  }
  .btn-retry:hover {
    background: var(--canvas-soft-2);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 64px 24px;
    text-align: center;
  }
  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    margin: 0;
  }
  .empty-sub {
    font-size: 13px;
    color: var(--mute);
    margin: 0;
    max-width: 380px;
    line-height: 1.5;
    font-family: var(--font-sans);
  }
  .empty-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 4px;
  }
</style>
