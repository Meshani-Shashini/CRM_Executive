import type { ReactNode } from 'react';

type Variant = 'hot' | 'warm' | 'cold' | 'win' | 'todo' | 'in-progress' | 'backlog' | 'muted' | 'brand';

const map: Record<Variant, string> = {
  hot: 'bg-[#2E1111] text-[#E54848] border-[#4A2020]',
  warm: 'bg-[#2C1E0D] text-[#E09228] border-[#4A3217]',
  cold: 'bg-[#121E36] text-[#5B8DEF] border-[#25375B]',
  win: 'bg-[#0D2B1D] text-[#27C272] border-[#1B5137]',
  todo: 'bg-[#0D2B1D] text-[#27C272] border-[#1B5137]',
  'in-progress': 'bg-[#101C39] text-[#5B8DEF] border-[#25375B]',
  backlog: 'bg-[#2E1111] text-[#E54848] border-[#4A2020]',
  muted: 'bg-ink-700/60 text-muted border-ink-600',
  brand: 'bg-brand-400/15 text-brand-400 border-brand-400/30',
};

const subtleMap: Record<Variant, string> = {
  hot: 'bg-red-500/10 text-red-300',
  warm: 'bg-orange-500/10 text-orange-300',
  cold: 'bg-blue-500/10 text-blue-300',
  win: 'bg-emerald-500/10 text-emerald-300',
  todo: 'bg-emerald-500/10 text-emerald-300',
  'in-progress': 'bg-blue-500/10 text-blue-300',
  backlog: 'bg-red-500/10 text-red-300',
  muted: 'bg-ink-700/40 text-muted',
  brand: 'bg-brand-400/10 text-brand-300',
};

export default function Badge({
  variant = 'muted',
  children,
  dot,
  compact = false,
  subtle = false,
}: {
  variant?: Variant;
  children: ReactNode;
  dot?: boolean;
  compact?: boolean;
  subtle?: boolean;
}) {
  const classes = subtle
    ? 'inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-[9px] font-medium leading-none tracking-wide'
    : `pill border ${compact ? 'pill-compact' : ''}`;

  return (
    <span className={`${classes} ${subtle ? subtleMap[variant] : map[variant]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
