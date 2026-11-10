import { useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingDown } from 'lucide-react';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import { useApp } from '../store/AppContext';
import { isLostPipelineStage } from '../utils/stageSla';
import { resolveLeadStageSlaDays } from '../utils/leadStageSla';
import { buildLeadStageHistoryRecords } from '../utils/leadLifecycle';
import { summarizeStageVisits, type StageVisit } from '../utils/stageDuration';

function durationLabel(days?: number) {
  return days === undefined ? '—' : `${days.toFixed(1)} d`;
}

function isLostStage(stage: Parameters<typeof isLostPipelineStage>[0]) {
  const isLost = isLostPipelineStage(stage);
  const normalized = (typeof stage === 'string' ? stage : stage.name).toLowerCase();
  return isLost && !(normalized.includes('policy bound') && normalized.includes('lost'));
}

function isCombinedDispositionStage(stage: Parameters<typeof isLostPipelineStage>[0]) {
  if (typeof stage !== 'string'
    && (stage.isClosedWon !== undefined || stage.isClosedLost !== undefined)) {
    return stage.isClosedWon === true && stage.isClosedLost === true;
  }
  const normalized = (typeof stage === 'string' ? stage : stage.name).toLowerCase();
  return normalized.includes('policy bound') && normalized.includes('lost');
}

