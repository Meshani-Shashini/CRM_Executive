import { useMemo } from 'react';
import type { Deal, PipelineStage, StageHistoryAudit } from '../../types';
import { summarizeClosedDealsForLastSixMonths } from '../../utils/monthlyDealSummary';

interface MonthlyWonLostChartProps {
  deals: Deal[];
  pipelineStages: PipelineStage[];
  stageHistory: StageHistoryAudit[];
}

export default function MonthlyWonLostChart({
  deals,
  pipelineStages,
  stageHistory,
}: MonthlyWonLostChartProps) {
  const months = useMemo(
    () => summarizeClosedDealsForLastSixMonths(deals, pipelineStages, stageHistory),
    [deals, pipelineStages, stageHistory],
  );
  const maxCount = Math.max(1, ...months.flatMap(({ won, lost }) => [won, lost]));

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="monthly-won-lost-title">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="monthly-won-lost-title" className="font-semibold text-white">Won and lost</h3>
          <p className="mt-1 text-xs text-muted">Deals closed over the last 6 months</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted" aria-label="Deal outcome legend">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Won</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-500" />Lost</span>
        </div>
      </header>
      <div className="grid grid-cols-6 gap-2" role="img" aria-label="Monthly won and lost deal counts for the last six months">
        {months.map((month) => (
          <div key={month.key} className="flex min-w-0 flex-col items-center">
            <div className="flex h-32 w-full items-end justify-center gap-1 border-b border-ink-700/60 px-1">
              {(['won', 'lost'] as const).map((outcome) => (
                <div key={outcome} className="flex h-full w-4 flex-col items-center justify-end">
                  <span className="h-3 text-[10px] text-muted">{month[outcome]}</span>
                  <div
                    className={`w-2 rounded-t-sm ${outcome === 'won' ? 'bg-emerald-400' : 'bg-ink-500'}`}
                    style={{ height: month[outcome] ? `${Math.max(4, month[outcome] / maxCount * 76)}%` : '0%' }}
                  />
                </div>
              ))}
            </div>
            <span className="mt-2 text-[10px] text-muted">{month.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
