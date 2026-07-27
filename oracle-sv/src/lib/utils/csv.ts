// CSV export helpers — client-side, no dependencies

function escapeCell(v: unknown): string {
	const s = String(v ?? '');
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from column definitions + row objects. */
export function toCsv(
	columns: { key: string; label: string }[],
	rows: Record<string, unknown>[]
): string {
	const header = columns.map((c) => escapeCell(c.label)).join(',');
	const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(','));
	return [header, ...body].join('\r\n');
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(csv: string, filename: string): void {
	const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