export default function FunnelsPage() {
  const { pipelines, pipelineStages, stageHistory, deals, leads, company } = useApp();
  const [pipelineId, setPipelineId] = useState(pipelines.find((pipeline) => pipeline.isActive)?.id ?? '');
  useEffect(() => {
    if (!pipelines.some((pipeline) => pipeline.id === pipelineId && pipeline.isActive)) {
      setPipelineId(pipelines.find((pipeline) => pipeline.isActive)?.id ?? '');
    }
  }, [pipelines, pipelineId]);
  const stages = useMemo(
    () => pipelineStages
      .filter((stage) => stage.pipelineId === pipelineId && !isLostStage(stage) && stage.winProbabilityPct > 0)
      .sort((a, b) => a.stageOrder - b.stageOrder),
    [pipelineStages, pipelineId],
  );
  const stageStats = stages.map((stage, index) => {
    const enteredDeals = new Set(stageHistory.filter((entry) => entry.toStageId === stage.id).map((entry) => entry.dealId));
    const previousStage = stages[index - 1];
    const previousEntries = previousStage
      ? stageHistory.filter((entry) => entry.toStageId === previousStage.id)
      : [];
    const previousDeals = new Set(previousEntries.map((entry) => entry.dealId));
    const convertedDeals = new Set(previousEntries
      .filter((previousEntry) => stageHistory.some((entry) =>
        entry.dealId === previousEntry.dealId
        && entry.toStageId === stage.id
        && entry.enteredAt >= previousEntry.enteredAt
      ))
      .map((entry) => entry.dealId));
    return {
      stage,
      entered: enteredDeals.size,
      conversionPct: index === 0
        ? null
        : previousDeals.size === 0 ? 0 : Math.round(convertedDeals.size / previousDeals.size * 100),
    };
  });
  const maxCount = Math.max(1, ...stageStats.map((item) => item.entered));
  const lostStages = pipelineStages.filter((stage) => stage.pipelineId === pipelineId && isLostStage(stage));
  const combinedStage = pipelineStages.find((stage) => stage.pipelineId === pipelineId && isCombinedDispositionStage(stage));
  const lostCount = new Set([
    ...stageHistory
      .filter((entry) => lostStages.some((stage) => stage.id === entry.toStageId))
      .map((entry) => entry.dealId),
    ...stageHistory
      .filter((entry) => entry.toStageId === combinedStage?.id && entry.outcome === 'lost')
      .map((entry) => entry.dealId),
  ]).size;
  const wonStage = stages.find((stage) => stage.winProbabilityPct === 100)
    ?? stages[stages.length - 1];
  const wonCount = wonStage
    ? new Set(stageHistory
      .filter((entry) => entry.toStageId === wonStage.id && (!combinedStage || wonStage.id !== combinedStage.id || entry.outcome === 'won'))
      .map((entry) => entry.dealId)).size
    : 0;
  const totalTracked = new Set(stageHistory.filter((entry) => stages.some((stage) => stage.id === entry.toStageId)).map((entry) => entry.dealId)).size;
  const dealStageVisits: StageVisit[] = deals
    .filter((deal) => deal.pipelineId === pipelineId)
    .flatMap((deal) => {
      const history = stageHistory
        .filter((entry) => entry.dealId === deal.id && entry.fromStageId !== entry.toStageId)
        .sort((left, right) => Date.parse(left.enteredAt) - Date.parse(right.enteredAt));
      const visits: StageVisit[] = history.flatMap((entry) => {
        const stage = pipelineStages.find((candidate) => candidate.id === entry.toStageId);
        return stage ? [{
          recordId: deal.id,
          stageName: stage.name,
          enteredAt: entry.enteredAt,
          exitedAt: entry.exitedAt,
          targetDays: stage.stagnationDaysThreshold,
        }] : [];
      });
      if (!history.some((entry) => !entry.exitedAt && pipelineStages.find((stage) => stage.id === entry.toStageId)?.name === deal.stage)) {
        const currentStage = pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage);
        const enteredAt = deal.stageChangedAt ?? deal.createdAt;
        if (currentStage && enteredAt) visits.push({
          recordId: deal.id,
          stageName: currentStage.name,
          enteredAt,
          targetDays: currentStage.stagnationDaysThreshold,
        });
      }
      return visits;
    });
  const dealDurationSummary = summarizeStageVisits(dealStageVisits);
  const leadStageVisits: StageVisit[] = leads.flatMap((lead) => buildLeadStageHistoryRecords([lead]).map((record) => {
    const stage = record.stage;
    const resolvedSla = resolveLeadStageSlaDays(company.leadStageSlaDays);
    return {
      recordId: lead.id,
      stageName: stage,
      enteredAt: record.entered_at,
      exitedAt: record.exited_at,
      targetDays: resolvedSla[stage as keyof typeof resolvedSla],
    };
  }));
  const leadDurationSummary = summarizeStageVisits(leadStageVisits);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <PageToolbar name="funnels">
        <select className="input !w-auto min-w-64 !py-1.5 !text-xs" value={pipelineId} onChange={(event) => setPipelineId(event.target.value)} aria-label="Select pipeline">
          {pipelines.filter((pipeline) => pipeline.isActive).length === 0 && <option value="">No active pipelines</option>}
          {pipelines.filter((pipeline) => pipeline.isActive).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </select>
      </PageToolbar>

      <div data-page-content="funnels" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Deals tracked in funnel" value={totalTracked} icon={<BarChart3 size={16} className="text-brand-400" />} />
        <Metric label="Closed won" value={wonCount} icon={<Badge variant="win">Won</Badge>} />
        <Metric label="Closed lost" value={lostCount} icon={<TrendingDown size={16} className="text-hot" />} />
      </div>

      {totalTracked === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <BarChart3 size={28} className="mx-auto text-brand-400" />
          <h3 className="mt-3 font-semibold text-white">No stage history yet</h3>
          <p className="mt-1 text-sm text-muted">Move deals across stages in Pipelines to build conversion analytics.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl p-5">
          <div className="space-y-4">
            {stageStats.map((item, index) => {
              const width = Math.max(12, item.entered / maxCount * 100);
              return (
                <div key={item.stage.id}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-white">{index + 1}. {item.stage.name}</span>
                    <span className="text-muted">{item.entered} entered{item.conversionPct !== null ? ` · ${item.conversionPct}% from previous stage` : ''}</span>
                  </div>
                  <div className="h-12 w-full overflow-hidden rounded-lg bg-ink-900">
                    <div
                      className="flex h-full items-center justify-center rounded-lg bg-gradient-to-r from-brand-600 to-brand-400 text-sm font-semibold text-white transition-all"
                      style={{ width: `${width}%`, clipPath: 'polygon(0 0, 100% 0, 94% 100%, 6% 100%)' }}
                    >
                      {item.entered}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-xs text-muted">Conversion rates count distinct deals with an audit entry in both consecutive stages.</p>
        </div>
      )}
      <section className="glass space-y-4 rounded-2xl p-5">
        <div>
          <h3 className="font-semibold text-white">Stage duration analytics</h3>
          <p className="mt-1 text-xs text-muted">Average and median time in each stage and between consecutive stages.</p>
        </div>
        <DurationTable title="Selected deal pipeline" summary={dealDurationSummary} />
        <div className="border-t border-ink-700 pt-4">
          <DurationTable title="Lead funnel" summary={leadDurationSummary} />
        </div>
      </section>
    </div>
  );
}

function DurationTable({ title, summary }: {
  title: string;
  summary: ReturnType<typeof summarizeStageVisits>;
}) {
  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-medium text-white">{title}</h4>
      <Badge variant={summary.stagnantCount ? 'hot' : 'muted'}>{summary.stagnantCount} stagnating</Badge>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs" aria-label={`${title} duration metrics`}>
        <thead className="text-muted"><tr><th className="pb-2 pr-3 font-medium">Stage / transition</th><th className="pb-2 pr-3 font-medium">Records</th><th className="pb-2 pr-3 font-medium">Average</th><th className="pb-2 font-medium">Median</th></tr></thead>
        <tbody>
          {summary.stages.map((stage) => <tr key={`stage-${stage.stageName}`} className="border-t border-ink-700/70">
            <td className="py-2 pr-3 text-white">{stage.stageName}{stage.stagnantCount > 0 && <span className="ml-2 text-hot">{stage.stagnantCount} overdue</span>}</td>
            <td className="py-2 pr-3 text-muted">{stage.sampleCount}</td>
            <td className="py-2 pr-3 text-muted">{durationLabel(stage.averageDays)}</td>
            <td className="py-2 text-muted">{durationLabel(stage.medianDays)}</td>
          </tr>)}
          {summary.transitions.map((transition) => <tr key={`transition-${transition.fromStage}-${transition.toStage}`} className="border-t border-ink-700/70">
            <td className="py-2 pr-3 text-muted">{transition.fromStage} → {transition.toStage}</td>
            <td className="py-2 pr-3 text-muted">{transition.sampleCount}</td>
            <td className="py-2 pr-3 text-muted">{durationLabel(transition.averageDays)}</td>
            <td className="py-2 text-muted">{durationLabel(transition.medianDays)}</td>
          </tr>)}
          {!summary.stages.length && <tr><td colSpan={4} className="py-4 text-center text-muted">No stage history available.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="glass flex items-center justify-between rounded-2xl p-4">
      <div><div className="text-xs tracking-wider text-muted">{label}</div><div className="mt-1 text-2xl font-bold text-white">{value}</div></div>
      {icon}
    </div>
  );
}
