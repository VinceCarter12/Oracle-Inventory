<script lang="ts">
  import CalendarGrid from './CalendarGrid.svelte';
  import {
    toISO,
    fromISO,
    addMonths,
    MONTH_NAMES,
    formatDisplay,
  } from '$lib/utils/dates';

  interface Props {
    value?: string;         // bindable, YYYY-MM-DD
    placeholder?: string;
    minDate?: string;
    maxDate?: string;
    disabledDates?: string[];
    label?: string;
    id?: string;
    onchange?: (val: string) => void;
  }

  let {
    value = $bindable(''),
    placeholder = 'Pick a date',
    minDate,
    maxDate,
    disabledDates = [],
    label,
    id,
    onchange,
  }: Props = $props();

  // ── Popover state ────────────────────────────────────────────────────────────
  let open      = $state(false);
  let viewYear  = $state(new Date().getFullYear());
  let viewMonth = $state(new Date().getMonth());

  // ── Fixed position (escapes overflow:hidden parents) ─────────────────────────
  let popoverTop  = $state(0);
  let popoverLeft = $state(0);

  $effect(() => {
    if (open && triggerEl) {
      const rect   = triggerEl.getBoundingClientRect();
      const popW   = 296;
      const maxLeft = window.innerWidth - popW - 8;
      popoverTop  = rect.bottom + 6;
      popoverLeft = Math.min(Math.max(8, rect.left), maxLeft);
    }
  });

  // Sync view to value when it changes externally
  $effect(() => {
    if (value) {
      const d = fromISO(value);
      if (!isNaN(d.getTime())) {
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

  // ── Selection ────────────────────────────────────────────────────────────────
  function handleSelectDay(iso: string) {
    value = iso;
    open  = false;
    onchange?.(iso);
    // Return focus to trigger
    setTimeout(() => triggerEl?.focus(), 0);
  }

  function handleToday() {
    handleSelectDay(toISO(new Date()));
  }

  function handleClear(e?: Event) {
    e?.stopPropagation();
    value = '';
    onchange?.('');
  }

  // ── Year/Month picker mode ────────────────────────────────────────────────────
  let viewMode = $state<'days' | 'months' | 'years'>('days');
  let yearPageStart = $state(new Date().getFullYear() - 10);
  const yearList = $derived(Array.from({length: 20}, (_, i) => yearPageStart + i));

  // Reset picker mode when popover closes
  $effect(() => { if (!open) viewMode = 'days'; });

  function openYearView() {
    yearPageStart = viewYear - 10;
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
    else yearPageStart -= 20;
  }

  function navNext() {
    if (viewMode === 'days') nextMonth();
    else if (viewMode === 'months') viewYear++;
    else yearPageStart += 20;
  }

  // ── Closing behavior ─────────────────────────────────────────────────────────
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

  function handleWindowScroll() {
    if (open && triggerEl) {
      const rect    = triggerEl.getBoundingClientRect();
      const popW    = 296;
      const maxLeft = window.innerWidth - popW - 8;
      popoverTop  = rect.bottom + 6;
      popoverLeft = Math.min(Math.max(8, rect.left), maxLeft);
    }
  }

  // ── Display ──────────────────────────────────────────────────────────────────
  const displayText = $derived(value ? formatDisplay(value) : '');
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} onscroll={handleWindowScroll} />

<div class="dp-wrap" bind:this={wrapEl}>

  {#if label}
    <label class="dp-label" for={id ?? 'dp-trigger'}>{label}</label>
  {/if}

  <!-- Trigger -->
  <button
    type="button"
    class="dp-trigger"
    class:has-value={!!value}
    id={id ?? 'dp-trigger'}
    bind:this={triggerEl}
    onclick={() => (open = !open)}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={value ? `Date: ${displayText}. Press Enter to change.` : placeholder}
  >
    <svg class="dp-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M3 9H21" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 2V6M16 2V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span class="dp-text">{displayText || placeholder}</span>
    {#if value}
      <button
        type="button"
        class="dp-clear"
        onclick={handleClear}
        aria-label="Clear date"
        tabindex={-1}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
    <svg class="dp-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <!-- Popover -->
  {#if open}
    <div
      class="dp-popover"
      style="top:{popoverTop}px;left:{popoverLeft}px"
      role="dialog"
      aria-label="Choose a date"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Month nav -->
      <div class="dp-nav">
        <button
          type="button"
          class="dp-nav-btn"
          onclick={navPrev}
          aria-label={viewMode === 'days' ? 'Previous month' : viewMode === 'months' ? 'Previous year' : 'Previous years'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        {#if viewMode === 'days'}
          <button type="button" class="dp-month-btn" onclick={openYearView} aria-label="Pick year and month">
            {MONTH_NAMES[viewMonth]} {viewYear}
            <svg class="dp-month-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {:else if viewMode === 'months'}
          <button type="button" class="dp-month-btn" onclick={openYearView} aria-label="Pick year">
            {viewYear}
            <svg class="dp-month-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        {:else}
          <span class="dp-month-label">{yearPageStart} – {yearPageStart + 19}</span>
        {/if}

        <button
          type="button"
          class="dp-nav-btn"
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
          selected={value || undefined}
          {minDate}
          {maxDate}
          {disabledDates}
          onSelectDay={handleSelectDay}
          onNavigate={handleNavigate}
          onEscape={() => { open = false; triggerEl?.focus(); }}
        />
      {:else if viewMode === 'months'}
        <div class="dp-pick-grid dp-pick-grid--months">
          {#each MONTH_NAMES as name, i}
            <button
              type="button"
              class="dp-pick-cell"
              class:is-active={i === viewMonth}
              onclick={() => selectMonth(i)}
            >{name.slice(0, 3)}</button>
          {/each}
        </div>
      {:else}
        <div class="dp-pick-grid dp-pick-grid--years">
          {#each yearList as yr}
            <button
              type="button"
              class="dp-pick-cell"
              class:is-active={yr === viewYear}
              onclick={() => selectYear(yr)}
            >{yr}</button>
          {/each}
        </div>
      {/if}

      <!-- Footer -->
      <div class="dp-footer">
        <button type="button" class="dp-footer-btn" onclick={handleToday}>Today</button>
        <button type="button" class="dp-footer-btn dp-footer-clear" onclick={handleClear}>Clear</button>
      </div>
    </div>
  {/if}

</div>

<style>
  .dp-wrap {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
  }

  .dp-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
  }

  /* ── Trigger ── */
  .dp-trigger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    background: var(--canvas);
    color: var(--mute);
    font-size: 13px;
    font-family: var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
    min-width: 140px;
    text-align: left;
  }

  .dp-trigger.has-value {
    color: var(--ink);
  }

  .dp-trigger:hover {
    border-color: var(--link);
    color: var(--ink);
  }

  .dp-trigger:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
    border-color: var(--link);
  }

  .dp-icon {
    color: var(--mute);
    flex-shrink: 0;
  }

  .dp-text {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dp-chevron {
    color: var(--mute);
    flex-shrink: 0;
  }

  .dp-clear {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--mute);
    display: flex;
    align-items: center;
    border-radius: 3px;
    flex-shrink: 0;
    transition: color 100ms, background 100ms;
  }

  .dp-clear:hover {
    color: var(--body);
    background: var(--canvas-soft-2);
  }

  /* ── Popover ── */
  .dp-popover {
    position: fixed;
    z-index: 500;
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-xl);
    box-shadow: 0 8px 32px oklch(0% 0 0 / 0.12), 0 2px 8px oklch(0% 0 0 / 0.06);
    padding: 16px 14px 12px;
    width: 296px;
    user-select: none;
  }

  /* ── Month nav ── */
  .dp-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .dp-nav-btn {
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

  .dp-nav-btn:hover {
    background: var(--canvas-soft-2);
  }

  .dp-nav-btn:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .dp-month-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.3px;
  }

  /* ── Clickable month/year label button ── */
  .dp-month-btn {
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

  .dp-month-btn:hover {
    background: var(--canvas-soft-2);
  }

  .dp-month-btn:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .dp-month-chevron {
    color: var(--mute);
    flex-shrink: 0;
  }

  /* ── Month / Year picker grids ── */
  .dp-pick-grid {
    display: grid;
    gap: 4px;
    margin-bottom: 2px;
  }

  .dp-pick-grid--months {
    grid-template-columns: repeat(3, 1fr);
  }

  .dp-pick-grid--years {
    grid-template-columns: repeat(4, 1fr);
    max-height: 220px;
    overflow-y: auto;
  }

  .dp-pick-cell {
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

  .dp-pick-cell:hover {
    background: var(--canvas-soft-2);
  }

  .dp-pick-cell:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .dp-pick-cell.is-active {
    background: var(--ink);
    color: var(--on-primary, #fff);
    font-weight: 500;
  }

  /* ── Footer ── */
  .dp-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
  }

  .dp-footer-btn {
    background: none;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    color: var(--body);
    cursor: pointer;
    transition: background 100ms, border-color 100ms;
  }

  .dp-footer-btn:hover {
    background: var(--canvas-soft-2);
    border-color: var(--hairline-strong);
  }

  .dp-footer-btn:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .dp-footer-clear {
    color: var(--mute);
  }

</style>
