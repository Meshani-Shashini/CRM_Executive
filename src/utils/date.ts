const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeDateInput(value: string): string {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const displayMatch = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (displayMatch) {
    day = Number(displayMatch[1]);
    month = MONTHS.findIndex((item) => item.toLowerCase() === displayMatch[2].toLowerCase()) + 1;
    year = Number(displayMatch[3]);
  } else {
    return '';
  }

  const date = new Date(year, month - 1, day);
  if (month < 1 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Formats a stored date or timestamp for display as DD-MMM-YYYY. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '';

  const date = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
      : new Date(value);

  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
}

/** Formats an ISO date for editable date fields as DD-MMM-YYYY. */
export function formatDateInput(value?: string | null): string {
  return formatDate(value);
}

/** Converts a DD-MMM-YYYY entry into the ISO date format used by forms and storage. */
export function parseDateInput(value: string): string {
  const match = value.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return '';
  const month = MONTHS.findIndex((item) => item.toLowerCase() === match[2].toLowerCase());
  if (month < 0) return '';
  const date = new Date(Number(match[3]), month, Number(match[1]));
  if (date.getFullYear() !== Number(match[3]) || date.getMonth() !== month || date.getDate() !== Number(match[1])) return '';
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1]}`;
}
