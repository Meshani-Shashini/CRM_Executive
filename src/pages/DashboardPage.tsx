import { useEffect, useState } from 'react';
import {
  TrendingUp, Target, Users, AlertTriangle, CheckCircle2, Clock3,
  Building2, Briefcase, ShieldCheck,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import ViewModeSwitcher from '../components/ui/ViewModeSwitcher';
import MonthlyWonLostChart from '../components/deal/MonthlyWonLostChart';
import {
  DashboardBarChart,
  DashboardChartCard,
  DashboardDonutChart,
  DashboardEmptyChart,
} from '../components/dashboard/DashboardCharts';
import { formatAmount, toMvr } from '../utils/currency';
import { dashboardHref } from '../utils/navigation';
import { formatDate } from '../utils/date';
import {
  isLostPipelineStage, isWonPipelineStage,
} from '../utils/stageSla';
import { classifyDealOutcome, summarizeClosedDealsForLastSixMonths } from '../utils/monthlyDealSummary';
import {
  activeUnconvertedLeads, LEAD_LIFECYCLE_STAGES, lifecycleStageForLead,
} from '../utils/leadLifecycle';

type DashboardTab = 'Company' | 'Leads' | 'Deals' | 'Staff';

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>('Company');
  const { deals, leads, clients, activities, invoices, payments, pipelineStages, stageHistory, viewAsRole } = useApp();
  useEffect(() => {
    setTab(viewAsRole === 'sales' ? 'Leads' : 'Company');
  }, [viewAsRole]);
  const weightedPipeline = deals.reduce(
    (total, deal) => total + toMvr(deal.weighted, deal.currency, deal.exchangeRate),
    0,
  );
  const wonDeals = deals.filter((deal) => {
    if (deal.disposition) return deal.disposition === 'won';
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage)
      ?? deal.stage;
    return isWonPipelineStage(stage) && !isLostPipelineStage(stage);
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
  const stages = LEAD_LIFECYCLE_STAGES.map((stage) => ({
    name: stage,
    count: leads.filter((lead) => lifecycleStageForLead(
      lead,
      Boolean(deals.some((deal) => deal.id === lead.dealId || deal.leadId === lead.id)),
    ) === stage).length,
  }));
  const recentActivities = [...activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageToolbar name="dashboard">
        <ViewModeSwitcher label="Dashboard sections" role="group" value={tab} onChange={setTab}
          className="w-fit"
          options={[
            { value: 'Company', label: 'Company', Icon: Building2 },
            { value: 'Leads', label: 'Leads', Icon: Users },
            { value: 'Deals', label: 'Deals', Icon: Briefcase },
            { value: 'Staff', label: 'Staff', Icon: ShieldCheck },
          ]} />
      </PageToolbar>

      {tab === 'Leads' && <LeadsDashboard />}
      {tab === 'Deals' && <DealsDashboard />}
      {tab === 'Staff' && <StaffDashboard />}
      {tab === 'Company' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard href={dashboardHref('deals')} label="Weighted Pipeline" value={formatAmount(weightedPipeline, 'MVR')} detail="Probability-adjusted deal values" icon={TrendingUp} accent="brand" />
            <KpiCard href={dashboardHref('deals', { filter: 'won' })} label="Closed Won" value={formatAmount(wonValue, 'MVR')} detail={`${wonDeals.length} won deals`} icon={CheckCircle2} accent="win" />
            <KpiCard href={dashboardHref('leads', { status: 'active' })} label="Active Leads" value={`${activeLeads}`} detail={`${leads.length} total leads`} icon={Users} accent="cold" />
            <KpiCard href={dashboardHref('clients')} label="Clients" value={`${clients.length}`} detail="Current client records" icon={AlertTriangle} accent="hot" />
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Transaction Totals</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricLink href={dashboardHref('invoices', { status: 'outstanding' })} label="Outstanding invoices" value={`MVR ${invoices.filter((invoice) => invoice.status !== 'Paid').reduce((sum, invoice) => sum + invoice.items.reduce((total, item) => total + item.qty * item.unitPrice * (1 + item.vatRate / 100), 0), 0).toLocaleString()}`} />
              <MetricLink href={dashboardHref('invoices', { status: 'Overdue' })} label="Overdue invoices" value={`MVR ${invoices.filter((invoice) => invoice.status === 'Overdue').reduce((sum, invoice) => sum + invoice.items.reduce((total, item) => total + item.qty * item.unitPrice * (1 + item.vatRate / 100), 0), 0).toLocaleString()}`} />
              <MetricLink href={dashboardHref('invoices', { status: 'Paid' })} label="Collected invoices" value={`MVR ${invoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.items.reduce((total, item) => total + item.qty * item.unitPrice * (1 + item.vatRate / 100), 0), 0).toLocaleString()}`} />
              <MetricLink href={dashboardHref('payments')} label="Payments received" value={`MVR ${payments.reduce((sum, payment) => sum + payment.amount, 0).toLocaleString()}`} />
            </div>
          </div>

          <MonthlyWonLostChart
            deals={deals}
            pipelineStages={pipelineStages}
            stageHistory={stageHistory}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Leads by Insurance Class</h3>
              {leadClasses.length === 0 ? <EmptyState /> : (
                <div className="space-y-3">
                  {leadClasses.map((item) => (
                    <div key={item.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <a href={dashboardHref('leads', { insuranceClass: item.name })} className="text-white hover:text-brand-300">{item.name}</a>
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
              {leads.length === 0 ? <EmptyState /> : (
                <div className="space-y-2">
                  {stages.map((stage) => (
                    <div key={stage.name} className="flex items-center justify-between rounded-lg bg-ink-900/50 px-3 py-2 text-sm">
                      <a href={dashboardHref('leads', { stage: stage.name })} className="text-white hover:text-brand-300">{stage.name}</a>
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
                      <div className="text-[11px] text-muted">{activity.type} · {formatDate(activity.date)}</div>
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
  const { leads, deals } = useApp();
  const openLeads = activeUnconvertedLeads(leads, deals);
  const linkedLeadIds = new Set(deals.map((deal) => deal.leadId));
  const hasLinkedDeal = (lead: typeof leads[number]) => Boolean(lead.dealId) || linkedLeadIds.has(lead.id);
  const hotLeads = openLeads.filter((lead) => lead.temperature === 'HOT');
  const convertedLeads = leads.filter((lead) =>
    lifecycleStageForLead(lead, hasLinkedDeal(lead)) === 'Converted to deal');
  const stages = LEAD_LIFECYCLE_STAGES.map((stage) => ({
    name: stage,
    count: leads.filter((lead) => lifecycleStageForLead(lead, hasLinkedDeal(lead)) === stage).length,
  }));
  const premiumsByClass = groupLeadsByInsuranceClass(openLeads);
  const leadsByClass = groupLeadsByInsuranceClass(leads, false);
  const premiumInPlay = openLeads.reduce(
    (total, lead) => total + toMvr(lead.premium, lead.currency, lead.exchangeRate),
    0,
  );
  const hotShare = openLeads.length ? Math.round(hotLeads.length / openLeads.length * 100) : 0;
  const leadStageColors = ['#38BDF8', '#27C272', '#F59E0B', '#E54848', '#14B8A6', '#EC4899'];
  const classColors = ['#27C272', '#EF4444', '#38BDF8', '#F59E0B', '#A78BFA', '#14B8A6'];
  const priorityColors = { HOT: '#E54848', WARM: '#E09228', COLD: '#5B8DEF' };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard href={dashboardHref('leads', { status: 'active' })} label="Open leads" value={`${openLeads.length}`} detail="Not converted or lost" icon={Users} accent="brand" />
        <KpiCard href={dashboardHref('leads', { temperature: 'HOT' })} label="Hot" value={`${hotShare}%`} detail={`${hotLeads.length} priority leads`} icon={AlertTriangle} accent="hot" />
        <KpiCard href={dashboardHref('leads', { status: 'active' })} label="Premium in play" value={formatAmount(premiumInPlay, 'MVR')} detail="Open lead premiums" icon={TrendingUp} accent="cold" />
        <KpiCard href={dashboardHref('leads', { status: 'converted' })} label="Converted" value={`${convertedLeads.length}`} detail="Leads linked to deals" icon={CheckCircle2} accent="win" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardChartCard title="Leads by funnel stage">
          <DashboardBarChart items={stages.map((stage, index) => ({
            label: compactStageLabel(stage.name),
            value: stage.count,
            color: leadStageColors[index % leadStageColors.length],
          }))} />
        </DashboardChartCard>
        <DashboardChartCard title="Premiums by insurance class">
          <DashboardDonutChart
            items={premiumsByClass.map((item, index) => ({
              label: item.label,
              value: item.value,
              color: classColors[index % classColors.length],
            }))}
            centerValue={compactAmount(premiumInPlay)}
            centerLabel="MVR premium"
          />
        </DashboardChartCard>
        <DashboardChartCard title="Priority mix">
          <DashboardDonutChart
            items={(['HOT', 'WARM', 'COLD'] as const).map((temperature) => ({
              label: temperature.charAt(0) + temperature.slice(1).toLowerCase(),
              value: openLeads.filter((lead) => lead.temperature === temperature).length,
              color: priorityColors[temperature],
            }))}
            centerValue={`${openLeads.length}`}
            centerLabel="leads"
          />
        </DashboardChartCard>
        <DashboardChartCard title="Leads by class">
          {leadsByClass.length === 0 ? <DashboardEmptyChart>No open leads to show.</DashboardEmptyChart> : <DashboardBarChart items={leadsByClass.map((item, index) => ({
            label: item.label,
            value: item.value,
            color: classColors[index % classColors.length],
          }))} />}
        </DashboardChartCard>
      </div>
    </>
  );
}

function DealsDashboard() {
  const { deals, leads, pipelineStages, stageHistory } = useApp();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const outcomes = deals.map((deal) => ({
    deal,
    outcome: classifyDealOutcome(
      deal,
      pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage),
      stageHistory,
    ),
  }));
  const openDeals = outcomes.filter((entry) => entry.outcome === 'open');
  const wonDeals = outcomes.filter((entry) => entry.outcome === 'won');
  const lostDeals = outcomes.filter((entry) => entry.outcome === 'lost');
  const openPipelineValue = openDeals.reduce(
    (total, { deal }) => total + toMvr(deal.value, deal.currency, deal.exchangeRate),
    0,
  );
  const monthlyOutcomes = summarizeClosedDealsForLastSixMonths(deals, pipelineStages, stageHistory, new Date(now));
  const monthlyWinRates = monthlyOutcomes.map((month) => ({
    label: month.label,
    value: month.won + month.lost ? Math.round(month.won / (month.won + month.lost) * 100) : 0,
    color: '#27C272',
    closed: month.won + month.lost,
  }));
  const closedDealCount = wonDeals.length + lostDeals.length;
  const winRate = closedDealCount ? Math.round(wonDeals.length / closedDealCount * 100) : 0;
  const leadByDealId = new Map(leads.flatMap((lead) => [[lead.id, lead], ...(lead.dealId ? [[lead.dealId, lead] as const] : [])]));
  const pipelineByClass = new Map<string, number>();
  for (const { deal } of openDeals) {
    const insuranceClass = leadByDealId.get(deal.leadId)?.insuranceClass ?? 'Unclassified';
    pipelineByClass.set(
      insuranceClass,
      (pipelineByClass.get(insuranceClass) ?? 0) + toMvr(deal.value, deal.currency, deal.exchangeRate),
    );
  }
  const classColors = ['#27C272', '#EF4444', '#38BDF8', '#F59E0B', '#A78BFA', '#14B8A6'];
  const classValueItems = [...pipelineByClass.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, value], index) => ({ label, value, color: classColors[index % classColors.length] }));
  const closedDurations = outcomes.flatMap(({ deal, outcome }) => {
    if (outcome === 'open' || !deal.createdAt) return [];
    const createdAt = Date.parse(deal.createdAt);
    const terminalStageIds = new Set(pipelineStages
      .filter((stage) => stage.pipelineId === deal.pipelineId
        && (outcome === 'won' ? stage.isClosedWon : stage.isClosedLost))
      .map((stage) => stage.id));
    const closure = stageHistory
      .filter((entry) => entry.dealId === deal.id
        && (entry.outcome ? entry.outcome === outcome : terminalStageIds.has(entry.toStageId)))
      .sort((left, right) => Date.parse(right.enteredAt) - Date.parse(left.enteredAt))[0];
    const closedAt = Date.parse(closure?.enteredAt ?? '');
    return Number.isFinite(createdAt) && Number.isFinite(closedAt) && closedAt >= createdAt
      ? [(closedAt - createdAt) / 86400000]
      : [];
  });
  const averageDaysToClose = closedDurations.length
    ? Math.round(closedDurations.reduce((total, days) => total + days, 0) / closedDurations.length)
    : 0;
  const showMonthlyWinRate = monthlyWinRates.some((month) => month.closed > 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard href={dashboardHref('deals', { status: 'open' })} label="Open deals" value={`${openDeals.length}`} detail="Across active stages" icon={Users} accent="brand" />
        <KpiCard href={dashboardHref('deals', { status: 'open' })} label="Pipeline value" value={formatAmount(openPipelineValue, 'MVR')} detail="Open deal value" icon={TrendingUp} accent="cold" />
        <KpiCard href={dashboardHref('deals', { status: 'won' })} label="Won" value={`${wonDeals.length}`} detail="Closed-won deals" icon={CheckCircle2} accent="win" />
        <KpiCard href={dashboardHref('deals')} label="Avg. days to close" value={`${averageDaysToClose}`} detail={`${closedDurations.length} with timing data`} icon={Clock3} accent="hot" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardChartCard title="Win rate">
          {closedDealCount === 0 ? <DashboardEmptyChart>Not enough data yet. Close a deal to see your win rate.</DashboardEmptyChart> : (
            <DashboardDonutChart
              items={[
                { label: 'Won', value: wonDeals.length, color: '#27C272' },
                { label: 'Lost', value: lostDeals.length, color: '#454B55' },
              ]}
              centerValue={`${winRate}%`}
              centerLabel={`${closedDealCount} deal${closedDealCount === 1 ? '' : 's'}`}
            />
          )}
        </DashboardChartCard>
        <DashboardChartCard title="Win rate by month">
          {showMonthlyWinRate ? <DashboardBarChart
            items={monthlyWinRates.map(({ label, value, color }) => ({ label, value, color }))}
            valueLabel={(value) => `${value}%`}
          /> : <DashboardEmptyChart>Not enough data yet. Close deals to see the monthly trend.</DashboardEmptyChart>}
        </DashboardChartCard>
        <DashboardChartCard title="Pipeline value by insurance class">
          {classValueItems.length === 0 ? <DashboardEmptyChart>No open deals to show.</DashboardEmptyChart> : (
            <DashboardDonutChart
              items={classValueItems}
              centerValue={compactAmount(openPipelineValue)}
              centerLabel="MVR value"
            />
          )}
        </DashboardChartCard>
        <DashboardChartCard title="Deals by status">
          <DashboardBarChart
            items={[
              { label: 'Open', value: openDeals.length, color: '#5B8DEF' },
              { label: 'Won', value: wonDeals.length, color: '#27C272' },
              { label: 'Lost', value: lostDeals.length, color: '#454B55' },
            ]}
          />
        </DashboardChartCard>
      </div>
    </>
  );
}

function StaffDashboard() {
  const { users, deals, activities, pipelineStages, stageHistory } = useApp();
  const salesUsers = users.filter((user) => user.role === 'sales');
  const salesUserIds = new Set(salesUsers.map((user) => user.id));
  const teamDeals = deals.filter((deal) => salesUserIds.has(deal.ownerId));
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const wonThisMonth = teamDeals.filter((deal) => {
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    return classifyDealOutcome(deal, stage, stageHistory) === 'won'
      && deal.closeDate?.slice(0, 7) === currentMonthKey;
  });
  const achieved = wonThisMonth.reduce(
    (total, deal) => total + toMvr(deal.value, deal.currency, deal.exchangeRate),
    0,
  );
  const salesPipeline = teamDeals.reduce((total, deal) => {
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    return classifyDealOutcome(deal, stage, stageHistory) === 'open'
      ? total + toMvr(deal.weighted, deal.currency, deal.exchangeRate)
      : total;
  }, 0);
  const activitiesByPerson = salesUsers.map((user) => ({
    user,
    count: activities.filter((activity) => activity.userId === user.id).length,
  }));
  const achievedByPerson = salesUsers.map((user) => ({
    user,
    amount: wonThisMonth.filter((deal) => deal.ownerId === user.id)
      .reduce((total, deal) => total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0),
  }));
  const activityColors = ['#38BDF8', '#27C272', '#F59E0B', '#E54848', '#A78BFA', '#14B8A6'];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Team target" value={formatAmount(0, 'MVR')} detail="No target configured" icon={Target} accent="brand" />
        <KpiCard label="Achieved" value={formatAmount(achieved, 'MVR')} detail="Won deals this month" icon={CheckCircle2} accent="win" />
        <KpiCard href={dashboardHref('deals')} label="Weighted pipeline" value={formatAmount(salesPipeline, 'MVR')} detail="Open sales deals" icon={TrendingUp} accent="cold" />
        <KpiCard href={dashboardHref('settings')} label="People" value={`${salesUsers.length}`} detail="Sales team members" icon={Users} accent="hot" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardChartCard title="Achieved by person">
          {achievedByPerson.length === 0 || !achievedByPerson.some(({ amount }) => amount > 0)
            ? <DashboardEmptyChart>Nothing to show yet.</DashboardEmptyChart> : (
            <DashboardBarChart
              items={achievedByPerson.map(({ user, amount }, index) => ({
                key: user.id,
                label: user.name.split(' ')[0],
                value: amount,
                color: activityColors[index % activityColors.length],
              }))}
              valueLabel={(value) => compactAmount(value)}
            />
          )}
        </DashboardChartCard>
        <DashboardChartCard title="Activity logged">
          {activitiesByPerson.length === 0 || !activitiesByPerson.some(({ count }) => count > 0)
            ? <DashboardEmptyChart>No activity logged yet.</DashboardEmptyChart> : (
            <DashboardBarChart items={activitiesByPerson.map(({ user, count }, index) => ({
              key: user.id,
              label: user.name.split(' ')[0],
              value: count,
              color: activityColors[index % activityColors.length],
            }))} />
          )}
        </DashboardChartCard>
      </div>
      <section className="glass rounded-2xl p-4" aria-label="Against target">
        <h3 className="mb-4 text-sm font-semibold text-white">Against target</h3>
        <div className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-ink-600 px-4 text-center text-xs text-muted">
          No targets set for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} yet.
        </div>
      </section>
    </>
  );
}

function groupLeadsByInsuranceClass(leads: ReturnType<typeof activeUnconvertedLeads>, usePremium = true) {
  const groups = new Map<string, number>();
  for (const lead of leads) {
    const value = usePremium
      ? toMvr(lead.premium, lead.currency, lead.exchangeRate)
      : 1;
    groups.set(lead.insuranceClass, (groups.get(lead.insuranceClass) ?? 0) + value);
  }
  return [...groups.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => ({ label, value }));
}

function compactStageLabel(stage: string) {
  return stage.replace(' to deal', '').replace(' Identified', '');
}

function compactAmount(amount: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

function KpiCard({
  href, label, value, detail, icon: Icon, accent,
}: {
  href?: string;
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
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="text-xs text-muted tracking-wider">{label}</div>
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${colorMap[accent]}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </>
  );
  return href ? <a href={href} className="glass rounded-2xl p-4 hover:border-ink-500 transition group block">{content}</a> : <div className="glass rounded-2xl p-4 hover:border-ink-500 transition group">{content}</div>;
}

function MetricLink({ href, label, value }: { href: string; label: string; value: string }) {
  return <a href={href} className="rounded-xl border border-ink-700 bg-ink-900/40 p-3 hover:border-brand-400/50 hover:bg-ink-800/60 transition">
    <div className="text-[11px] tracking-wider text-muted">{label}</div>
    <div className="mt-1 text-sm font-semibold text-white">{value}</div>
  </a>;
}

function EmptyState() {
  return <p className="text-sm text-muted">No records yet.</p>;
}
