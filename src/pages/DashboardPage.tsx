import { TrendingUp, TrendingDown, Target, Users, AlertTriangle, CheckCircle2, Gauge } from 'lucide-react';
import { DEALS, LEADS, CLIENTS, INVOICES } from '../data/seed';
import Badge from '../components/ui/Badge';

const subTabs = ['Company', 'Leads', 'Deals', 'Staff'] as const;

export default function DashboardPage() {
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
        {subTabs.map((t, i) => (
          <button
            key={t}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              i === 0 ? 'bg-brand-500 text-white shadow-glow' : 'text-muted hover:text-white hover:bg-ink-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

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
            {funnelStages.map((s, i) => {
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
    </div>
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
