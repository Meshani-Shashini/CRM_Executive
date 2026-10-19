export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const contents = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
