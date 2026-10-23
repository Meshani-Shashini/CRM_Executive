import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle, ArrowRight, Building2, CalendarDays, Check, Clock3, FileText,
  MessageSquare, Phone, Plus, ShieldCheck, UserRound, Wallet,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { TENANT_ID } from '../lib/supabase';
import type { Activity, Deal, Lead, PipelineStage, StageHistoryAudit } from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import { calculateBrokerageCommission } from '../utils/insurance';
import { hasCompleteCommunicationChannels, requiresCommunicationChannels } from '../utils/communication';
import { hasCompleteClientProfile } from '../utils/customerProfile';

const LOSS_REASONS = [
  'Price / premium',
  'Competitor selected',
  'Coverage not suitable',
  'Client withdrew',
  'Underwriting declined',
  'Other',
];

function isLostStage(name: string) {
  return name.toLowerCase().includes('lost') || name.toLowerCase().includes('declined');
}

function isBoundStage(name: string) {
  const stage = name.toLowerCase();
  return stage.includes('bound') || stage.includes('won') || stage.includes('renewed')
    || stage.includes('immediate cover') || stage.includes('policy issued');
}

function stageBadgeTone(name: string): 'hot' | 'warm' | 'win' | 'brand' {
  if (isLostStage(name)) return 'hot';
  if (isBoundStage(name)) return 'win';
  if (requiresCommunicationChannels(name)) return 'warm';
  return 'brand';
}

function clientForItem(item: Deal | Lead, clients: ReturnType<typeof useApp>['clients']) {
  return clients.find((client) => client.id === item.clientId)
    ?? clients.find((client) => client.name.trim().toLowerCase() === item.client.trim().toLowerCase());
}

function dateBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

