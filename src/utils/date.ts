const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a stored date or timestamp for display as DD/MMM/YYYY. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '';

  const date = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
      : new Date(value);

  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${MONTHS[date.getMonth()]}/${date.getFullYear()}`;
}
