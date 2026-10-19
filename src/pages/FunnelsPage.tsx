import { useMemo, useState } from 'react';
import { BarChart3, TrendingDown } from 'lucide-react';
import Badge from '../components/ui/Badge';
import { DEFAULT_PIPELINES } from '../data/pipelineDefaults';
import { useApp } from '../store/AppContext';

export default function FunnelsPage() {
  const { pipelines, pipelineStages, stageHistory } = useApp();
  const [pipelineId, setPipelineId] = useState(pipelines.find((pipeline) => pipeline.isActive)?.id ?? DEFAULT_PIPELINES[0].id);
  const stages = useMemo(
    () => pipelineStages
      .filter((stage) => stage.pipelineId === pipelineId && stage.name !== 'Closed-Lost')
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
  const lostStage = pipelineStages.find((stage) => stage.pipelineId === pipelineId && stage.name === 'Closed-Lost');
  const lostCount = lostStage
    ? new Set(stageHistory.filter((entry) => entry.toStageId === lostStage.id).map((entry) => entry.dealId)).size
    : 0;
  const totalTracked = new Set(stageHistory.filter((entry) => stages.some((stage) => stage.id === entry.toStageId)).map((entry) => entry.dealId)).size;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Pipeline Funnels</h2>
          <p className="text-sm text-muted mt-1">Stage entries and conversion rates calculated from deal stage history.</p>
        </div>
        <select className="input w-auto min-w-64" value={pipelineId} onChange={(event) => setPipelineId(event.target.value)} aria-label="Select pipeline">
          {pipelines.filter((pipeline) => pipeline.isActive).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Deals tracked in funnel" value={totalTracked} icon={<BarChart3 size={16} className="text-brand-400" />} />
        <Metric label="Closed won" value={stageStats[stageStats.length - 1]?.entered ?? 0} icon={<Badge variant="win">Won</Badge>} />
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
          <p className="mt-5 text-xs text-muted">Conversion rates count distinct deals with an audit entry in both consecutive stages. Older seeded deals are not included until their movements are tracked.</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="glass flex items-center justify-between rounded-2xl p-4">
      <div><div className="text-xs uppercase tracking-wider text-muted">{label}</div><div className="mt-1 text-2xl font-bold text-white">{value}</div></div>
      {icon}
    </div>
  );
}
