export function printDocument(className: string) {
  document.body.classList.add(className);
  const cleanup = () => document.body.classList.remove(className);
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 30000);
}
