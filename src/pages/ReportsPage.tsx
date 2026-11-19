import { useMemo, useState } from 'react';
import type { PipelineStage } from '../types';
import { useApp } from '../store/AppContext';
import { toMvr } from '../utils/currency';
import { isTerminalDealStage } from '../utils/stageSla';

const reportTabs = ['Funnel', 'Win rate', 'Deal cycle', 'Forecast', 'Leaderboard', 'Lost reasons', 'Competitors', 'CLV'] as const;
type ReportTab = typeof reportTabs[number];

function compactValue(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value).toLowerCase();
}

function isOpenPipelineStage(stage: PipelineStage) {
  return !isTerminalDealStage(stage.name, undefined, stage);
}

export default function ReportsPage() {
  const { deals, pipelines, pipelineStages, dataReady } = useApp();
  const [activeTab, setActiveTab] = useState<ReportTab>('Funnel');
  const activePipelineIds = useMemo(
    () => new Set(pipelines.filter((pipeline) => pipeline.isActive).map((pipeline) => pipeline.id)),
    [pipelines],
  );
  const stages = useMemo(() => {
    const stagesByName = new Map<string, PipelineStage>();
    pipelineStages
      .filter((stage) => activePipelineIds.has(stage.pipelineId) && isOpenPipelineStage(stage))
      .sort((left, right) => left.stageOrder - right.stageOrder)
      .forEach((stage) => {
        if (!stagesByName.has(stage.name)) stagesByName.set(stage.name, stage);
      });
    return [...stagesByName.values()];
  }, [activePipelineIds, pipelineStages]);
  const stageSummaries = useMemo(() => {
    const summaries = new Map(stages.map((stage) => [stage.name, { count: 0, valueMvr: 0 }]));
    const defaultPipelineId = pipelines.find((pipeline) => pipeline.isActive)?.id;

    deals.forEach((deal) => {
      const pipelineId = deal.pipelineId ?? defaultPipelineId;
      if (!pipelineId || !activePipelineIds.has(pipelineId)) return;
      const stage = pipelineStages.find((candidate) =>
        candidate.pipelineId === pipelineId && candidate.name === deal.stage,
      );
      if (!stage || !isOpenPipelineStage(stage) || deal.disposition) return;
      const summary = summaries.get(stage.name);
      if (!summary) return;
      summary.count += 1;
      summary.valueMvr += toMvr(deal.value, deal.currency, deal.exchangeRate);
    });

    const maxValue = Math.max(0, ...[...summaries.values()].map((summary) => summary.valueMvr));
    const maxCount = Math.max(0, ...[...summaries.values()].map((summary) => summary.count));
    return stages.map((stage) => {
      const summary = summaries.get(stage.name) ?? { count: 0, valueMvr: 0 };
      const progress = maxValue > 0
        ? summary.valueMvr / maxValue * 100
        : maxCount > 0 ? summary.count / maxCount * 100 : 0;
      return { stage, ...summary, progress };
    });
  }, [activePipelineIds, deals, pipelineStages, pipelines, stages]);

  return (
    <div className="min-w-0">
      <nav
        role="tablist"
        aria-label="Reports"
        aria-orientation="horizontal"
        className="-mx-1 mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-ink-700 px-1"
      >
        {reportTabs.map((tab) => {
          const selected = activeTab === tab;
          const id = `report-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`;
          return (
            <button
              key={tab}
              id={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="report-panel"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${
                selected
                  ? 'border-brand-400 text-white'
                  : 'border-transparent text-muted hover:text-white'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </nav>

      <section
        id="report-panel"
        role="tabpanel"
        aria-labelledby={`report-tab-${activeTab.toLowerCase().replace(/\s+/g, '-')}`}
        className="min-w-0"
      >
        {activeTab === 'Funnel' ? (
          <div className="max-w-5xl">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-white">Open pipeline by stage</h2>
              <p className="mt-1 text-sm text-muted">Open deal value across active pipelines · values shown in MVR</p>
            </div>

            {!dataReady ? (
              <div role="status" className="py-8 text-sm text-muted">Loading pipeline data…</div>
            ) : stageSummaries.length === 0 ? (
              <div className="py-8 text-sm text-muted">No active pipeline stages available.</div>
            ) : (
              <div className="divide-y divide-ink-700/60">
                {stageSummaries.map(({ stage, count, valueMvr, progress }) => (
                  <div key={stage.id} className="grid grid-cols-1 items-center gap-x-5 gap-y-2 py-3 sm:grid-cols-[minmax(9rem,12rem)_minmax(5rem,1fr)_auto]">
                    <span className="min-w-0 text-sm font-medium text-slate-200">{stage.shortLabel || stage.name}</span>
                    <div
                      role="progressbar"
                      aria-label={`${stage.name} open pipeline value`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                      className="h-2.5 min-w-0 overflow-hidden rounded-full bg-ink-800"
                    >
                      <div
                        className="h-full rounded-full bg-brand-400 transition-[width]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span
                      className="whitespace-nowrap text-left text-sm tabular-nums text-muted sm:min-w-24 sm:text-right"
                      title={`MVR ${valueMvr.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                    >
                      {count} · {compactValue(valueMvr)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-8">
            <h2 className="text-base font-semibold text-white">{activeTab}</h2>
            <p className="mt-1 text-sm text-muted">This report view is not available yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
