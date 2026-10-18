import { useState } from 'react';
import { TrendingUp, TrendingDown, Target, Users, AlertTriangle, CheckCircle2, Gauge } from 'lucide-react';
import { DEALS, LEADS, CLIENTS, USERS } from '../data/seed';
import Badge from '../components/ui/Badge';

const subTabs = ['Company', 'Leads', 'Deals', 'Staff'] as const;
type DashboardTab = typeof subTabs[number];

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>('Company');
  const weightedPipeline = DEALS.reduce((s, d) => s + d.weighted, 0);
  const wonValue = 206700;
  const activeLeads = LEADS.filter((l) => l.status !== 'COMPLETED').length;
  const tasksDue = 7;

  const wonLost = [120, 180, 90, 240, 310, 280];
  const labels = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const maxBar = Math.max(...wonLost);
  const winRate = 100;

  const classDist = [
    { name: 'Fire', pct: 38, color: 'bg-hot' },
    { name: 'Engineering', pct: 24, color: 'bg-warm' },
    { name: 'Miscellaneous', pct: 20, color: 'bg-cold' },
    { name: 'Marine', pct: 12, color: 'bg-win' },
    { name: 'Bonds', pct: 6, color: 'bg-brand-400' },
  ];

  const funnelStages = [
    { stage: 'Lead Identified', count: 12 },
    { stage: 'Contact Made', count: 8 },
    { stage: 'Key Person Identified', count: 5 },
    { stage: 'Quoted', count: 4 },
    { stage: 'Internal Slip', count: 2 },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1 w-fit">
        {subTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t ? 'bg-brand-500 text-white shadow-glow' : 'text-muted hover:text-white hover:bg-ink-700'
            }`}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Leads' && <LeadsDashboard />}
      {tab === 'Deals' && <DealsDashboard />}
      {tab === 'Staff' && <StaffDashboard />}
      {tab === 'Company' && <>
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Weighted Pipeline" value={`MVR ${weightedPipeline.toLocaleString()}`} delta="+12.4%" up icon={TrendingUp} accent="brand" />
        <KpiCard label="Won (YTD)" value={`MVR ${wonValue.toLocaleString()}`} delta="+8.1%" up icon={CheckCircle2} accent="win" />
        <KpiCard label="Active Leads" value={`${activeLeads}`} delta="+3 new" up icon={Users} accent="cold" />
        <KpiCard label="Tasks Due" value={`${tasksDue}`} delta="7 late" icon={AlertTriangle} accent="hot" alert />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Won/Lost trend */}
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-semibold">Won / Lost — 6 month trend</h3>
              <p className="text-xs text-muted mt-0.5">Premium value bound (MVR '000)</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-win"><span className="w-2.5 h-2.5 rounded-sm bg-win" /> Won</span>
              <span className="flex items-center gap-1.5 text-hot"><span className="w-2.5 h-2.5 rounded-sm bg-hot" /> Lost</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 h-48">
            {wonLost.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center gap-1 h-full">
                  <div className="w-1/2 bg-gradient-to-t from-win/40 to-win rounded-t-md transition-all hover:from-win hover:to-win" style={{ height: `${(v / maxBar) * 100}%` }} />
                  <div className="w-1/2 bg-gradient-to-t from-hot/40 to-hot/80 rounded-t-md" style={{ height: `${(v / maxBar) * 50}%` }} />
                </div>
                <span className="text-[10px] text-muted">{labels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Win rate gauge */}
        <div className="glass rounded-2xl p-5 flex flex-col">
          <h3 className="text-white font-semibold">Win Rate</h3>
          <p className="text-xs text-muted mb-4">Last 30 days</p>
          <div className="flex-1 flex items-center justify-center">
            <GaugeRing value={winRate} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-center">
            <div className="bg-ink-900/50 rounded-lg p-2">
              <div className="text-win font-semibold text-lg">{winRate}%</div>
              <div className="text-[10px] text-muted">Win Rate</div>
            </div>
            <div className="bg-ink-900/50 rounded-lg p-2">
              <div className="text-white font-semibold text-lg">5/5</div>
              <div className="text-[10px] text-muted">Won/Total</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline by class */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Pipeline by Insurance Class</h3>
          <div className="space-y-3">
            {classDist.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white">{c.name}</span>
                  <span className="text-muted">{c.pct}%</span>
                </div>
                <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
                  <div className={`h-full ${c.color} rounded-full transition-all duration-700`} style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funnel stages */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Funnel Stage Distribution</h3>
          <div className="space-y-2">
            {funnelStages.map((s) => {
              const pct = (s.count / funnelStages[0].count) * 100;
              return (
                <div key={s.stage} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-muted truncate">{s.stage}</div>
                  <div className="flex-1 h-7 bg-ink-900 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500/40 to-brand-400 rounded-md flex items-center px-2"
                      style={{ width: `${pct}%` }}
                    >
                      <span className="text-[10px] text-white font-semibold">{s.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {CLIENTS.slice(0, 4).map((c, i) => (
              <div key={c.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{c.name}</div>
                  <div className="text-[11px] text-muted">{c.class} · {c.insurer}</div>
                </div>
                <Badge variant={i === 0 ? 'hot' : i === 1 ? 'warm' : 'muted'}>{i === 0 ? 'HOT' : i === 1 ? 'WARM' : 'COLD'}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

function LeadsDashboard() {
  const activeLeads = LEADS.filter((lead) => lead.status !== 'COMPLETED');
  const hotLeads = LEADS.filter((lead) => lead.temperature === 'HOT');
  const stages = [...new Set(LEADS.map((lead) => lead.funnelStage))].map((stage) => ({
    name: stage,
    count: LEADS.filter((lead) => lead.funnelStage === stage).length,
  }));
  const maxStageCount = Math.max(...stages.map((stage) => stage.count), 1);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads" value={`${LEADS.length}`} delta="All leads" icon={Users} accent="brand" />
        <KpiCard label="Active Leads" value={`${activeLeads.length}`} delta="Not completed" icon={TrendingUp} accent="cold" up />
        <KpiCard label="Hot Leads" value={`${hotLeads.length}`} delta="Priority follow-up" icon={AlertTriangle} accent="hot" />
        <KpiCard label="Quoted" value={`${LEADS.filter((lead) => lead.funnelStage === 'Quoted').length}`} delta="In quotation stage" icon={CheckCircle2} accent="win" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Leads by Funnel Stage</h3>
          <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white">{stage.name}</span>
                  <span className="text-muted">{stage.count}</span>
                </div>
                <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400 rounded-full" style={{ width: `${(stage.count / maxStageCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Recent Leads</h3>
          <div className="space-y-3">
            {LEADS.slice(0, 5).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-3 border-b border-ink-700/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{lead.client}</div>
                  <div className="text-[11px] text-muted">{lead.funnelStage} · {lead.lastActivity}</div>
                </div>
                <Badge variant={lead.temperature === 'HOT' ? 'hot' : lead.temperature === 'WARM' ? 'warm' : 'cold'}>{lead.temperature}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function DealsDashboard() {
  const totalValue = DEALS.reduce((total, deal) => total + deal.value, 0);
  const weightedValue = DEALS.reduce((total, deal) => total + deal.weighted, 0);
  const stages = [...new Set(DEALS.map((deal) => deal.stage))].map((stage) => ({
    name: stage,
    count: DEALS.filter((deal) => deal.stage === stage).length,
    value: DEALS.filter((deal) => deal.stage === stage).reduce((total, deal) => total + deal.value, 0),
  }));
  const maxStageValue = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pipeline Value" value={`MVR ${totalValue.toLocaleString()}`} delta={`${DEALS.length} open deals`} icon={TrendingUp} accent="brand" up />
        <KpiCard label="Weighted Pipeline" value={`MVR ${weightedValue.toLocaleString()}`} delta="Probability adjusted" icon={Target} accent="cold" />
        <KpiCard label="Open Deals" value={`${DEALS.length}`} delta="Across all stages" icon={Users} accent="win" />
        <KpiCard label="Average Probability" value={`${Math.round(DEALS.reduce((sum, deal) => sum + deal.probability, 0) / Math.max(DEALS.length, 1))}%`} delta="Win probability" icon={CheckCircle2} accent="hot" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Pipeline by Deal Stage</h3>
          <div className="space-y-4">
            {stages.map((stage) => (
              <div key={stage.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white">{stage.name} <span className="text-muted">({stage.count})</span></span>
                  <span className="text-muted">MVR {stage.value.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full" style={{ width: `${(stage.value / maxStageValue) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Active Deals</h3>
          <div className="space-y-3">
            {DEALS.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-3 border-b border-ink-700/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{deal.client}</div>
                  <div className="text-[11px] text-muted truncate">{deal.product} · {deal.stage}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm text-white">MVR {deal.value.toLocaleString()}</div>
                  <div className="text-[11px] text-muted">{deal.probability}% probability</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function StaffDashboard() {
  const salesUsers = USERS.filter((user) => user.role === 'sales');
  const totalAssignedLeads = LEADS.filter((lead) => salesUsers.some((user) => user.id === lead.ownerId)).length;
  const salesPipeline = DEALS.filter((deal) => salesUsers.some((user) => user.id === deal.ownerId))
    .reduce((total, deal) => total + deal.weighted, 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Team Members" value={`${USERS.length}`} delta="All roles" icon={Users} accent="brand" />
        <KpiCard label="Sales Staff" value={`${salesUsers.length}`} delta="Managing pipeline" icon={TrendingUp} accent="cold" up />
        <KpiCard label="Assigned Leads" value={`${totalAssignedLeads}`} delta="Sales team total" icon={Target} accent="win" />
        <KpiCard label="Weighted Pipeline" value={`MVR ${salesPipeline.toLocaleString()}`} delta="Sales team total" icon={CheckCircle2} accent="hot" />
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-ink-700/60">
          <h3 className="text-white font-semibold">Team Overview</h3>
          <p className="text-xs text-muted mt-1">Leads and weighted pipeline assigned to each team member</p>
        </div>
        <div className="divide-y divide-ink-700/60">
          {USERS.map((user) => {
            const assignedLeads = LEADS.filter((lead) => lead.ownerId === user.id);
            const assignedDeals = DEALS.filter((deal) => deal.ownerId === user.id);
            const weighted = assignedDeals.reduce((total, deal) => total + deal.weighted, 0);
            return (
              <div key={user.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-40">
                  <div className="text-sm text-white">{user.name}</div>
                  <div className="text-[11px] text-muted">{user.title ?? user.role}</div>
                </div>
                <div className="text-xs text-muted">{assignedLeads.length} leads</div>
                <div className="text-xs text-muted">{assignedDeals.length} deals</div>
                <div className="text-sm text-brand-400 font-medium">MVR {weighted.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label, value, delta, up, icon: Icon, accent, alert,
}: {
  label: string; value: string; delta: string; up?: boolean;
  icon: typeof Target; accent: 'brand' | 'win' | 'cold' | 'hot'; alert?: boolean;
}) {
  const colorMap = {
    brand: 'text-brand-400 bg-brand-400/10 border-brand-400/30',
    win: 'text-win bg-win/10 border-win/30',
    cold: 'text-cold bg-cold/10 border-cold/30',
    hot: 'text-hot bg-hot/10 border-hot/30',
  };
  return (
    <div className="glass rounded-2xl p-4 hover:border-ink-500 transition group">
      <div className="flex items-start justify-between">
        <div className="text-xs text-muted uppercase tracking-wider">{label}</div>
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${colorMap[accent]}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className={`mt-1 text-xs flex items-center gap-1 ${alert ? 'text-hot' : up ? 'text-win' : 'text-muted'}`}>
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {delta}
      </div>
    </div>
  );
}

function GaugeRing({ value }: { value: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative w-40 h-40">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} stroke="#23232A" strokeWidth="10" fill="none" />
        <circle
          cx="60" cy="60" r={r} stroke="#10B981" strokeWidth="10" fill="none"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Gauge size={18} className="text-win mb-1" />
        <span className="text-3xl font-bold text-white">{value}%</span>
      </div>
    </div>
  );
}
