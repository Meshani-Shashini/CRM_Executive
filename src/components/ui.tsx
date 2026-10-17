import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  icon?: ReactNode;
  accent?: 'indigo' | 'emerald' | 'amber' | 'crimson';
  children?: ReactNode;
}

const accentMap = {
  indigo: 'text-accent-indigo bg-accent-indigo/10',
  emerald: 'text-accent-emerald bg-accent-emerald/10',
  amber: 'text-accent-amber bg-accent-amber/10',
  crimson: 'text-accent-crimson bg-accent-crimson/10',
};

export function StatCard({ label, value, delta, deltaPositive, icon, accent = 'indigo', children }: StatCardProps) {
  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</p>
        {icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl font-semibold text-slate-100 tracking-tight">{value}</p>
      <div className="flex items-center justify-between mt-2">
        {delta && (
          <span
            className={`text-[11px] font-medium ${
              deltaPositive ? 'text-accent-emerald' : 'text-accent-crimson'
            }`}
          >
            {deltaPositive ? '▲' : '▼'} {delta}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100 tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  tone?: 'indigo' | 'emerald' | 'amber' | 'crimson' | 'neutral';
  size?: 'xs' | 'sm';
}

const badgeTone = {
  indigo: 'bg-accent-indigo/15 text-indigo-300 border-accent-indigo/30',
  emerald: 'bg-accent-emerald/15 text-emerald-300 border-accent-emerald/30',
  amber: 'bg-accent-amber/15 text-amber-300 border-accent-amber/30',
  crimson: 'bg-accent-crimson/15 text-rose-300 border-accent-crimson/30',
  neutral: 'bg-base-raised/50 text-slate-400 border-base-border/60',
};

export function Badge({ children, tone = 'neutral', size = 'xs' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${badgeTone[tone]} ${
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
      }`}
    >
      {children}
    </span>
  );
}

interface MomentumRingProps {
  score: number;
  size?: number;
}

export function MomentumRing({ score, size = 36 }: MomentumRingProps) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(36,48,73,0.6)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold"
        style={{ color, fontSize: size * 0.28 }}
      >
        {score}
      </span>
    </div>
  );
}
