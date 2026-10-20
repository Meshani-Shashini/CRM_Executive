import { useEffect, useState } from 'react';
import {
  TrendingUp, Target, Users, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import { formatAmount, toMvr } from '../utils/currency';

const tabs = ['Company', 'Leads', 'Deals', 'Staff'] as const;
type DashboardTab = typeof tabs[number];

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>('Company');
  const { deals, leads, clients, activities, viewAsRole } = useApp();
  useEffect(() => {
    setTab(viewAsRole === 'sales' ? 'Leads' : 'Company');
  }, [viewAsRole]);
  const weightedPipeline = deals.reduce(
    (total, deal) => total + toMvr(deal.weighted, deal.currency, deal.exchangeRate),
    0,
  );
  const wonDeals = deals.filter((deal) => {
    const stage = deal.stage.trim().toLowerCase();
    return stage === 'closed-won'
      || stage.includes('won')
      || stage.includes('bound')
      || stage.includes('renewed')
      || stage === 'policy issued';
  });
  const wonValue = wonDeals.reduce(
    (total, deal) => total + toMvr(deal.value, deal.currency, deal.exchangeRate),
    0,
  );
  const activeLeads = leads.filter((lead) => lead.status !== 'COMPLETED').length;
  const leadClasses = [...new Set(leads.map((lead) => lead.insuranceClass))].map((name) => ({
    name,
    count: leads.filter((lead) => lead.insuranceClass === name).length,
  }));
  const maxClassCount = Math.max(1, ...leadClasses.map((item) => item.count));
  const stages = [...new Set(leads.map((lead) => lead.funnelStage))].map((stage) => ({
    name: stage,
    count: leads.filter((lead) => lead.funnelStage === stage).length,
  }));
  const recentActivities = [...activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1 w-fit">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === item ? 'bg-brand-500 text-white shadow-glow' : 'text-muted hover:text-white hover:bg-ink-700'
            }`}
            aria-pressed={tab === item}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Leads' && <LeadsDashboard />}
      {tab === 'Deals' && <DealsDashboard />}
      {tab === 'Staff' && <StaffDashboard />}
      {tab === 'Company' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Weighted Pipeline" value={formatAmount(weightedPipeline, 'MVR')} detail="Probability-adjusted deal values" icon={TrendingUp} accent="brand" />
            <KpiCard label="Closed Won" value={formatAmount(wonValue, 'MVR')} detail={`${wonDeals.length} won deals`} icon={CheckCircle2} accent="win" />
            <KpiCard label="Active Leads" value={`${activeLeads}`} detail={`${leads.length} total leads`} icon={Users} accent="cold" />
            <KpiCard label="Clients" value={`${clients.length}`} detail="Current client records" icon={AlertTriangle} accent="hot" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Leads by Insurance Class</h3>
              {leadClasses.length === 0 ? <EmptyState /> : (
                <div className="space-y-3">
                  {leadClasses.map((item) => (
                    <div key={item.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white">{item.name}</span>
                        <span className="text-muted">{item.count}</span>
                      </div>
                      <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-400 rounded-full" style={{ width: `${item.count / maxClassCount * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Leads by Funnel Stage</h3>
              {stages.length === 0 ? <EmptyState /> : (
                <div className="space-y-2">
                  {stages.map((stage) => (
                    <div key={stage.name} className="flex items-center justify-between rounded-lg bg-ink-900/50 px-3 py-2 text-sm">
                      <span className="text-white">{stage.name}</span>
                      <Badge variant="brand">{stage.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
            {recentActivities.length === 0 ? <EmptyState /> : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 border-b border-ink-700/60 pb-3 last:border-0 last:pb-0">
                    <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-white">{activity.title}</div>
                      <div className="text-[11px] text-muted">{activity.type} · {activity.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LeadsDashboard() {
  const { leads } = useApp();
  const activeLeads = leads.filter((lead) => lead.status !== 'COMPLETED');
  const hotLeads = leads.filter((lead) => lead.temperature === 'HOT');
  const stages = [...new Set(leads.map((lead) => lead.funnelStage))].map((stage) => ({
    name: stage,
    count: leads.filter((lead) => lead.funnelStage === stage).length,
  }));
  const maxStageCount = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads" value={`${leads.length}`} detail="Current records" icon={Users} accent="brand" />
        <KpiCard label="Active Leads" value={`${activeLeads.length}`} detail="Not completed" icon={TrendingUp} accent="cold" />
        <KpiCard label="Hot Leads" value={`${hotLeads.length}`} detail="Priority follow-up" icon={AlertTriangle} accent="hot" />
        <KpiCard label="Quoted" value={`${leads.filter((lead) => lead.funnelStage === 'Quoted').length}`} detail="In quotation stage" icon={CheckCircle2} accent="win" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Leads by Funnel Stage</h3>
          {stages.length === 0 ? <EmptyState /> : <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white">{stage.name}</span>
                  <span className="text-muted">{stage.count}</span>
                </div>
                <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400 rounded-full" style={{ width: `${stage.count / maxStageCount * 100}%` }} />
                </div>
              </div>
            ))}
          </div>}
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Recent Leads</h3>
          {leads.length === 0 ? <EmptyState /> : <div className="space-y-3">
            {leads.slice(0, 5).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-3 border-b border-ink-700/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{lead.client}</div>
                  <div className="text-[11px] text-muted">{lead.funnelStage} · {lead.lastActivity}</div>
                </div>
                <Badge variant={lead.temperature === 'HOT' ? 'hot' : lead.temperature === 'WARM' ? 'warm' : 'cold'}>{lead.temperature}</Badge>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </>
  );
}

function DealsDashboard() {
  const { deals } = useApp();
  const totalValue = deals.reduce((total, deal) => total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0);
  const weightedValue = deals.reduce((total, deal) => total + toMvr(deal.weighted, deal.currency, deal.exchangeRate), 0);
  const stages = [...new Set(deals.map((deal) => deal.stage))].map((stage) => ({
    name: stage,
    count: deals.filter((deal) => deal.stage === stage).length,
    value: deals.filter((deal) => deal.stage === stage)
      .reduce((total, deal) => total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0),
  }));
  const maxStageValue = Math.max(...stages.map((stage) => stage.value), 1);
  const averageProbability = deals.length
    ? Math.round(deals.reduce((sum, deal) => sum + deal.probability, 0) / deals.length)
    : 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pipeline Value" value={formatAmount(totalValue, 'MVR')} detail="Current deals" icon={TrendingUp} accent="brand" />
        <KpiCard label="Weighted Pipeline" value={formatAmount(weightedValue, 'MVR')} detail="Probability adjusted" icon={Target} accent="cold" />
        <KpiCard label="Deals" value={`${deals.length}`} detail="Across all stages" icon={Users} accent="win" />
        <KpiCard label="Average Probability" value={`${averageProbability}%`} detail="Win probability" icon={CheckCircle2} accent="hot" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Pipeline by Deal Stage</h3>
          {stages.length === 0 ? <EmptyState /> : <div className="space-y-4">
            {stages.map((stage) => (
              <div key={stage.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white">{stage.name} <span className="text-muted">({stage.count})</span></span>
                  <span className="text-muted">{formatAmount(stage.value, 'MVR')}</span>
                </div>
                <div className="h-2 bg-ink-900 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full" style={{ width: `${stage.value / maxStageValue * 100}%` }} />
                </div>
              </div>
            ))}
          </div>}
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Deals</h3>
          {deals.length === 0 ? <EmptyState /> : <div className="space-y-3">
            {deals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-3 border-b border-ink-700/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{deal.client}</div>
                  <div className="text-[11px] text-muted truncate">{deal.product} · {deal.stage}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm text-white">{formatAmount(deal.value, deal.currency)}</div>
                  {deal.currency === 'USD' && <div className="text-[11px] text-muted">{formatAmount(toMvr(deal.value, deal.currency, deal.exchangeRate), 'MVR')}</div>}
                  <div className="text-[11px] text-muted">{deal.probability}% probability</div>
                </div>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </>
  );
}

function StaffDashboard() {
  const { users, leads, deals } = useApp();
  const salesUsers = users.filter((user) => user.role === 'sales');
  const totalAssignedLeads = leads.filter((lead) => salesUsers.some((user) => user.id === lead.ownerId)).length;
  const salesPipeline = deals
    .filter((deal) => salesUsers.some((user) => user.id === deal.ownerId))
    .reduce((total, deal) => total + toMvr(deal.weighted, deal.currency, deal.exchangeRate), 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Team Members" value={`${users.length}`} detail="Current tenant users" icon={Users} accent="brand" />
        <KpiCard label="Sales Staff" value={`${salesUsers.length}`} detail="Managing pipeline" icon={TrendingUp} accent="cold" />
        <KpiCard label="Assigned Leads" value={`${totalAssignedLeads}`} detail="Sales team total" icon={Target} accent="win" />
        <KpiCard label="Weighted Pipeline" value={formatAmount(salesPipeline, 'MVR')} detail="Sales team total" icon={CheckCircle2} accent="hot" />
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-ink-700/60">
          <h3 className="text-white font-semibold">Team Overview</h3>
          <p className="text-xs text-muted mt-1">Leads and weighted pipeline assigned to each team member</p>
        </div>
        <div className="divide-y divide-ink-700/60">
          {users.map((user) => {
            const assignedLeads = leads.filter((lead) => lead.ownerId === user.id);
            const assignedDeals = deals.filter((deal) => deal.ownerId === user.id);
            const weighted = assignedDeals.reduce((total, deal) => total + toMvr(deal.weighted, deal.currency, deal.exchangeRate), 0);
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
                <div className="text-sm text-brand-400 font-medium">{formatAmount(weighted, 'MVR')}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label, value, detail, icon: Icon, accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Target;
  accent: 'brand' | 'win' | 'cold' | 'hot';
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
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </div>
  );
}

function EmptyState() {
  return <p className="text-sm text-muted">No records yet.</p>;
}
