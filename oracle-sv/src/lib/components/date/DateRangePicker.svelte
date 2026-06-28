<script lang="ts">
  import CalendarGrid from './CalendarGrid.svelte';
  import {
    toISO,
    fromISO,
    addMonths,
    MONTH_NAMES,
  } from '$lib/utils/dates';

  interface Props {
    from?: string;           // bindable, YYYY-MM-DD
    to?: string;             // bindable, YYYY-MM-DD
    placeholder?: string;
    minDate?: string;
    maxDate?: string;
    label?: string;
    onchange?: (range: { from: string; to: string }) => void;
    onapply?: (range: { from: string; to: string }) => void;
  }

  let {
    from = $bindable(''),
    to   = $bindable(''),
    placeholder = 'Select date range',
    minDate,
    maxDate,
    label,
    onchange,
    onapply,
  }: Props = $props();

  // ── Selection state ──────────────────────────────────────────────────────────
  // When open: tracks the in-progress range selection
  let pendingFrom = $state('');
  let pendingTo   = $state('');
  let selectingEnd = $state(false); // true after first click, waiting for second
  let hoverDate    = $state('');

  // ── Popover state ────────────────────────────────────────────────────────────
  let open      = $state(false);
  let viewYear  = $state(new Date().getFullYear());
  let viewMonth = $state(new Date().getMonth());

  // Initialize pending state from props when popover opens
  $effect(() => {
    if (open) {
      pendingFrom  = from ?? '';
      pendingTo    = to   ?? '';
      selectingEnd = false;
      hoverDate    = '';
      // Navigate view to from date if set
      if (from) {
        const d = fromISO(from);
        viewYear  = d.getFullYear();
        viewMonth = d.getMonth();
      }
    }
  });

  // ── Month navigation ─────────────────────────────────────────────────────────
  function prevMonth() {
    const d = addMonths(new Date(viewYear, viewMonth, 1), -1);
    viewYear  = d.getFullYear();
    viewMonth = d.getMonth();
  }

  function nextMonth() {
    const d = addMonths(new Date(viewYear, viewMonth, 1), 1);
    viewYear  = d.getFullYear();
    viewMonth = d.getMonth();
  }

  function handleNavigate(yr: number, mo: number) {
    viewYear  = yr;
    viewMonth = mo;
  }

  // ── Day selection logic ───────────────────────────────────────────────────────
  function handleSelectDay(iso: string) {
    if (!selectingEnd) {
      // First click: set start, enter selecting-end mode
      pendingFrom  = iso;
      pendingTo    = '';
      hoverDate    = '';
      selectingEnd = true;
    } else {
      // Second click: set end
      if (iso < pendingFrom) {
        // Clicked before start: swap
        pendingTo   = pendingFrom;
        pendingFrom = iso;
      } else {
        pendingTo = iso;
      }
      selectingEnd = false;
      hoverDate    = '';
    }
  }

  function handleHoverDay(iso: string | null) {
    if (selectingEnd) hoverDate = iso ?? '';
  }

  // ── Apply / Clear ────────────────────────────────────────────────────────────
  function handleApply() {
    from = pendingFrom;
    to   = pendingTo;
    open = false;
    if (from && to) {
      onchange?.({ from, to });
      onapply?.({ from, to });
    }
  }

  function handleClear() {
    pendingFrom  = '';
    pendingTo    = '';
    hoverDate    = '';
    selectingEnd = false;
    from = '';
    to   = '';
    onchange?.({ from: '', to: '' });
  }

  function handleOpenToggle() {
    open = !open;
  }

  // ── Year/Month picker mode ────────────────────────────────────────────────────
  let viewMode = $state<'days' | 'months' | 'years'>('days');
  let yearPageStart = $state(Math.floor(new Date().getFullYear() / 10) * 10);

  // Reset picker mode when popover closes
  $effect(() => { if (!open) viewMode = 'days'; });

  function openYearView() {
    yearPageStart = Math.floor(viewYear / 10) * 10;
    viewMode = 'years';
  }

  function selectYear(yr: number) {
    viewYear = yr;
    viewMode = 'months';
  }

  function selectMonth(mo: number) {
    viewMonth = mo;
    viewMode = 'days';
  }

  function navPrev() {
    if (viewMode === 'days') prevMonth();
    else if (viewMode === 'months') viewYear--;
    else yearPageStart -= 12;
  }

  function navNext() {
    if (viewMode === 'days') nextMonth();
    else if (viewMode === 'months') viewYear++;
    else yearPageStart += 12;
  }

  // ── Close on outside click ───────────────────────────────────────────────────
  let wrapEl:    HTMLDivElement | undefined;
  let triggerEl: HTMLButtonElement | undefined;

  function handleWindowClick(e: MouseEvent) {
    if (open && wrapEl && !wrapEl.contains(e.target as Node)) {
      open = false;
    }
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      open = false;
      triggerEl?.focus();
    }
  }

  // ── Display text ─────────────────────────────────────────────────────────────
  function fmtISO(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${y}.${m}.${d}`;
  }

  const displayFrom = $derived(from ? fmtISO(from) : '');
  const displayTo   = $derived(to   ? fmtISO(to)   : '');

  const triggerLabel = $derived(
    displayFrom && displayTo
      ? `${displayFrom} → ${displayTo}`
      : displayFrom
        ? `From ${displayFrom}`
        : placeholder
  );

  const hasRange = $derived(!!(from && to));

  // ── Effective range values for CalendarGrid ──────────────────────────────────
  const effectiveFrom = $derived(pendingFrom || undefined);
  const effectiveTo   = $derived(pendingTo   || undefined);
  const effectiveHover = $derived(selectingEnd ? hoverDate || undefined : undefined);
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="drp-wrap" bind:this={wrapEl}>

  {#if label}
    <span class="drp-label">{label}</span>
  {/if}

  <!-- Inline display trigger -->
  <button
    type="button"
    class="drp-trigger"
    class:has-range={hasRange}
    class:selecting={open}
    bind:this={triggerEl}
    onclick={handleOpenToggle}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={triggerLabel}
  >
    <div class="drp-display">
      {#if displayFrom}
        <span class="drp-date drp-date-from">{displayFrom}</span>
        <span class="drp-arrow">→</span>
        <span class="drp-date drp-date-to {displayTo ? '' : 'drp-date-empty'}">
          {displayTo || 'End date'}
        </span>
      {:else}
        <span class="drp-placeholder">{placeholder}</span>
      {/if}
    </div>
    <svg class="drp-cal-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M3 9H21" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 2V6M16 2V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>

  <!-- Popover -->
  {#if open}
    <div
      class="drp-popover"
      role="dialog"
      aria-label="Choose date range"
      aria-modal="true"
    >
      <!-- Header: selected range display -->
      <div class="drp-header">
        <span class="drp-header-label">Selected dates</span>
        <div class="drp-header-range">
          <span class="drp-header-date">
            {pendingFrom ? fmtISO(pendingFrom) : '—'}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12H19M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="drp-header-date">
            {(pendingTo || (selectingEnd && hoverDate)) ? fmtISO(pendingTo || hoverDate) : '—'}
          </span>
        </div>
      </div>

      <!-- Selecting-end hint -->
      {#if selectingEnd}
        <div class="drp-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Click to set end date
        </div>
      {/if}

      <!-- Month nav -->
      <div class="drp-nav">
        <button
          type="button"
          class="drp-nav-btn"
          onclick={navPrev}
          aria-label={viewMode === 'days' ? 'Previous month' : viewMode === 'months' ? 'Previous year' : 'Previous years'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        {#if viewMode === 'days'}
          <button type="button" class="drp-month-btn" onclick={openYearView} aria-label="Pick year and month">
            {MONTH_NAMES[viewMonth]} {viewYear}
            <svg class="drp-month-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {:else if viewMode === 'months'}
          <button type="button" class="drp-month-btn" onclick={openYearView} aria-label="Pick year">
            {viewYear}
            <svg class="drp-month-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {:else}
          <span class="drp-month-label">{yearPageStart} – {yearPageStart + 11}</span>
        {/if}

        <button
          type="button"
          class="drp-nav-btn"
          onclick={navNext}
          aria-label={viewMode === 'days' ? 'Next month' : viewMode === 'months' ? 'Next year' : 'Next years'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Calendar / Month grid / Year grid -->
      {#if viewMode === 'days'}
        <CalendarGrid
          year={viewYear}
          month={viewMonth}
          rangeFrom={effectiveFrom}
          rangeTo={effectiveTo}
          hoverDate={effectiveHover}
          {minDate}
          {maxDate}
          onSelectDay={handleSelectDay}
          onHoverDay={handleHoverDay}
          onNavigate={handleNavigate}
          onEscape={() => { open = false; triggerEl?.focus(); }}
        />
      {:else if viewMode === 'months'}
        <div class="drp-pick-grid drp-pick-grid--months">
          {#each MONTH_NAMES as name, i}
            <button
              type="button"
              class="drp-pick-cell"
              class:is-active={i === viewMonth}
              onclick={() => selectMonth(i)}
            >{name.slice(0, 3)}</button>
          {/each}
        </div>
      {:else}
        <div class="drp-pick-grid drp-pick-grid--years">
          {#each Array.from({length: 12}, (_, i) => yearPageStart + i) as yr}
            <button
              type="button"
              class="drp-pick-cell"
              class:is-active={yr === viewYear}
              onclick={() => selectYear(yr)}
            >{yr}</button>
          {/each}
        </div>
      {/if}

      <!-- Footer -->
      <div class="drp-footer">
        <button
          type="button"
          class="drp-footer-clear"
          onclick={handleClear}
        >
          Clear
        </button>
        <button
          type="button"
          class="drp-footer-apply"
          onclick={handleApply}
          disabled={!pendingFrom}
        >
          Apply
        </button>
      </div>
    </div>
  {/if}

</div>

<style>
  .drp-wrap {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
  }

  .drp-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
  }

  /* ── Trigger (inline display bar) ── */
  .drp-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    background: var(--canvas-soft);
    color: var(--mute);
    font-family: var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 120ms ease, background 120ms ease;
    min-width: 220px;
    text-align: left;
  }

  .drp-trigger.has-range {
    background: var(--canvas);
    color: var(--ink);
  }

  .drp-trigger.selecting {
    border-color: var(--link);
    box-shadow: 0 0 0 3px var(--link-bg-soft);
  }

  .drp-trigger:hover {
    border-color: var(--link);
  }

  .drp-trigger:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .drp-display {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .drp-date {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
  }

  .drp-date-empty {
    color: var(--mute);
    font-weight: 400;
  }

  .drp-arrow {
    font-size: 13px;
    color: var(--mute);
  }

  .drp-placeholder {
    font-size: 13px;
    color: var(--mute);
  }

  .drp-cal-icon {
    color: var(--mute);
    flex-shrink: 0;
    margin-left: auto;
  }

  /* ── Popover ── */
  .drp-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 500;
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-xl);
    box-shadow: 0 8px 32px oklch(0% 0 0 / 0.12), 0 2px 8px oklch(0% 0 0 / 0.06);
    padding: 14px 14px 12px;
    width: 308px;
    user-select: none;
  }

  /* ── Header: selected range display ── */
  .drp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--hairline);
  }

  .drp-header-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: var(--font-sans);
  }

  .drp-header-range {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--mute);
  }

  .drp-header-date {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
  }

  /* ── Selecting hint ── */
  .drp-hint {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--link);
    font-family: var(--font-sans);
    margin-bottom: 10px;
    padding: 5px 8px;
    background: var(--link-bg-soft);
    border-radius: var(--r-sm);
  }

  /* ── Month nav ── */
  .drp-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .drp-nav-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--body);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 100ms;
    flex-shrink: 0;
  }

  .drp-nav-btn:hover {
    background: var(--canvas-soft-2);
  }

  .drp-nav-btn:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .drp-month-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.3px;
  }

  /* ── Clickable month/year label button ── */
  .drp-month-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.3px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border-radius: var(--r-sm);
    transition: background 100ms;
  }

  .drp-month-btn:hover {
    background: var(--canvas-soft-2);
  }

  .drp-month-btn:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .drp-month-chevron {
    color: var(--mute);
    flex-shrink: 0;
  }

  /* ── Month / Year picker grids ── */
  .drp-pick-grid {
    display: grid;
    gap: 4px;
    margin-bottom: 2px;
  }

  .drp-pick-grid--months {
    grid-template-columns: repeat(3, 1fr);
  }

  .drp-pick-grid--years {
    grid-template-columns: repeat(4, 1fr);
  }

  .drp-pick-cell {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 400;
    font-family: var(--font-sans);
    color: var(--ink);
    padding: 9px 4px;
    border-radius: var(--r-sm);
    text-align: center;
    transition: background 100ms, color 100ms;
  }

  .drp-pick-cell:hover {
    background: var(--canvas-soft-2);
  }

  .drp-pick-cell:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .drp-pick-cell.is-active {
    background: var(--ink);
    color: var(--on-primary, #fff);
    font-weight: 500;
  }

  /* ── Footer ── */
  .drp-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
    gap: 8px;
  }

  .drp-footer-clear {
    background: none;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    color: var(--mute);
    cursor: pointer;
    transition: background 100ms, border-color 100ms, color 100ms;
  }

  .drp-footer-clear:hover {
    background: var(--canvas-soft-2);
    border-color: var(--hairline-strong);
    color: var(--body);
  }

  .drp-footer-clear:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .drp-footer-apply {
    background: var(--ink);
    border: none;
    border-radius: var(--r-sm);
    padding: 5px 16px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    color: var(--on-primary, #fff);
    cursor: pointer;
    transition: opacity 120ms;
  }

  .drp-footer-apply:hover:not(:disabled) {
    opacity: 0.85;
  }

  .drp-footer-apply:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .drp-footer-apply:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  /* Keep popover on screen on small viewports */
  @media (max-width: 480px) {
    .drp-popover {
      left: auto;
      right: 0;
      width: calc(100vw - 32px);
    }
  }
</style>
