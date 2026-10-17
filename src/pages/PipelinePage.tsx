import { useMemo, useState } from 'react';
import {
  Plus,
  MoreHorizontal,
  AlertTriangle,
  MessageSquare,
  FileText,
  Calendar,
  Filter,
} from 'lucide-react';
import { deals as allDeals, stages } from '@/data';
import { formatCurrency, momentumBg } from '@/lib/format';
import { Badge, MomentumRing } from '@/components/ui';
import type { Stage, Region } from '@/types';

const stageAccent: Record<Stage, string> = {
  New: 'bg-slate-500',
  Meeting: 'bg-accent-indigo',
  Proposal: 'bg-accent-amber',
  Won: 'bg-accent-emerald',
};

const stageHeader: Record<Stage, string> = {
  New: 'text-slate-400',
  Meeting: 'text-indigo-300',
  Proposal: 'text-amber-300',
  Won: 'text-emerald-300',
};

const regions: (Region | 'All')[] = ['All', 'Europe', 'UK', 'APAC', 'Maldives & Sri Lanka'];

export function PipelinePage() {
  const [region, setRegion] = useState<Region | 'All'>('All');

  const filtered = useMemo(
    () => (region === 'All' ? allDeals : allDeals.filter((d) => d.region === region)),
    [region],
  );

  const byStage = useMemo(() => {
    const map: Record<Stage, typeof filtered> = { New: [], Meeting: [], Proposal: [], Won: [] };
    for (const d of filtered) map[d.stage].push(d);
    return map;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">Deals Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">
            AI momentum-scored opportunities · {filtered.length} active deals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 glass-card px-2 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
            {regions.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  region === r
                    ? 'bg-accent-indigo/20 text-indigo-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-indigo text-white text-[12px] font-medium hover:bg-accent-indigo/90 transition-colors shadow-glow">
            <Plus className="w-4 h-4" /> New Deal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stages.map((stage) => {
          const stageDeals = byStage[stage];
          const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
          return (
            <div key={stage} className="flex flex-col min-h-[60vh]">
              <div className="glass-card rounded-xl p-3 mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${stageAccent[stage]}`} />
                  <span className={`text-[13px] font-semibold ${stageHeader[stage]}`}>{stage}</span>
                  <span className="text-[10px] text-slate-500 bg-base-raised/60 rounded-md px-1.5 py-0.5">
                    {stageDeals.length}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatCurrency(stageValue, 'USD', true)}
                </span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin pr-1">
                {stageDeals.map((d) => (
                  <div
                    key={d.id}
                    className="glass-card rounded-xl p-3.5 group cursor-grab active:cursor-grabbing animate-fade-in"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-slate-100 truncate">{d.company}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{d.title}</p>
                      </div>
                      <MomentumRing score={d.momentum} size={32} />
                    </div>

                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[14px] font-mono font-semibold text-slate-200">
                        {formatCurrency(d.value, d.currency, true)}
                      </span>
                      <span className="text-[10px] text-slate-500">{d.lastActivity}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      {d.tags.slice(0, 2).map((t) => (
                        <Badge key={t} tone="neutral">
                          {t}
                        </Badge>
                      ))}
                      {d.riskFlags.length > 0 && (
                        <Badge tone="crimson">
                          <AlertTriangle className="w-2.5 h-2.5" /> {d.riskFlags[0]}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-base-border/30">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-indigo to-accent-emerald flex items-center justify-center text-[9px] font-semibold text-white">
                          {d.owner.split(' ').map((n) => n[0]).join('')}
                        </div>
                        <span className="text-[10px] text-slate-500">{d.owner}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 rounded-md hover:bg-base-raised/60 text-slate-500 hover:text-slate-300">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-base-raised/60 text-slate-500 hover:text-slate-300">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-base-raised/60 text-slate-500 hover:text-slate-300">
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-base-raised/60 text-slate-500 hover:text-slate-300">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button className="w-full py-2.5 rounded-xl border border-dashed border-base-border/50 text-slate-600 text-[11px] hover:border-accent-indigo/40 hover:text-slate-400 transition-colors flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add deal
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
