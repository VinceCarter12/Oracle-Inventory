<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title,
    maxWidth = '520px',
    onclose,
    children,
    footer,
  }: {
    open?: boolean;
    title: string;
    maxWidth?: string;
    onclose?: () => void;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  function close() {
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={close}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style="max-width:{maxWidth}"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="modal-head">
        <span class="modal-title" id="modal-title">{title}</span>
        <button class="modal-close" onclick={close} aria-label="Close dialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        {#if children}
          {@render children()}
        {/if}
      </div>

      <!-- Footer (optional) -->
      {#if footer}
        <div class="modal-foot">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: oklch(0% 0 0 / 40%);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal {
    background: var(--canvas);
    border-radius: var(--r-lg);
    width: 100%;
    box-shadow: 0 20px 60px oklch(0% 0 0 / 20%);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 32px);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--hairline);
    flex-shrink: 0;
  }
  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
  }
  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--mute);
    padding: 4px;
    border-radius: var(--r-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 100ms ease, color 100ms ease;
  }
  .modal-close:hover {
    background: var(--canvas-soft-2);
    color: var(--ink);
  }
  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }
  .modal-foot {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--hairline);
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .modal {
      max-width: calc(100vw - 32px) !important;
    }
  }
</style>
