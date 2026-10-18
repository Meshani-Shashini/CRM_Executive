import type { ReactNode } from 'react';

type Variant = 'hot' | 'warm' | 'cold' | 'win' | 'muted' | 'brand';

const map: Record<Variant, string> = {
  hot: 'bg-hot/15 text-hot border-hot/30',
  warm: 'bg-warm/15 text-warm border-warm/30',
  cold: 'bg-cold/15 text-cold border-cold/30',
  win: 'bg-win/15 text-win border-win/30',
  muted: 'bg-ink-700/60 text-muted border-ink-600',
  brand: 'bg-brand-400/15 text-brand-400 border-brand-400/30',
};

export default function Badge({
  variant = 'muted',
  children,
  dot,
}: {
  variant?: Variant;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill border ${map[variant]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
