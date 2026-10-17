const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  MVR: 'Rf',
  SGD: 'S$',
};

export function formatCurrency(value: number, currency: string, compact = false): string {
  const symbol = currencySymbols[currency] ?? '';
  if (compact) {
    if (Math.abs(value) >= 1_000_000)
      return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000)
      return `${symbol}${(value / 1_000).toFixed(1)}K`;
    return `${symbol}${value.toLocaleString()}`;
  }
  return `${symbol}${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function momentumColor(score: number): string {
  if (score >= 80) return 'text-accent-emerald';
  if (score >= 60) return 'text-accent-amber';
  return 'text-accent-crimson';
}

export function momentumBg(score: number): string {
  if (score >= 80) return 'bg-accent-emerald';
  if (score >= 60) return 'bg-accent-amber';
  return 'bg-accent-crimson';
}

export function severityColor(s: 'critical' | 'warning' | 'info'): string {
  if (s === 'critical') return 'text-accent-crimson';
  if (s === 'warning') return 'text-accent-amber';
  return 'text-accent-indigo';
}

export function severityBorder(s: 'critical' | 'warning' | 'info'): string {
  if (s === 'critical') return 'border-accent-crimson/40';
  if (s === 'warning') return 'border-accent-amber/40';
  return 'border-accent-indigo/40';
}

export function severityBg(s: 'critical' | 'warning' | 'info'): string {
  if (s === 'critical') return 'bg-accent-crimson/10';
  if (s === 'warning') return 'bg-accent-amber/10';
  return 'bg-accent-indigo/10';
}
