import { useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Gauge,
  ShieldCheck,
  AlertTriangle,
  Info,
  Radar,
  ArrowUpRight,
  CircleDot,
} from 'lucide-react';
import { StatCard, SectionHeader, Badge, MomentumRing } from '@/components/ui';
import { regionMetrics, deals, complianceAlerts, getJurisdiction } from '@/data';
import {
  formatCurrency,
  severityColor,
  severityBorder,
  severityBg,
  momentumBg,
} from '@/lib/format';
import type { Region } from '@/types';

const regionColor: Record<Region, string> = {
  Europe: 'bg-accent-indigo',
  UK: 'bg-accent-emerald',
  APAC: 'bg-accent-amber',
  'Maldives & Sri Lanka': 'bg-accent-crimson',
};

const severityIcon = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

export function HudPage() {
  const totalPipeline = useMemo(
    () => regionMetrics.reduce((sum, r) => sum + r.pipelineValue, 0),
    [],
  );
  const totalWonMTD = useMemo(
    () => regionMetrics.reduce((sum, r) => sum + r.wonMTD, 0),
    [],
  );
  const activeDeals = useMemo(
    () => regionMetrics.reduce((sum, r) => sum + r.activeDeals, 0),
    [],
  );
  const avgCompliance = useMemo(
    () => Math.round(regionMetrics.reduce((sum, r) => sum + r.complianceScore, 0) / regionMetrics.length),
    [],
  );
  const avgVelocity = useMemo(
    () => Math.round(regionMetrics.reduce((sum, r) => sum + r.velocityDays, 0) / regionMetrics.length),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">Executive Wallboard</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time global sales &amp; compliance posture — Q4 2026</p>
        </div>
        <Badge tone="emerald" size="sm">
          <CircleDot className="w-3 h-3" /> Live
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Global Pipeline Value"
          value={`$${(totalPipeline / 1_000_000).toFixed(1)}M`}
          delta="8.4% MoM"
          deltaPositive
          icon={<DollarSign className="w-4 h-4" />}
          accent="indigo"
        />
        <StatCard
          label="MTD Revenue Won"
          value={`$${(totalWonMTD / 1_000_000).toFixed(2)}M`}
          delta="12.1% vs target"
          deltaPositive
          icon={<TrendingUp className="w-4 h-4" />}
          accent="emerald"
        />
        <StatCard
          label="Avg Deal Velocity"
          value={`${avgVelocity} days`}
          delta="3d faster"
          deltaPositive
          icon={<Gauge className="w-4 h-4" />}
          accent="amber"
        />
        <StatCard
          label="Compliance Audit Status"
          value={`${avgCompliance}/100`}
          delta="2 flags open"
          deltaPositive={false}
          icon={<ShieldCheck className="w-4 h-4" />}
          accent={avgCompliance >= 90 ? 'emerald' : 'amber'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 glass-card p-5 animate-slide-up">
          <SectionHeader
            title="Regional Revenue Realization"
            subtitle="Pipeline, won MTD, velocity & compliance by region"
            action={
              <button className="text-[11px] text-accent-indigo hover:underline flex items-center gap-1">
                Drilldown <ArrowUpRight className="w-3 h-3" />
              </button>
            }
          />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-base-border/40">
                  <th className="pb-3 font-medium">Region</th>
                  <th className="pb-3 font-medium text-right">Pipeline</th>
                  <th className="pb-3 font-medium text-right">Won MTD</th>
                  <th className="pb-3 font-medium text-right">Active</th>
                  <th className="pb-3 font-medium text-right">Velocity</th>
                  <th className="pb-3 font-medium text-right">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-border/30">
                {regionMetrics.map((r) => (
                  <tr key={r.region} className="group hover:bg-base-raised/30 transition-colors">
                    <td className="py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${regionColor[r.region]}`} />
                        <span className="text-slate-200 font-medium text-[13px]">{r.region}</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-right text-slate-300 font-mono text-[13px]">
                      {formatCurrency(r.pipelineValue, 'USD', true)}
                    </td>
                    <td className="py-3.5 text-right text-slate-300 font-mono text-[13px]">
                      {formatCurrency(r.wonMTD, 'USD', true)}
                    </td>
                    <td className="py-3.5 text-right text-slate-400 text-[13px]">{r.activeDeals}</td>
                    <td className="py-3.5 text-right text-slate-400 text-[13px]">{r.velocityDays}d</td>
                    <td className="py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-base-raised overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.complianceScore >= 95
                                ? 'bg-accent-emerald'
                                : r.complianceScore >= 90
                                  ? 'bg-accent-amber'
                                  : 'bg-accent-crimson'
                            }`}
                            style={{ width: `${r.complianceScore}%` }}
                          />
                        </div>
                        <span className="text-[12px] text-slate-300 font-mono w-6 text-right">
                          {r.complianceScore}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card p-5 animate-slide-up">
          <SectionHeader
            title="AI Revenue Risk Radar"
            subtitle="Copilot-flagged signals"
            action={<Radar className="w-4 h-4 text-accent-indigo" />}
          />
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
            {complianceAlerts.map((a) => {
              const Icon = severityIcon[a.severity];
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border p-3.5 ${severityBorder(a.severity)} ${severityBg(a.severity)}`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${severityColor(a.severity)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-200">{a.title}</p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{a.detail}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {a.dealId && <Badge tone="neutral">{a.dealId}</Badge>}
                        {a.jurisdictionCode && (
                          <Badge tone="indigo">{getJurisdiction(a.jurisdictionCode).name}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="glass-card p-5 animate-slide-up">
        <SectionHeader
          title="Top Momentum Deals"
          subtitle="AI-scored deal momentum across active pipeline"
          action={<Badge tone="indigo">{deals.length} deals</Badge>}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {deals
            .filter((d) => d.stage !== 'Won')
            .sort((a, b) => b.momentum - a.momentum)
            .slice(0, 6)
            .map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-base-border/40 bg-base-nav/40 p-4 hover:border-accent-indigo/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-100 truncate">{d.company}</p>
                    <p className="text-[11px] text-slate-500 truncate">{d.title}</p>
                  </div>
                  <MomentumRing score={d.momentum} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-mono text-slate-300">
                    {formatCurrency(d.value, d.currency, true)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${momentumBg(d.momentum)}`} />
                    <span className="text-[11px] text-slate-500">{d.stage}</span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
