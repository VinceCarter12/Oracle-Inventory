<script lang="ts">
  import {
    getCalendarGrid,
    toISO,
    fromISO,
    isSameDay,
    isBefore,
    isAfter,
    DAY_HEADERS,
    MONTH_NAMES,
    formatAriaLabel,
  } from '$lib/utils/dates';

  interface Props {
    year: number;
    month: number;
    selected?: string;
    rangeFrom?: string;
    rangeTo?: string;
    hoverDate?: string;
    minDate?: string;
    maxDate?: string;
    disabledDates?: string[];
    onSelectDay: (iso: string) => void;
    onHoverDay?: (iso: string | null) => void;
    onNavigate?: (year: number, month: number) => void;
    onEscape?: () => void;
  }

  let {
    year,
    month,
    selected,
    rangeFrom,
    rangeTo,
    hoverDate,
    minDate,
    maxDate,
    disabledDates = [],
    onSelectDay,
    onHoverDay,
    onNavigate,
    onEscape,
  }: Props = $props();

  // ── Grid cells ──────────────────────────────────────────────────────────────
  const cells = $derived(getCalendarGrid(year, month));
  const rows = $derived(
    Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  );

  // ── Roving tabindex: track focused ISO ──────────────────────────────────────
  let focusedISO = $state<string | null>(null);

  // When month navigates, reset focus to first current-month day
  $effect(() => {
    // dependency on year/month
    const _ = year * 100 + month;
    focusedISO = null;
  });

  // ── State helpers ──────────────────────────────────────────────────────────
  function isDisabled(date: Date): boolean {
    const iso = toISO(date);
    if (minDate && iso < minDate) return true;
    if (maxDate && iso > maxDate) return true;
    if (disabledDates.includes(iso)) return true;
    return false;
  }

  function isSelected(date: Date): boolean {
    const iso = toISO(date);
    if (selected && iso === selected) return true;
    if (rangeFrom && iso === rangeFrom) return true;
    if (rangeTo   && iso === rangeTo)   return true;
    return false;
  }

  function isRangeStart(date: Date): boolean {
    if (!rangeFrom) return false;
    return toISO(date) === rangeFrom;
  }

  function isRangeEnd(date: Date): boolean {
    if (!rangeTo) return false;
    return toISO(date) === rangeTo;
  }

  function isInRange(date: Date): boolean {
    const iso = toISO(date);

    // Effective end: use rangeTo if available, otherwise hoverDate (preview)
    const effectiveFrom = rangeFrom;
    const effectiveTo   = rangeTo ?? (hoverDate && rangeFrom ? hoverDate : null);

    if (!effectiveFrom || !effectiveTo) return false;

    const lo = effectiveFrom < effectiveTo ? effectiveFrom : effectiveTo;
    const hi = effectiveFrom < effectiveTo ? effectiveTo   : effectiveFrom;

    return iso > lo && iso < hi;
  }

  function isRangeStartEffective(date: Date): boolean {
    const iso = toISO(date);
    const effectiveFrom = rangeFrom;
    const effectiveTo   = rangeTo ?? (hoverDate && rangeFrom ? hoverDate : null);
    if (!effectiveFrom || !effectiveTo) return false;
    const lo = effectiveFrom < effectiveTo ? effectiveFrom : effectiveTo;
    return iso === lo;
  }

  function isRangeEndEffective(date: Date): boolean {
    const iso = toISO(date);
    const effectiveFrom = rangeFrom;
    const effectiveTo   = rangeTo ?? (hoverDate && rangeFrom ? hoverDate : null);
    if (!effectiveFrom || !effectiveTo) return false;
    const hi = effectiveFrom < effectiveTo ? effectiveTo : effectiveFrom;
    return iso === hi;
  }

  function isToday(date: Date): boolean {
    const t = new Date();
    return (
      date.getFullYear() === t.getFullYear() &&
      date.getMonth()    === t.getMonth()    &&
      date.getDate()     === t.getDate()
    );
  }

  // ── Roving tabindex: which day gets tabindex="0" ────────────────────────────
  function shouldFocus(date: Date): boolean {
    const iso = toISO(date);
    if (focusedISO) return iso === focusedISO;
    // Default: selected day, or rangeFrom, or today, or first of month
    if (selected && iso === selected) return true;
    if (rangeFrom && iso === rangeFrom) return true;
    // First current-month day
    const current = cells.filter(c => c.currentMonth);
    if (current.length && isSameDay(date, current[0].date)) return true;
    return false;
  }

  // Ensure exactly one cell has tabindex=0 — pick first current-month day as fallback
  function getTabIndex(date: Date, currentMonth: boolean): number {
    if (!currentMonth) return -1;
    return shouldFocus(date) ? 0 : -1;
  }

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  let gridEl: HTMLDivElement | undefined;

  function focusDay(iso: string) {
    focusedISO = iso;
    // Wait for DOM update then focus the button
    setTimeout(() => {
      const btn = gridEl?.querySelector(`[data-date="${iso}"]`) as HTMLButtonElement | null;
      btn?.focus();
    }, 0);
  }

  function navigateToDay(iso: string) {
    const d = fromISO(iso);
    const targetYear  = d.getFullYear();
    const targetMonth = d.getMonth();
    if (targetYear !== year || targetMonth !== month) {
      onNavigate?.(targetYear, targetMonth);
      // focusDay will fire after re-render via $effect
      setTimeout(() => focusDay(iso), 20);
    } else {
      focusDay(iso);
    }
  }

  function handleGridKeydown(e: KeyboardEvent) {
    if (!focusedISO) return;

    const focused = fromISO(focusedISO);
    let target: Date | null = null;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        target = new Date(focused); target.setDate(focused.getDate() - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        target = new Date(focused); target.setDate(focused.getDate() + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        target = new Date(focused); target.setDate(focused.getDate() - 7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        target = new Date(focused); target.setDate(focused.getDate() + 7);
        break;
      case 'Home':
        e.preventDefault();
        // First day of current week (Mon)
        target = new Date(focused);
        target.setDate(focused.getDate() - ((focused.getDay() + 6) % 7));
        break;
      case 'End':
        e.preventDefault();
        // Last day of current week (Sun)
        target = new Date(focused);
        target.setDate(focused.getDate() + (6 - (focused.getDay() + 6) % 7));
        break;
      case 'PageUp':
        e.preventDefault();
        if (e.altKey) {
          target = new Date(focused); target.setFullYear(focused.getFullYear() - 1);
        } else {
          target = new Date(focused); target.setMonth(focused.getMonth() - 1);
        }
        break;
      case 'PageDown':
        e.preventDefault();
        if (e.altKey) {
          target = new Date(focused); target.setFullYear(focused.getFullYear() + 1);
        } else {
          target = new Date(focused); target.setMonth(focused.getMonth() + 1);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isDisabled(focused)) onSelectDay(focusedISO);
        break;
      case 'Escape':
        e.preventDefault();
        onEscape?.();
        break;
      case 't':
      case 'T':
        e.preventDefault();
        navigateToDay(toISO(new Date()));
        break;
      default:
        return;
    }

    if (target) navigateToDay(toISO(target));
  }

  function handleDayClick(iso: string, date: Date) {
    if (isDisabled(date)) return;
    focusedISO = iso;
    onSelectDay(iso);
  }

  function handleDayMouseEnter(iso: string, date: Date) {
    if (!isDisabled(date)) onHoverDay?.(iso);
  }

  function handleDayFocus(iso: string) {
    focusedISO = iso;
  }

  // ── Live region text ────────────────────────────────────────────────────────
  const liveText = $derived(`${MONTH_NAMES[month]} ${year}`);
</script>

<!-- Accessible live region for month navigation announcements -->
<div aria-live="polite" aria-atomic="true" class="sr-only">{liveText}</div>

<!-- Day-of-week headers -->
<div class="cal-headers" role="row" aria-label="Days of week">
  {#each DAY_HEADERS as dh}
    <div class="cal-header-cell" role="columnheader" aria-label={dh}>{dh}</div>
  {/each}
</div>

<!-- Calendar grid -->
<div
  class="cal-grid"
  role="grid"
  aria-label="{MONTH_NAMES[month]} {year}"
  onkeydown={handleGridKeydown}
  onmouseleave={() => onHoverDay?.(null)}
  bind:this={gridEl}
>
  {#each rows as row, ri}
    <div class="cal-row" role="row">
      {#each row as { date, currentMonth }}
        {@const iso        = toISO(date)}
        {@const disabled   = isDisabled(date)}
        {@const selected_  = isSelected(date)}
        {@const inRange    = isInRange(date)}
        {@const rangeStart = isRangeStartEffective(date)}
        {@const rangeEnd   = isRangeEndEffective(date)}
        {@const today      = isToday(date)}
        <div
          class="cal-cell"
          class:in-range={inRange}
          class:range-start={rangeStart}
          class:range-end={rangeEnd}
          role="gridcell"
        >
          <button
            type="button"
            class="cal-day"
            class:day-selected={selected_}
            class:day-outside={!currentMonth}
            class:day-today={today && !selected_}
            class:day-disabled={disabled}
            data-date={iso}
            tabindex={currentMonth ? (shouldFocus(date) ? 0 : -1) : -1}
            aria-selected={selected_ ? 'true' : 'false'}
            aria-label={formatAriaLabel(iso)}
            aria-disabled={disabled ? 'true' : undefined}
            onclick={() => handleDayClick(iso, date)}
            onmouseenter={() => handleDayMouseEnter(iso, date)}
            onfocus={() => handleDayFocus(iso)}
          >
            {date.getDate()}
          </button>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
  }

  /* ── Day-of-week header row ── */
  .cal-headers {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 4px;
  }

  .cal-header-cell {
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--mute);
    font-family: var(--font-sans);
    padding: 4px 0;
    letter-spacing: 0.04em;
  }

  /* ── Grid ── */
  .cal-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    outline: none;
  }

  .cal-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    position: relative;
  }

  /* ── Cell wrapper (handles range band) ── */
  .cal-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 36px;
  }

  /* Range band: full-width strip between start and end */
  .cal-cell.in-range::before {
    content: '';
    position: absolute;
    inset: 0;
    background: oklch(94% 0.04 264);
    z-index: 0;
  }

  /* Start cell: right half only */
  .cal-cell.range-start::before {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    left: 50%; right: 0;
    background: oklch(94% 0.04 264);
    z-index: 0;
  }

  /* End cell: left half only */
  .cal-cell.range-end::before {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    left: 0; right: 50%;
    background: oklch(94% 0.04 264);
    z-index: 0;
  }

  /* When start === end (single-day range), hide band */
  .cal-cell.range-start.range-end::before {
    display: none;
  }

  /* ── Day button ── */
  .cal-day {
    position: relative;
    z-index: 1;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 400;
    font-family: var(--font-sans);
    color: var(--ink);
    cursor: pointer;
    transition: background 100ms, color 100ms;
    flex-shrink: 0;
  }

  .cal-day:hover:not(.day-selected):not(.day-disabled) {
    background: var(--canvas-soft-2);
  }

  .cal-day:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  /* Outside current month */
  .cal-day.day-outside {
    color: var(--mute);
    opacity: 0.45;
    cursor: default;
    pointer-events: none;
  }

  /* Today indicator dot */
  .cal-day.day-today::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--link);
  }

  /* Selected (single) or range endpoint */
  .cal-day.day-selected {
    background: var(--ink);
    color: var(--on-primary, #fff);
    font-weight: 500;
  }

  .cal-day.day-selected:hover {
    background: oklch(25% 0.006 285);
  }

  /* Disabled */
  .cal-day.day-disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
  }
</style>
