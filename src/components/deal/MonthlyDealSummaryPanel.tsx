import { useMemo, useState } from 'react';
import type { Client, Deal, Lead, PipelineStage, StageHistoryAudit } from '../../types';
import { formatAmount } from '../../utils/currency';
import {
  isValidDealCloseDate,
  summarizeDealsByPeriod,
  type DealSummaryFilter,
  type DealSummaryPeriod,
} from '../../utils/monthlyDealSummary';

interface MonthlyDealSummaryPanelProps {
  deals: Deal[];
  pipelineStages: PipelineStage[];
  leads: Lead[];
  clients: Client[];
  stageHistory: StageHistoryAudit[];
  title?: string;
  period?: DealSummaryPeriod;
  pipelineId?: string;
}

const filters: DealSummaryFilter[] = ['won', 'open', 'all'];

export default function MonthlyDealSummaryPanel({
  deals,
  pipelineStages,
  leads,
  clients,
  stageHistory,
  title = 'Monthly deal summary',
  period = 'month',
  pipelineId,
}: MonthlyDealSummaryPanelProps) {
  const [filter, setFilter] = useState<DealSummaryFilter>('all');
  const scopedDeals = useMemo(
    () => pipelineId ? deals.filter((deal) => deal.pipelineId === pipelineId) : deals,
    [deals, pipelineId],
  );
  const summaries = useMemo(() => summarizeDealsByPeriod(
    scopedDeals,
    pipelineStages,
    { leads, clients, stageHistory },
    period,
  ), [scopedDeals, pipelineStages, leads, clients, stageHistory, period]);
  const unassignedDeals = scopedDeals.filter((deal) => !isValidDealCloseDate(deal.closeDate));

  return (
    <section className="glass rounded-2xl p-5" aria-label={title}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-white">{title}</h3>
        <div className="inline-flex rounded-lg border border-ink-600 bg-ink-900/50 p-1" role="group" aria-label="Deal outcome filter">
          {filters.map((option) => (
            <button key={option} type="button" aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={`rounded-md px-3 py-1 text-xs capitalize ${filter === option ? 'bg-ink-700 text-white' : 'text-muted'}`}>
              {option}
            </button>
          ))}
        </div>
      </header>
      {unassignedDeals.length > 0 && <details className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
        <summary>{unassignedDeals.length} deal{unassignedDeals.length === 1 ? '' : 's'} cannot be grouped because the expected close date is missing or invalid.</summary>
        <ul className="mt-2 list-inside list-disc">{unassignedDeals.map((deal) => <li key={deal.id}>{deal.id}: expected close date is required and must be valid.</li>)}</ul>
      </details>}
      {summaries.length === 0 ? <p className="text-sm text-muted">No deals with an expected close date.</p> : (
        <div className="space-y-3">
          {summaries.map((summary) => {
            const showWon = filter !== 'open';
            const showOpen = filter !== 'won';
            const showLost = filter === 'all';
            return (
              <article key={summary.key} className="rounded-xl border border-ink-700 bg-ink-900/40 p-3">
                <h4 className="mb-2 text-sm font-semibold text-white">{summary.label}</h4>
                <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  {showWon && <div className="rounded-lg bg-ink-800/70 p-2">
                    <div className="text-emerald-300">Won · closed value</div>
                    <div className="mt-1 font-semibold text-white">{formatAmount(summary.wonValueMvr, 'MVR')}</div>
                    <div className="text-muted">{summary.won.length} deal{summary.won.length === 1 ? '' : 's'}</div>
                  </div>}
                  {showOpen && <div className="rounded-lg bg-ink-800/70 p-2">
                    <div className="text-brand-300">Open · total value</div>
                    <div className="mt-1 font-semibold text-white">{formatAmount(summary.openValueMvr, 'MVR')}</div>
                    <div className="text-muted">Weighted {formatAmount(summary.openWeightedValueMvr, 'MVR')}</div>
                  </div>}
                  {showLost && <div className="rounded-lg bg-ink-800/70 p-2">
                    <div className="text-hot">Lost · closed value</div>
                    <div className="mt-1 font-semibold text-white">{formatAmount(summary.lostValueMvr, 'MVR')}</div>
                    <div className="text-muted">{summary.lost.length} deal{summary.lost.length === 1 ? '' : 's'}</div>
                  </div>}
                </div>
                {showOpen && summary.open.length > 0 && <ul className="mt-3 space-y-1.5">
                  {summary.open.map((stage) => (
                    <li key={stage.stageName} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted">{stage.stageName} · {stage.count}</span>
                      <span className="text-white">{formatAmount(stage.valueMvr, 'MVR')} <span className="text-brand-300">({formatAmount(stage.weightedValueMvr, 'MVR')} weighted)</span></span>
                    </li>
                  ))}
                </ul>}
                {summary.validationIssues.length > 0 && <details className="mt-3 text-xs text-amber-200">
                  <summary>{summary.validationIssues.length} invalid deal{summary.validationIssues.length === 1 ? '' : 's'} excluded from totals.</summary>
                  <ul className="mt-1 list-inside list-disc">{summary.validationIssues.map((issue) => <li key={issue.dealId}>{issue.dealId}: {issue.errors.join(' ')}</li>)}</ul>
                </details>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
