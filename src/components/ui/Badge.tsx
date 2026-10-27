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
