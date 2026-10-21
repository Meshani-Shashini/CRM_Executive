export function dashboardHref(route: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `#/${route}${query ? `?${query}` : ''}`;
}

export function hashParams(): URLSearchParams {
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}
