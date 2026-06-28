<script lang="ts">
  // ── Props ──────────────────────────────────────────────────────────────────
  let {
    currentPage = $bindable(1),
    totalPages,
    perPage = $bindable(25),
    perPageOptions = [10, 25, 50],
    onchange,
  }: {
    currentPage?: number;
    totalPages: number;
    perPage?: number;
    perPageOptions?: number[];
    onchange?: () => void;
  } = $props();

  // ── Page number list with ellipsis ─────────────────────────────────────────
  const pageNums = $derived((): (number | '…')[] => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '…')[] = [];
    const left  = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);
    pages.push(1);
    if (left > 2)               pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    pages.push(totalPages);
    return pages;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  let goToInput = $state('');

  function goTo(n: number) {
    currentPage = Math.max(1, Math.min(totalPages, n));
    onchange?.();
  }

  function handleGoTo() {
    const n = parseInt(goToInput, 10);
    if (!isNaN(n)) goTo(n);
    goToInput = '';
  }

  function handlePerPageChange() {
    currentPage = 1;
    onchange?.();
  }
</script>

<div class="pagination-bar">
  <!-- Per-page selector -->
  <div class="bar-left">
    <span class="bar-label">Showing per page</span>
    <select
      class="per-page-select"
      bind:value={perPage}
      onchange={handlePerPageChange}
      aria-label="Rows per page"
    >
      {#each perPageOptions as n}
        <option value={n}>{n}</option>
      {/each}
    </select>
  </div>

  <!-- Page buttons -->
  <div class="page-nav">
    <button
      class="pg-btn"
      onclick={() => goTo(1)}
      disabled={currentPage === 1}
      aria-label="First page"
    >«</button>
    <button
      class="pg-btn"
      onclick={() => goTo(currentPage - 1)}
      disabled={currentPage === 1}
      aria-label="Previous page"
    >‹</button>

    {#each pageNums() as p}
      {#if p === '…'}
        <span class="pg-ellipsis">…</span>
      {:else}
        <button
          class="pg-btn"
          class:pg-active={p === currentPage}
          onclick={() => goTo(p as number)}
          aria-current={p === currentPage ? 'page' : undefined}
        >{p}</button>
      {/if}
    {/each}

    <button
      class="pg-btn"
      onclick={() => goTo(currentPage + 1)}
      disabled={currentPage === totalPages}
      aria-label="Next page"
    >›</button>
    <button
      class="pg-btn"
      onclick={() => goTo(totalPages)}
      disabled={currentPage === totalPages}
      aria-label="Last page"
    >»</button>
  </div>

  <!-- Go-to page -->
  <div class="bar-right">
    <span class="bar-label">Go to page</span>
    <input
      class="goto-input"
      type="number"
      min="1"
      max={totalPages}
      bind:value={goToInput}
      onkeydown={(e) => e.key === 'Enter' && handleGoTo()}
      aria-label="Go to page number"
    />
    <button class="goto-btn" onclick={handleGoTo}>Go</button>
  </div>
</div>

<style>
  .pagination-bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 10px 16px;
    border-top: 1px solid var(--hairline);
    gap: 12px;
    flex-shrink: 0;
  }

  /* Left: per-page */
  .bar-left {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .bar-label {
    font-size: 12px;
    color: var(--mute);
    white-space: nowrap;
    font-family: var(--font-sans);
  }
  .per-page-select {
    padding: 4px 8px;
    border-radius: var(--r-sm);
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--body);
    cursor: pointer;
    outline: none;
    width: 58px;
  }

  /* Center: page buttons */
  .page-nav {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .pg-btn {
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    border-radius: var(--r-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    color: var(--body);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 100ms ease;
  }
  .pg-btn:hover:not(:disabled) {
    background: var(--canvas-soft-2);
  }
  .pg-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pg-active {
    background: var(--ink) !important;
    color: var(--on-primary) !important;
    border-color: var(--ink) !important;
  }
  .pg-ellipsis {
    padding: 0 4px;
    font-size: 12px;
    color: var(--mute);
    display: flex;
    align-items: center;
    font-family: var(--font-sans);
  }

  /* Right: go-to */
  .bar-right {
    display: flex;
    align-items: center;
    gap: 7px;
    justify-content: flex-end;
  }
  .goto-input {
    width: 46px;
    padding: 4px 7px;
    border-radius: var(--r-sm);
    font-size: 12px;
    font-family: var(--font-sans);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--ink);
    outline: none;
    text-align: center;
  }
  .goto-input::-webkit-inner-spin-button,
  .goto-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }
  .goto-btn {
    padding: 4px 10px;
    border-radius: var(--r-sm);
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--body);
    cursor: pointer;
    transition: background 100ms ease;
  }
  .goto-btn:hover {
    background: var(--canvas-soft-2);
  }

  @media (max-width: 640px) {
    .pagination-bar {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .bar-left { justify-content: center; }
    .bar-right { justify-content: center; }
  }
</style>