export default function DealWorkspace({
  deals,
  onCreateDeal,
  onEditDeal,
}: {
  deals: Deal[];
  onCreateDeal: () => void;
  onEditDeal: (deal: Deal) => void;
}) {
  const {
    activities, setActivities, clients, deals: allDeals, setDeals, leads, setLeads,
    products, pipelines, pipelineStages, stageHistory, setStageHistory, invoices, setInvoices, user,
  } = useApp();
  const [selectedKey, setSelectedKey] = useState('');
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [activityModal, setActivityModal] = useState<'meeting' | 'note' | 'quote' | null>(null);
  const [moveStage, setMoveStage] = useState<PipelineStage | null>(null);
  const [lossReason, setLossReason] = useState('');
  const [moveError, setMoveError] = useState('');
  const [contactError, setContactError] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');

  const records = useMemo(() => [
    ...deals.map((deal) => ({ kind: 'deal' as const, item: deal, key: `deal:${deal.id}` })),
    ...leads.map((lead) => ({ kind: 'lead' as const, item: lead, key: `lead:${lead.id}` })),
  ].filter(({ item }) => {
    const productLabel = 'product' in item ? item.product : item.productCode;
    const stageLabel = 'stage' in item ? item.stage : item.funnelStage;
    const searchable = `${item.client} ${productLabel} ${stageLabel} ${item.id}`.toLowerCase();
    return searchable.includes(query.toLowerCase())
      && (!productFilter || item.productCode === productFilter);
  }), [deals, leads, productFilter, query]);

  const selected = records.find((record) => record.key === selectedKey) ?? records[0];
  const selectedDeal = selected?.kind === 'deal' ? selected.item as Deal : undefined;
  const selectedLead = selected?.kind === 'lead' ? selected.item as Lead : undefined;
  const selectedItem = selectedDeal ?? selectedLead;
  const selectedClient = selectedItem ? clientForItem(selectedItem, clients) : undefined;
  const selectedProduct = products.find((product) => product.code === selectedItem?.productCode)
    ?? products.find((product) => product.name === (selectedDeal?.product ?? ''));
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedItem?.pipelineId);
  const stages = pipelineStages.filter((stage) => stage.pipelineId === selectedDeal?.pipelineId)
    .sort((left, right) => left.stageOrder - right.stageOrder);
  const currentStage = stages.find((stage) => stage.name === selectedDeal?.stage);
  const selectedActivities = activities
    .filter((activity) => (selectedClient && activity.clientId === selectedClient.id)
      || (selectedDeal && activity.dealId === selectedDeal.id))
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const quotes = selectedActivities.filter((activity) => activity.type === 'quote' && activity.quoteAmount !== undefined);
  const selectedHistory = selectedDeal
    ? stageHistory.filter((entry) => entry.dealId === selectedDeal.id).sort((left, right) => right.enteredAt.localeCompare(left.enteredAt))
    : [];
  const stageEntry = selectedHistory.find((entry) => !entry.exitedAt);
  const enteredAt = stageEntry?.enteredAt ?? selectedDeal?.createdAt;
  const elapsedDays = enteredAt ? Math.max(0, Math.floor((Date.now() - Date.parse(enteredAt)) / 86400000)) : null;
  const isStagnant = Boolean(currentStage && currentStage.stagnationDaysThreshold > 0
    && elapsedDays !== null && elapsedDays >= currentStage.stagnationDaysThreshold);

  useEffect(() => {
    if (!selectedItem) return;
    setContactName(selectedDeal?.contactName ?? selectedLead?.contact ?? selectedClient?.contactPerson ?? '');
    setContactPhone(selectedDeal?.contactPhone ?? selectedLead?.contactPhone ?? selectedClient?.phone ?? '');
    setWhatsapp(selectedDeal?.whatsapp ?? selectedLead?.whatsapp ?? '');
    setTelegram(selectedDeal?.telegram ?? selectedLead?.telegram ?? '');
    setContactError('');
  }, [selectedKey, selectedDeal, selectedLead, selectedClient, selectedItem]);

  const saveContactChannels = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactError('');
    if (!hasCompleteCommunicationChannels({ contactPhone, whatsapp, telegram })) {
      setContactError('Enter a valid phone, WhatsApp number, and Telegram username or number before quotation or tender stages.');
      return;
    }
    if (selectedDeal) {
      setDeals((current) => current.map((deal) => deal.id === selectedDeal.id
        ? { ...deal, contactName: contactName.trim(), contactPhone: contactPhone.trim(), whatsapp: whatsapp.trim(), telegram: telegram.trim() }
        : deal));
    } else if (selectedLead) {
      setLeads((current) => current.map((lead) => lead.id === selectedLead.id
          ? { ...lead, contact: contactName.trim() || lead.contact, contactPhone: contactPhone.trim(), whatsapp: whatsapp.trim(), telegram: telegram.trim() }
          : lead));
    }
  };

  const addActivity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItem) return;
    const data = new FormData(event.currentTarget);
    const type = activityModal === 'meeting' ? 'meeting' : activityModal === 'quote' ? 'quote' : 'note';
    const amount = type === 'quote' ? Number(data.get('quoteAmount')) : undefined;
    const currency = type === 'quote' ? String(data.get('quoteCurrency')) as 'MVR' | 'USD' : undefined;
    const insurer = String(data.get('insurer') ?? '').trim();
    const activity: Activity = {
      id: `activity-${crypto.randomUUID()}`,
      clientId: selectedClient?.id ?? selectedItem.clientId ?? '',
      ...(selectedDeal ? { dealId: selectedDeal.id } : {}),
      ...(insurer ? { insurer } : {}),
      type,
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
      date: new Date().toISOString(),
      userId: user.id,
      ...(amount !== undefined && currency ? { quoteAmount: amount, quoteCurrency: currency } : {}),
    };
    setActivities([activity, ...activities]);
    setActivityModal(null);
  };

  const convertLead = () => {
    if (!selectedLead) return;
    if (!hasCompleteCommunicationChannels(selectedLead)) {
      setContactError('Complete phone, WhatsApp, and Telegram before converting this lead to a deal.');
      return;
    }
    if (!selectedClient || !hasCompleteClientProfile(selectedClient)) {
      setContactError('Complete the company profile before converting this lead to a deal.');
      return;
    }
    const existing = allDeals.find((deal) => deal.leadId === selectedLead.id || deal.id === selectedLead.dealId);
    if (existing) {
      setSelectedKey(`deal:${existing.id}`);
      return;
    }
    const product = products.find((item) => item.code === selectedLead.productCode);
    const pipeline = pipelines.find((item) => item.id === selectedLead.pipelineId && item.isActive);
    const firstStage = pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id)
      .sort((left, right) => left.stageOrder - right.stageOrder)[0];
    if (!product || !pipeline || !firstStage) {
      setContactError('The lead needs a valid product, active pipeline, and configured first stage before conversion.');
      return;
    }
    const value = selectedLead.value ?? selectedLead.sumInsured ?? selectedLead.premium;
    const deal: Deal = {
      id: `deal-${crypto.randomUUID()}`,
      leadId: selectedLead.id,
      pipelineId: pipeline.id,
      createdAt: new Date().toISOString(),
      client: selectedLead.client,
      clientId: selectedLead.clientId,
      contactName: selectedLead.contact,
      contactEmail: selectedLead.contactEmail,
      contactPhone: selectedLead.contactPhone,
      whatsapp: selectedLead.whatsapp,
      telegram: selectedLead.telegram,
      product: product.name,
      productCode: product.code,
      value,
      weighted: Math.round(value * firstStage.winProbabilityPct) / 100,
      brokerageRatePct: product.standardBrokerageRatePct,
      brokerageCommission: calculateBrokerageCommission(value, product),
      currency: selectedLead.currency ?? 'MVR',
      ...(selectedLead.exchangeRate ? { exchangeRate: selectedLead.exchangeRate } : {}),
      stage: firstStage.name,
      probability: firstStage.winProbabilityPct,
      ownerId: selectedLead.ownerId,
      closeDate: selectedLead.closeDate ?? selectedLead.renewalDate,
      insurer: 'Not assigned',
      source: selectedLead.source,
      notes: selectedLead.notes,
    };
    setDeals((current) => [deal, ...current]);
    setLeads((current) => current.map((lead) => lead.id === selectedLead.id ? { ...lead, dealId: deal.id } : lead));
    setStageHistory((current) => [...current, {
      id: `stage-${crypto.randomUUID()}`,
      tenantId: TENANT_ID,
      dealId: deal.id,
      fromStageId: null,
      toStageId: firstStage.id,
      enteredAt: new Date().toISOString(),
      exitedAt: null,
      durationSeconds: null,
    }]);
    setSelectedKey(`deal:${deal.id}`);
  };

  const applyStageChange = (target: PipelineStage, reason?: string) => {
    if (!selectedDeal || !currentStage) return;
    const now = new Date().toISOString();
    const lost = isLostStage(target.name);
    const bound = isBoundStage(target.name);
    if (lost && !reason) {
      setMoveError('A loss reason is mandatory.');
      return;
    }
    setStageHistory((current) => {
      const hasOpenEntry = current.some((entry) => entry.dealId === selectedDeal.id && !entry.exitedAt);
      const next = current.map((entry) => {
        if (entry.dealId !== selectedDeal.id || entry.exitedAt) return entry;
        const durationSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(entry.enteredAt)) / 1000));
        return { ...entry, exitedAt: now, durationSeconds };
      });
      if (!hasOpenEntry) {
        const enteredAt = selectedDeal.createdAt ?? now;
        next.push({
          id: `stage-${crypto.randomUUID()}`,
          tenantId: TENANT_ID,
          dealId: selectedDeal.id,
          fromStageId: null,
          toStageId: currentStage.id,
          enteredAt,
          exitedAt: now,
          durationSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(enteredAt)) / 1000)),
        });
      }
      const audit: StageHistoryAudit = {
        id: `stage-${crypto.randomUUID()}`,
        tenantId: TENANT_ID,
        dealId: selectedDeal.id,
        fromStageId: currentStage.id,
        toStageId: target.id,
        enteredAt: now,
        exitedAt: null,
        durationSeconds: null,
        ...(lost ? { outcome: 'lost' as const, lossReason: reason } : bound ? { outcome: 'won' as const } : {}),
      };
      return [...next, audit];
    });
    const invoiceId = `invoice-for-${selectedDeal.id}`;
    const policyExpiry = selectedDeal.policyExpiry ?? selectedClient?.expiry;
    const renewalPipeline = pipelines.find((pipeline) => pipeline.isActive && pipeline.code.toLowerCase() === 'renewals');
    const renewalStage = pipelineStages.filter((stage) => stage.pipelineId === renewalPipeline?.id)
      .sort((left, right) => left.stageOrder - right.stageOrder)[0];
    const renewalDealId = `renewal-for-${selectedDeal.id}`;
    setDeals((current) => {
      const updated = current.map((deal) => deal.id === selectedDeal.id
        ? {
          ...deal,
          stage: target.name,
          probability: lost ? 0 : target.winProbabilityPct,
          weighted: Math.round(deal.value * (lost ? 0 : target.winProbabilityPct)) / 100,
          ...(lost ? { disposition: 'lost' as const, lossReason: reason } : bound ? {
            disposition: 'won' as const,
            linkedInvoiceId: invoiceId,
            policyExpiry,
            renewalDealId: policyExpiry && renewalStage ? renewalDealId : deal.renewalDealId,
          } : {}),
        }
        : deal);
      if (!bound || !policyExpiry || !renewalPipeline || !renewalStage
        || current.some((deal) => deal.id === renewalDealId)) return updated;
      const renewalValue = selectedClient?.premium ?? selectedDeal.value;
      return [...updated, {
        id: renewalDealId,
        pipelineId: renewalPipeline.id,
        createdAt: now,
        renewalForClientId: selectedClient?.id,
        renewalForDealId: selectedDeal.id,
        renewalExpiry: policyExpiry,
        policyExpiry,
        client: selectedDeal.client,
        product: selectedDeal.product,
        productCode: selectedDeal.productCode,
        value: renewalValue,
        weighted: Math.round(renewalValue * renewalStage.winProbabilityPct) / 100,
        currency: selectedDeal.currency,
        ...(selectedDeal.exchangeRate ? { exchangeRate: selectedDeal.exchangeRate } : {}),
        stage: renewalStage.name,
        probability: renewalStage.winProbabilityPct,
        ownerId: selectedDeal.ownerId,
        closeDate: dateBefore(policyExpiry, 90),
        insurer: selectedDeal.insurer,
        nextActivityAt: dateBefore(policyExpiry, 90),
        nextActivityTitle: 'Start 90-day renewal retention review',
      }];
    });
    if (bound && !invoices.some((invoice) => invoice.linkedDealId === selectedDeal.id)) {
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      setInvoices([...invoices, {
        id: invoiceId,
        number: `INV-${selectedDeal.id.slice(-8).toUpperCase()}`,
        clientId: selectedClient?.id ?? '',
        clientName: selectedDeal.client,
        insurer: selectedDeal.insurer,
        policyNo: selectedDeal.id,
        issueDate: now.slice(0, 10),
        dueDate,
        status: 'Pending',
        items: [{ description: `Premium for ${selectedDeal.product}`, qty: 1, unitPrice: selectedDeal.value, vatRate: 0 }],
        installments: [{ id: `${invoiceId}-installment`, label: 'Single Payment', due: dueDate, amount: selectedDeal.value, paid: false }],
        currency: selectedDeal.currency,
        linkedDealId: selectedDeal.id,
      }]);
    }
    setMoveStage(null);
    setLossReason('');
    setMoveError('');
  };

  const requestStageChange = (target: PipelineStage) => {
    if (!selectedDeal || target.id === currentStage?.id) return;
    if (requiresCommunicationChannels(target.name) && !hasCompleteCommunicationChannels(selectedDeal)) {
      setContactError('Quotation and tender stages require a valid phone, WhatsApp number, and Telegram username or number.');
      return;
    }
    if (requiresCommunicationChannels(target.name) && (!selectedClient || !hasCompleteClientProfile(selectedClient))) {
      setContactError('Complete the company profile before moving this deal to a quotation or tender stage.');
      return;
    }
    setContactError('');
    if (isLostStage(target.name) || isBoundStage(target.name)) {
      setMoveStage(target);
      setLossReason('');
      setMoveError('');
      return;
    }
    applyStageChange(target);
  };

  const visibleQuotes = quotes.map((quote) => ({
    ...quote,
    insurer: quote.insurer ?? quote.description.match(/Insurer:\s*([^;]+)/i)?.[1] ?? 'Insurer',
  }));

  return (
    <div className="grid min-h-[calc(100vh-8rem)] grid-cols-1 gap-3 xl:h-[calc(100vh-8rem)] xl:min-h-0 xl:grid-cols-[280px_minmax(350px,1fr)_360px]">
      <aside className="glass flex min-h-[320px] flex-col overflow-hidden rounded-2xl xl:min-h-0">
        <div className="border-b border-ink-600 p-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold text-white">Deals & Leads</h2><p className="mt-1 text-xs text-muted">{records.length} records</p></div>
            <button type="button" className="btn-primary !px-2.5 !py-2" onClick={onCreateDeal} aria-label="Create deal"><Plus size={15} /></button>
          </div>
          <input className="input mt-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, product, stage…" aria-label="Search deals and leads" />
          <select className="input mt-2" value={productFilter} onChange={(event) => setProductFilter(event.target.value)} aria-label="Filter by product">
            <option value="">All products</option>
            {products.map((product) => <option key={product.code} value={product.code}>{product.code} · {product.name}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {records.map(({ kind, item, key }) => (
            <button key={key} type="button" onClick={() => setSelectedKey(key)}
              className={`w-full border-b border-ink-700/60 p-3 text-left transition ${selected?.key === key ? 'border-l-2 border-l-brand-400 bg-brand-500/10' : 'hover:bg-ink-750/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{item.client}</div>
                  <div className="mt-1 truncate text-xs text-muted">{kind === 'deal' ? (item as Deal).product : (item as Lead).title}</div>
                </div>
                <Badge variant={kind === 'deal' ? 'brand' : 'muted'}>{kind}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="pill border border-ink-600 bg-ink-800 text-muted !px-2 !py-0.5">{item.productCode ?? 'No product'}</span>
                <Badge variant={stageBadgeTone(kind === 'deal' ? (item as Deal).stage : (item as Lead).funnelStage)}>
                  {kind === 'deal' ? (item as Deal).stage : (item as Lead).funnelStage}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-brand-300">
                {formatAmount(kind === 'deal' ? (item as Deal).value : (item as Lead).value ?? (item as Lead).premium, kind === 'deal' ? (item as Deal).currency : (item as Lead).currency ?? 'MVR')}
              </div>
            </button>
          ))}
          {records.length === 0 && <div className="p-5 text-center text-sm text-muted">No matching deals or leads.</div>}
        </div>
        <button type="button" className="btn-ghost m-3" onClick={onCreateDeal}><Plus size={14} /> New deal</button>
      </aside>

      <main className="glass min-h-[460px] overflow-y-auto rounded-2xl p-5 xl:min-h-0">
        {!selectedItem ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <ShieldCheck size={30} className="text-brand-400" /><h2 className="mt-3 font-semibold text-white">Your placement workspace</h2>
            <p className="mt-1 text-sm text-muted">Select a lead or deal to see its complete lifecycle and activity.</p>
          </div>
        ) : <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-600 pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-brand-400/10 p-3 text-brand-300"><Building2 size={20} /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-white">{selectedItem.client}</h1><Badge variant={selectedDeal ? 'brand' : 'muted'}>{selectedDeal ? 'Deal' : 'Lead'}</Badge></div>
                <p className="mt-1 text-sm text-muted">{selectedDeal?.product ?? selectedProduct?.name ?? selectedLead?.productCode} · {selectedPipeline?.name ?? 'No pipeline'} · Ref {selectedItem.id}</p>
              </div>
            </div>
            {selectedDeal && <button type="button" className="btn-ghost !py-1.5" onClick={() => onEditDeal(selectedDeal)}>Edit deal</button>}
          </div>

          <section className="mt-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><FileText size={15} className="text-brand-300" /> Placement overview</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <OverviewStat label="Insured value" value={formatAmount(selectedDeal?.value ?? selectedLead?.value ?? selectedLead?.sumInsured ?? 0, selectedDeal?.currency ?? selectedLead?.currency ?? 'MVR')} />
              <OverviewStat label="Win probability" value={`${selectedDeal?.probability ?? '—'}%`} />
              <OverviewStat label="Expected close" value={formatDate(selectedDeal?.closeDate ?? selectedLead?.closeDate ?? selectedLead?.renewalDate)} />
              <OverviewStat label="Brokerage estimate" value={formatAmount(selectedDeal?.brokerageCommission ?? selectedLead?.brokerageCommission ?? 0, selectedDeal?.currency ?? selectedLead?.currency ?? 'MVR')} />
            </div>
            {selectedProduct && <div className="mt-3 rounded-xl border border-ink-600 bg-ink-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-sm font-medium text-white">{selectedProduct.code} · {selectedProduct.name}</div><div className="mt-1 text-xs text-muted">{selectedProduct.category} · {selectedProduct.classType} · {selectedProduct.salesCycleVelocity ?? '14–30 Days'} cycle</div></div>
                <Badge variant={selectedProduct.riskLevel === 'Very High' || selectedProduct.riskLevel === 'High' ? 'hot' : 'muted'}>{selectedProduct.riskLevel ?? 'Medium'} risk</Badge>
              </div>
              <div className="mt-2 text-xs text-muted"><span className="text-white">Underwriting intake:</span> {selectedProduct.keyUnderwritingIntakeArtifacts ?? 'Completed proposal form, asset/risk schedule and prior claims history'}</div>
            </div>}
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><UserRound size={15} className="text-brand-300" /> Contact details</h2>
              <div className="space-y-2 text-sm">
                <p className="text-white">{selectedDeal?.contactName ?? selectedLead?.contact ?? selectedClient?.contactPerson ?? 'Contact not set'}</p>
                <p className="flex items-center gap-2 text-muted"><Phone size={13} /> {selectedDeal?.contactPhone ?? selectedLead?.contactPhone ?? selectedClient?.phone ?? 'Phone missing'}</p>
                <p className="flex items-center gap-2 text-muted"><MessageSquare size={13} /> WhatsApp: {selectedDeal?.whatsapp ?? selectedLead?.whatsapp ?? 'Missing'}</p>
                <p className="text-muted">Telegram: {selectedDeal?.telegram ?? selectedLead?.telegram ?? 'Missing'}</p>
                <p className="text-muted">{selectedDeal?.contactEmail ?? selectedLead?.contactEmail ?? selectedClient?.email ?? 'Email not set'}</p>
              </div>
            </div>
            <form className="rounded-xl border border-ink-600 bg-ink-900/30 p-4" onSubmit={saveContactChannels}>
              <h2 className="mb-3 text-sm font-semibold text-white">Update communication channels</h2>
              <div className="grid grid-cols-2 gap-2">
                <input className="input col-span-2" aria-label="Contact name" placeholder="Contact name" value={contactName} onChange={(event) => setContactName(event.target.value)} />
                <input className="input" aria-label="Phone" placeholder="Phone *" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                <input className="input" aria-label="WhatsApp" placeholder="WhatsApp *" type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
                <input className="input col-span-2" aria-label="Telegram" placeholder="Telegram / @username *" value={telegram} onChange={(event) => setTelegram(event.target.value)} />
              </div>
              {contactError && <p role="alert" className="mt-2 text-xs text-hot">{contactError}</p>}
              <button type="submit" className="btn-ghost mt-3 !py-1.5"><Check size={13} /> Save contact channels</button>
            </form>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock3 size={15} className="text-brand-300" /> History & activity</h2>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={() => setActivityModal('meeting')}><CalendarDays size={13} /> Meeting</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={() => setActivityModal('note')}><Plus size={13} /> Note</button>
              </div>
            </div>
            <div className="relative space-y-3 border-l border-ink-600 pl-4">
              {selectedDeal?.createdAt && <TimelineItem title="Deal created" description={`${selectedDeal.product} · ${selectedDeal.stage}`} date={selectedDeal.createdAt} />}
              {selectedLead?.lastActivity && <TimelineItem title="Lead activity" description={`${selectedLead.lastActivity}${selectedLead.notes ? ` · ${selectedLead.notes}` : ''}`} date={selectedLead.closeDate ?? selectedLead.renewalDate} />}
              {selectedHistory.map((entry) => {
                const target = pipelineStages.find((stage) => stage.id === entry.toStageId)?.name ?? 'Pipeline stage';
                return <TimelineItem key={entry.id} title={`Stage: ${target}`} description={entry.lossReason ? `Loss reason: ${entry.lossReason}` : entry.details ?? ''} date={entry.enteredAt} />;
              })}
              {selectedActivities.map((activity) => <TimelineItem key={activity.id} title={activity.title} description={activity.description} date={activity.date} />)}
              {!selectedActivities.length && !selectedHistory.length && !selectedLead?.lastActivity && !selectedDeal?.createdAt && <p className="text-sm text-muted">No activity has been recorded yet.</p>}
            </div>
          </section>
        </>}
      </main>

      <aside className="space-y-3">
        <section className="glass rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div><h2 className="text-sm font-semibold text-white">Placement pipeline</h2><p className="mt-1 text-xs text-muted">{selectedPipeline?.name ?? 'Pipeline not configured'}</p></div>
            {selectedDeal && <Badge variant={selectedDeal.disposition === 'won' ? 'win' : selectedDeal.disposition === 'lost' ? 'hot' : 'brand'}>{selectedDeal.probability}%</Badge>}
          </div>
          {selectedDeal ? stages.length > 0 ? <ol className="mt-4 space-y-1">
            {stages.map((stage) => {
              const done = Boolean(currentStage && stage.stageOrder < currentStage.stageOrder);
              const active = currentStage?.id === stage.id;
              return <li key={stage.id}>
                <button type="button" onClick={() => requestStageChange(stage)} disabled={active || selectedDeal.disposition === 'won' || selectedDeal.disposition === 'lost'}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition disabled:cursor-default ${active ? 'border border-brand-400/40 bg-brand-400/10' : 'hover:bg-ink-800'}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${active ? 'border-brand-400 bg-brand-400 text-black' : done ? 'border-win bg-win/10 text-win' : 'border-ink-600 text-muted'}`}>{done ? <Check size={12} /> : stage.stageOrder}</span>
                  <span className="min-w-0 flex-1"><span className={`block text-xs ${active ? 'font-semibold text-white' : 'text-muted'}`}>{stage.name}</span><span className="text-[10px] text-muted">{stage.winProbabilityPct}% · SLA {stage.stagnationDaysThreshold ? `${stage.stagnationDaysThreshold}d` : '—'}</span></span>
                  {active && <ArrowRight size={13} className="text-brand-300" />}
                </button>
              </li>;
            })}
          </ol> : <p className="mt-3 text-xs text-muted">This deal’s pipeline has no configured stages.</p> : selectedLead ? <div className="mt-3 rounded-lg border border-ink-600 bg-ink-900/40 p-3">
            <p className="text-xs text-muted">Convert a qualified lead into a deal to begin the placement stage workflow.</p>
            {!hasCompleteCommunicationChannels(selectedLead) && <p className="mt-2 text-xs text-warm">Complete valid phone, WhatsApp, and Telegram details first.</p>}
            <button type="button" className="btn-primary mt-3 w-full !py-1.5" onClick={convertLead}><ArrowRight size={13} /> Convert to deal</button>
          </div> : <p className="mt-3 text-xs text-muted">Select a lead or deal.</p>}
          {isStagnant && <p className="mt-3 flex items-start gap-2 rounded-lg border border-hot/30 bg-hot/10 p-2 text-xs text-hot"><AlertTriangle size={14} className="shrink-0" /> This deal exceeded the {currentStage?.stagnationDaysThreshold}-day stage SLA.</p>}
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={15} className="text-brand-300" /> Compliance alerts</h2>
          <div className="mt-3 space-y-2 text-xs">
            {selectedItem && !hasCompleteCommunicationChannels(selectedItem)
              ? <p className="flex gap-2 text-warm"><AlertTriangle size={14} className="shrink-0" /> Phone, WhatsApp and Telegram must be complete before tender or quotation.</p>
              : <p className="flex gap-2 text-win"><Check size={14} /> Communication details are complete.</p>}
            {selectedClient?.accountStatus === 'draft' && <p className="flex gap-2 text-warm"><AlertTriangle size={14} /> Customer profile is still a draft.</p>}
            {selectedProduct?.isStatutoryMandatory && <p className="flex gap-2 text-warm"><AlertTriangle size={14} /> Statutory mandatory cover: confirm compliance evidence.</p>}
            {selectedProduct && <p className="text-muted">Required intake: {selectedProduct.keyUnderwritingIntakeArtifacts}</p>}
          </div>
        </section>

        <section className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Wallet size={15} className="text-brand-300" /> Quotes comparison</h2>
            <button type="button" className="btn-ghost !px-2 !py-1" disabled={!selectedItem} onClick={() => setActivityModal('quote')}><Plus size={12} /> Quote</button>
          </div>
          {visibleQuotes.length ? <div className="overflow-x-auto"><table className="w-full min-w-52 text-left text-xs">
            <thead className="text-[10px] uppercase text-muted"><tr><th className="pb-2 font-medium">Insurer</th><th className="pb-2 text-right font-medium">Premium</th><th className="pb-2 text-right font-medium">Date</th></tr></thead>
            <tbody>{visibleQuotes.map((quote) => <tr key={quote.id} className="border-t border-ink-700/60"><td className="py-2 text-white">{quote.insurer}</td><td className="py-2 text-right text-brand-300">{formatAmount(quote.quoteAmount ?? 0, quote.quoteCurrency ?? 'MVR')}</td><td className="py-2 text-right text-muted">{formatDate(quote.date)}</td></tr>)}</tbody>
          </table></div> : <p className="text-xs text-muted">No insurer quotes recorded. Add quotes to compare premium and terms.</p>}
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-white">Binding actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost !px-2 !py-2 text-xs" disabled={!selectedDeal} onClick={() => setActivityModal('quote')}><FileText size={13} /> Add quote</button>
            <button type="button" className="btn-primary !px-2 !py-2 text-xs" disabled={!selectedDeal || !stages.find((stage) => isBoundStage(stage.name))} onClick={() => {
              const finalStage = stages.find((stage) => isBoundStage(stage.name));
              if (finalStage) requestStageChange(finalStage);
            }}><ShieldCheck size={13} /> Bind policy</button>
          </div>
          {selectedDeal?.linkedInvoiceId && <p className="mt-2 text-xs text-win">Invoice generated for this bound deal.</p>}
        </section>
      </aside>

      <Modal open={Boolean(activityModal)} onClose={() => setActivityModal(null)}
        title={activityModal === 'meeting' ? 'Log meeting' : activityModal === 'quote' ? 'Add insurer quote' : 'Add note'}
        subtitle={selectedItem?.client}
        footer={<><button type="button" className="btn-ghost" onClick={() => setActivityModal(null)}>Cancel</button><button type="submit" form="workspace-activity-form" className="btn-primary">Save activity</button></>}>
        <form id="workspace-activity-form" onSubmit={addActivity} className="space-y-3">
          <Field label="Title"><input className="input" name="title" required maxLength={120} placeholder={activityModal === 'meeting' ? 'Client placement review' : activityModal === 'quote' ? 'Commercial terms' : 'Activity note'} /></Field>
          {activityModal === 'quote' && <>
            <Field label="Insurer"><input className="input" name="insurer" required placeholder="Insurer name" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Premium"><input className="input" name="quoteAmount" type="number" min="0" step="0.01" required /></Field><Field label="Currency"><select className="input" name="quoteCurrency" defaultValue="MVR"><option>MVR</option><option>USD</option></select></Field></div>
          </>}
          <Field label={activityModal === 'meeting' ? 'Meeting notes' : activityModal === 'quote' ? 'Terms / coverage notes' : 'Note'}><textarea className="input min-h-24" name="description" required placeholder="Record the client discussion, terms, or next steps." /></Field>
        </form>
      </Modal>

      <Modal open={Boolean(moveStage)} onClose={() => { setMoveStage(null); setMoveError(''); }} title={moveStage && isLostStage(moveStage.name) ? 'Close deal as lost' : 'Confirm policy binding'} subtitle={`${selectedDeal?.client} · ${moveStage?.name}`}
        footer={<><button type="button" className="btn-ghost" onClick={() => setMoveStage(null)}>Cancel</button><button type="button" className="btn-primary" onClick={() => moveStage && applyStageChange(moveStage, lossReason)}>{moveStage && isLostStage(moveStage.name) ? 'Confirm loss' : 'Confirm binding'}</button></>}>
        <div className="space-y-3">
          {moveStage && isLostStage(moveStage.name)
            ? <Field label="Loss reason (required)"><select className="input" value={lossReason} onChange={(event) => setLossReason(event.target.value)}><option value="">Select a reason</option>{LOSS_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></Field>
            : <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">Confirm that the policy is bound. A pending premium invoice will be created automatically.</p>}
          {moveError && <p role="alert" className="text-sm text-hot">{moveError}</p>}
        </div>
      </Modal>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-ink-600 bg-ink-900/40 p-3"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-1 truncate text-sm font-semibold text-white">{value}</div></div>;
}

function TimelineItem({ title, description, date }: { title: string; description: string; date?: string }) {
  return <div className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-400 bg-ink-950" /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-white">{title}</span><span className="text-[10px] text-muted">{date ? formatDate(date) : ''}</span></div>{description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}
