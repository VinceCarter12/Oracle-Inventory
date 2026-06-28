// ─── Pure date utility functions (no external dependencies) ─────────────────

export const MONTH_NAMES: string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DAY_HEADERS: string[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Returns 'YYYY-MM-DD' from a local Date. */
export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses 'YYYY-MM-DD' as a local date (avoids UTC offset shift). */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Adds n days to date, returns new Date. */
export function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/** Adds n months to date, returns new Date (clamped to end of month). */
export function addMonths(date: Date, n: number): Date {
  const result = new Date(date);
  const targetMonth = result.getMonth() + n;
  result.setMonth(targetMonth);
  return result;
}

/** Returns a new Date set to the first day of the month. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Returns a new Date set to the last day of the month. */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Returns true if two dates represent the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

/** Returns true if date a is strictly before date b (by calendar day). */
export function isBefore(a: Date, b: Date): boolean {
  return toISO(a) < toISO(b);
}

/** Returns true if date a is strictly after date b (by calendar day). */
export function isAfter(a: Date, b: Date): boolean {
  return toISO(a) > toISO(b);
}

/** Clamps date to [min, max]. Either bound may be omitted. */
export function clamp(date: Date, min?: Date, max?: Date): Date {
  if (min && isBefore(date, min)) return new Date(min);
  if (max && isAfter(date, max)) return new Date(max);
  return date;
}

export interface CalendarCell {
  date: Date;
  currentMonth: boolean;
}

/**
 * Returns a 6×7 (42 cell) Monday-first calendar grid for the given year/month.
 * month is 0-indexed (0 = January).
 */
export function getCalendarGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  // getDay() → 0=Sun … 6=Sat; convert to Mon=0 … Sun=6
  const startOffset = (firstOfMonth.getDay() + 6) % 7;

  const cells: CalendarCell[] = [];

  // Trailing days from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month, -i), currentMonth: false });
  }

  // Days of the current month
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ date: new Date(year, month, d), currentMonth: true });
  }

  // Leading days from next month to fill up to 42 cells
  let next = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, next++), currentMonth: false });
  }

  return cells;
}

/** Formats an ISO date string as 'Month D, YYYY' for aria-labels. */
export function formatAriaLabel(iso: string): string {
  const d = fromISO(iso);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Formats an ISO date string as 'MM/DD/YYYY' for display. */
export function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
