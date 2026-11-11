import type { ReactNode } from 'react';

export interface DashboardChartItem {
  key?: string;
  label: string;
  value: number;
  color: string;
}

export function DashboardChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass min-w-0 rounded-2xl p-4" aria-label={title}>
      <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

export function DashboardBarChart({
  items,
  valueLabel = (value) => String(value),
}: {
  items: DashboardChartItem[];
  valueLabel?: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  const tickValues = [...new Set([maxValue, Math.round(maxValue / 2), 0])];

  return (
    <div className="relative h-40 pl-7 pt-1" role="img"
      aria-label={items.map((item) => `${item.label}: ${valueLabel(item.value)}`).join(', ')}>
      <div className="absolute inset-y-1 left-7 right-0 flex flex-col justify-between" aria-hidden="true">
        {tickValues.map((value, index) => (
          <div key={`${value}-${index}`} className="relative border-t border-ink-700/60">
            <span className="absolute -left-7 -top-1.5 w-6 text-right text-[9px] text-muted">
              {valueLabel(value)}
            </span>
          </div>
        ))}
      </div>
      <div className="relative z-10 flex h-full items-stretch justify-around gap-1 border-b border-ink-700/60">
        {items.map((item) => {
          const height = item.value > 0 ? Math.max(3, item.value / maxValue * 82) : 0;
          return (
            <div key={item.key ?? item.label} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex min-h-0 flex-1 flex-col items-center justify-end">
                <span className="mb-1 max-w-full truncate text-[9px] text-muted" title={valueLabel(item.value)}>
                  {valueLabel(item.value)}
                </span>
                <div className="w-2.5 rounded-t-sm" style={{ height: `${height}%`, backgroundColor: item.color }} />
              </div>
              <span className="mt-1 w-full truncate text-center text-[9px] text-muted" title={item.label}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardDonutChart({
  items,
  centerValue,
  centerLabel,
  valueLabel = (value, total) => `${total ? Math.round(value / total * 100) : 0}%`,
}: {
  items: DashboardChartItem[];
  centerValue: string;
  centerLabel: string;
  valueLabel?: (value: number, total: number) => string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let start = 0;
  const gradient = total
    ? items.map((item) => {
      const end = start + item.value / total * 100;
      const segment = `${item.color} ${start}% ${end}%`;
      start = end;
      return segment;
    }).join(', ')
    : '#2A2E35 0% 100%';

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative h-28 w-28 shrink-0 rounded-full p-2" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-ink-950 text-center">
          <span className="max-w-full truncate px-1 text-xs font-semibold text-white">{centerValue}</span>
          <span className="text-[9px] text-muted">{centerLabel}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {items.length === 0 ? <p className="text-xs text-muted">No records yet.</p> : items.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center gap-2 text-[10px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1 truncate text-white" title={item.label}>{item.label}</span>
            <span className="shrink-0 text-muted">{valueLabel(item.value, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardEmptyChart({ children }: { children: ReactNode }) {
  return <div className="flex h-40 items-center justify-center px-4 text-center text-xs text-muted">{children}</div>;
}
