import { useEffect, useState, type FormEvent } from 'react';
import { INSURERS } from '../data/catalogs';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Plus, Filter, X } from 'lucide-react';
import type { Deal, Lead, ProductCode } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../utils/currency';
import { hashParams } from '../utils/navigation';
import DateInput from '../components/ui/DateInput';
import ProductSelect from '../components/ui/ProductSelect';
import { calculateBrokerageCommission } from '../utils/insurance';
import { normalizeDateInput } from '../utils/date';
import { hasCompleteCommunicationChannels, requiresCommunicationChannels } from '../utils/communication';
import DealWorkspace from './DealWorkspace';
import { TENANT_ID } from '../lib/supabase';

export default function DealsPage() {
  const { deals, setDeals, setLeads, clients, user, viewAsRole, pipelines, pipelineStages, products, invoices, setStageHistory } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [createPipelineId, setCreatePipelineId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductCode>();
  const [selectedStageId, setSelectedStageId] = useState('');
  const [dealCurrency, setDealCurrency] = useState<Currency | ''>('');
  const [dealAmount, setDealAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [createError, setCreateError] = useState('');
  const [dealClient, setDealClient] = useState('');
  const [dealInsurer, setDealInsurer] = useState('');
  const [dealProbability, setDealProbability] = useState('');
  const [dealIntent, setDealIntent] = useState<Deal['intentTier']>('P3');
  const [dealCloseDate, setDealCloseDate] = useState('');
  const [dealNextActivityAt, setDealNextActivityAt] = useState('');
  const [dealNextActivityTitle, setDealNextActivityTitle] = useState('');
  const [pendingLeadDeletion, setPendingLeadDeletion] = useState<Lead | null>(null);
  const [pendingDealDeletion, setPendingDealDeletion] = useState<Deal | null>(null);
  const [dealSource, setDealSource] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState(() => hashParams().get('stage') ?? '');
  const [dealFilter, setDealFilter] = useState(() => hashParams().get('filter') ?? '');
  const [dealIdFilter, setDealIdFilter] = useState(() => hashParams().get('id') ?? '');
  useEffect(() => {
    const applyHashFilters = () => {
      const params = hashParams();
      setStageFilter(params.get('stage') ?? '');
      setDealFilter(params.get('filter') ?? '');
      setDealIdFilter(params.get('id') ?? '');
    };
    window.addEventListener('hashchange', applyHashFilters);
    return () => window.removeEventListener('hashchange', applyHashFilters);
  }, []);
  const visibleDeals = deals.filter((deal) => {
    if (stageFilter && deal.stage !== stageFilter) return false;
    if (dealIdFilter && deal.id !== dealIdFilter) return false;
    if (dealFilter === 'won') {
      if (deal.disposition) return deal.disposition === 'won';
      const stage = deal.stage.trim().toLowerCase();
      return stage.includes('won') || stage.includes('bound') || stage.includes('renewed') || stage === 'policy issued';
    }
    return true;
  });
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const availableStages = pipelineStages
    .filter((stage) => stage.pipelineId === createPipelineId)
    .sort((a, b) => a.stageOrder - b.stageOrder);
  useEffect(() => {
    const firstStage = availableStages[0];
    if (!firstStage) {
      setSelectedStageId('');
    } else if (!availableStages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(firstStage.id);
    }
  }, [availableStages, selectedStageId]);
  const openCreate = () => {
    setEditingDeal(null);
    setCreatePipelineId('');
    setSelectedProduct(undefined);
    setSelectedStageId('');
    setDealCurrency('');
    setDealAmount('');
    setExchangeRate('');
    setCreateError('');
    setDealClient('');
    setDealInsurer('');
    setDealProbability('');
    setDealIntent('P3');
    setDealCloseDate('');
    setDealNextActivityAt('');
    setDealNextActivityTitle('');
    setDealSource('');
    setDealNotes('');
    setCreateOpen(true);
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setSelectedProduct(products.find((product) => product.code === deal.productCode || product.name === deal.product));
    setCreatePipelineId(deal.pipelineId ?? '');
    setSelectedStageId(pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage)?.id ?? '');
    setDealCurrency(deal.currency);
    setDealAmount(String(deal.value));
    setExchangeRate(deal.currency === 'USD' ? String(deal.exchangeRate ?? DEFAULT_USD_TO_MVR_RATE) : '');
    setDealClient(deal.client);
    setDealInsurer(deal.insurer);
    setDealProbability(String(deal.probability));
    setDealIntent(deal.intentTier ?? 'P3');
    setDealCloseDate(deal.closeDate);
    setDealNextActivityAt(deal.nextActivityAt ?? '');
    setDealNextActivityTitle(deal.nextActivityTitle ?? '');
    setDealSource(deal.source ?? '');
    setDealNotes(deal.notes ?? deal.proposalSummary ?? '');
    setCreateError('');
    setCreateOpen(true);
  };

  const requestDeleteDeal = (deal: Deal) => {
    if ((viewAsRole ?? user.role) !== 'admin') return;
    if (deal.linkedInvoiceId || invoices.some((invoice) => invoice.linkedDealId === deal.id)) return;
    setPendingDealDeletion(deal);
  };

  const requestDeleteLead = (lead: Lead) => {
    if ((viewAsRole ?? user.role) !== 'admin') return;
    if (deals.some((deal) => deal.id === lead.dealId || deal.leadId === lead.id)) {
      window.alert('This Lead cannot be deleted because it has an associated Deal. Reassign or delete the associated Deal first.');
      return;
    }
    setPendingLeadDeletion(lead);
  };

  const confirmDeleteLead = () => {
    if (!pendingLeadDeletion || (viewAsRole ?? user.role) !== 'admin') return;
    setLeads((current) => current.filter((lead) => lead.id !== pendingLeadDeletion.id));
    setPendingLeadDeletion(null);
  };

  const confirmDeleteDeal = () => {
    if (!pendingDealDeletion || (viewAsRole ?? user.role) !== 'admin') return;
    const dealId = pendingDealDeletion.id;
    setDeals((current) => current.filter((deal) => deal.id !== dealId));
    setLeads((current) => current.map((lead) => lead.dealId === dealId ? { ...lead, dealId: undefined } : lead));
    setPendingDealDeletion(null);
  };

  const createDeal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = Number(dealAmount);
    const closeDate = dealCloseDate;
    const currency = String(data.get('currency')) as Currency;
    const rate = currency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    const dealPhone = String(data.get('contactPhone') ?? '').trim();
    const dealWhatsapp = String(data.get('whatsapp') ?? '').trim();
    const dealTelegram = String(data.get('telegram') ?? '').trim();
    const selectedStage = availableStages.find((stage) => stage.id === selectedStageId);
    const probability = selectedStage?.winProbabilityPct ?? Number(dealProbability);
    if (!dealClient.trim() || !dealInsurer.trim() || !selectedProduct || !createPipelineId || !selectedStageId || !dealCurrency || !dealCloseDate || !dealProbability) {
      setCreateError('Complete Client, Insurer, Insurance Product, Pipeline, Stage, Currency, Insured Value, Probability, and Expected Close Date.');
      return;
    }
    if (currency === 'USD' && (!Number.isFinite(rate) || !rate || rate <= 0)) {
      setCreateError('Enter a valid positive exchange rate.');
      return;
    }
    if (selectedStage && requiresCommunicationChannels(selectedStage.name)
      && !hasCompleteCommunicationChannels({ contactPhone: dealPhone, whatsapp: dealWhatsapp, telegram: dealTelegram })) {
      setCreateError('Enter a valid phone, WhatsApp number, and Telegram username or number before quotation or tender.');
      return;
    }
    if (editingDeal && selectedStage && selectedStage.name !== editingDeal.stage) {
      setCreateError('Move deal stages from the workspace stepper so compliance checks, audit history, and binding actions are applied.');
      return;
    }
    if (!editingDeal && selectedStage
      && /(lost|declined|bound|won|renewed|immediate cover|policy issued)/i.test(selectedStage.name)) {
      setCreateError('New deals must start in an open placement stage. Use the workspace to close or bind a deal.');
      return;
    }
    const normalizedCloseDate = normalizeDateInput(closeDate);
    if (!normalizedCloseDate) {
      setCreateError('Enter a valid expected close date in DD-MMM-YYYY format.');
      return;
    }
    const now = new Date().toISOString();
    const stage = availableStages.find((item) => item.id === selectedStageId);
    const nextActivityAt = dealNextActivityAt || undefined;
    const nextActivityTitle = dealNextActivityTitle.trim() || undefined;
    const hasNextActivity = Boolean(nextActivityAt || nextActivityTitle);
    const sameNextActivity = editingDeal?.nextActivityAt === nextActivityAt
      && editingDeal?.nextActivityTitle === nextActivityTitle;
    const nextActivityCreatedAt = hasNextActivity
      ? sameNextActivity ? editingDeal?.nextActivityCreatedAt ?? now : now
      : undefined;
    const deal: Deal = {
      ...(editingDeal ?? {}),
      id: editingDeal?.id ?? `d-${Date.now()}`,
      pipelineId: String(data.get('pipelineId')),
      createdAt: editingDeal?.createdAt ?? now,
      stageChangedAt: !editingDeal || (stage && editingDeal.stage !== stage.name)
        ? now
        : editingDeal.stageChangedAt ?? editingDeal.createdAt ?? now,
      client: dealClient.trim(),
      clientId: clients.find((client) => client.name === dealClient.trim())?.id,
      product: selectedProduct.name,
      productCode: selectedProduct.code,
      value,
      weighted: Math.round(value * probability) / 100,
      brokerageRatePct: selectedProduct.standardBrokerageRatePct,
      brokerageCommission: calculateBrokerageCommission(value, selectedProduct),
      currency,
      ...(rate ? { exchangeRate: rate } : {}),
      stage: stage?.name ?? '',
      probability,
      ownerId: user.id,
      closeDate: normalizedCloseDate,
      insurer: dealInsurer.trim(),
      contactName: String(data.get('contactName') ?? '').trim(),
      contactEmail: String(data.get('contactEmail') ?? '').trim(),
      contactPhone: dealPhone,
      whatsapp: dealWhatsapp,
      telegram: dealTelegram,
      intentTier: dealIntent,
      source: dealSource.trim(),
      notes: dealNotes.trim(),
      proposalSummary: dealNotes.trim(),
      nextActivityAt,
      nextActivityTitle,
      nextActivityCreatedAt,
    };
    setDeals(editingDeal ? deals.map((item) => item.id === editingDeal.id ? deal : item) : [deal, ...deals]);
    if (stage && (!editingDeal || editingDeal.stage !== stage.name)) {
      const previousStage = editingDeal
        ? pipelineStages.find((item) => item.pipelineId === editingDeal.pipelineId && item.name === editingDeal.stage)
        : undefined;
      setStageHistory((current) => [
        ...current.map((entry) => {
          if (entry.dealId !== deal.id || entry.exitedAt) return entry;
          const enteredAt = Date.parse(entry.enteredAt);
          return {
            ...entry,
            exitedAt: now,
            durationSeconds: Number.isFinite(enteredAt)
              ? Math.max(0, Math.floor((Date.now() - enteredAt) / 1000))
              : 0,
          };
        }),
        {
          id: `stage-${crypto.randomUUID()}`,
          tenantId: TENANT_ID,
          dealId: deal.id,
          fromStageId: previousStage?.id ?? null,
          toStageId: stage.id,
          enteredAt: now,
          exitedAt: null,
          durationSeconds: null,
        },
      ]);
    }
    setCreateOpen(false);
    setEditingDeal(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold text-white">Deals pipeline</h1><p className="mt-1 text-xs text-muted">Kanban stage progression, validation, activity timeline, and placement inspection.</p></div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block"><div className="text-[10px] uppercase text-muted">Open deals</div><div className="text-sm font-semibold text-white">{deals.length}</div></div>
          <button type="button" className="btn-ghost !py-1.5" onClick={() => setFilterOpen(true)}><Filter size={14} /> Filter</button>
          <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={openCreate} disabled={activePipelines.length === 0} title={activePipelines.length === 0 ? 'Create an active pipeline before adding deals' : undefined}>+ Deal</button>
        </div>
      </div>
      <DealWorkspace deals={visibleDeals} onCreateDeal={openCreate} onEditDeal={openEditDeal} onDeleteLead={requestDeleteLead} onDeleteDeal={requestDeleteDeal} />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editingDeal ? 'Edit Deal' : 'Create Deal'}
        subtitle={editingDeal ? 'Update the opportunity, financials, pipeline, and client context.' : 'Add a sales opportunity to the pipeline.'}
        footer={<><button type="button" className="btn-ghost" onClick={() => { setCreateOpen(false); setEditingDeal(null); }}><X size={14} /> Cancel</button><button type="submit" form="new-deal-form" className="btn-primary">{editingDeal ? <><Plus size={14} /> Update Deal</> : '+ Deal'}</button></>}
      >
        <form id="new-deal-form" onSubmit={createDeal} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type of Insurance Product *"><ProductSelect pipelines={pipelines} name="productCode" required value={selectedProduct?.code ?? ''} onChange={setSelectedProduct} /></Field>
          {selectedProduct && <div className="sm:col-span-2 rounded-lg border border-ink-600 bg-ink-900/40 p-3 text-xs text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-white">{selectedProduct.code} · {selectedProduct.name}</span><span>{selectedProduct.riskLevel ?? 'Medium'} risk · {selectedProduct.salesCycleVelocity ?? '14–30 Days'}</span></div>
            <p className="mt-1"><span className="text-white">Underwriting intake:</span> {selectedProduct.keyUnderwritingIntakeArtifacts}</p>
          </div>}
          <Field label="Pipeline"><select className="input" name="pipelineId" required value={createPipelineId} onChange={(event) => setCreatePipelineId(event.target.value)}><option value="">Select pipeline</option>{activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></Field>
          <Field label="Client *"><select className="input" name="client" required value={dealClient} onChange={(event) => setDealClient(event.target.value)}><option value="">Select client</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Insurer *"><select className="input" name="insurer" required value={dealInsurer} onChange={(event) => setDealInsurer(event.target.value)}><option value="">Select insurer</option>{INSURERS.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></Field>
          <Field label="Primary contact"><input className="input" name="contactName" defaultValue={editingDeal?.contactName ?? ''} /></Field>
          <Field label="Contact email"><input className="input" name="contactEmail" type="email" defaultValue={editingDeal?.contactEmail ?? ''} /></Field>
          <Field label="Phone"><input className="input" name="contactPhone" type="tel" defaultValue={editingDeal?.contactPhone ?? ''} /></Field>
          <Field label="WhatsApp"><input className="input" name="whatsapp" type="tel" defaultValue={editingDeal?.whatsapp ?? ''} /></Field>
          <Field label="Telegram"><input className="input" name="telegram" defaultValue={editingDeal?.telegram ?? ''} placeholder="@username or phone" /></Field>
          <Field label="Stage"><select className="input" name="stage" required value={selectedStageId} onChange={(event) => setSelectedStageId(event.target.value)}><option value="">Select stage</option>{availableStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
          <Field label="Currency"><select className="input" name="currency" required value={dealCurrency} onChange={(event) => { const currency = event.target.value as Currency | ''; setDealCurrency(currency); setDealAmount(''); setExchangeRate(currency === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : ''); }}><option value="">Select currency</option><option value="MVR">MVR</option><option value="USD">USD</option></select></Field>
          <Field label={`Total Insured Value${dealCurrency ? ` (${dealCurrency})` : ''}`}><input className="input" name="value" type="number" min="0" step="0.01" required value={dealAmount} onChange={(event) => setDealAmount(event.target.value)} /></Field>
          {selectedProduct && Number(dealAmount) >= 0 && <p className="self-end text-sm text-brand-300">Tentative brokerage/profit budget: {formatAmount(calculateBrokerageCommission(Number(dealAmount), selectedProduct), dealCurrency || 'MVR')} ({selectedProduct.standardBrokerageRatePct}%)</p>}
          {dealCurrency === 'USD' && <Field label="Exchange rate (1 USD = MVR)"><input className="input" name="exchangeRate" type="number" min="0.000001" step="any" required value={exchangeRate} onChange={(event) => { setExchangeRate(event.target.value); setCreateError(''); }} /></Field>}
          {dealCurrency === 'USD' && Number(dealAmount) > 0 && Number(exchangeRate) > 0 && <p className="sm:col-span-2 text-sm text-muted">Equivalent: {formatAmount(toMvr(Number(dealAmount), 'USD', Number(exchangeRate)), 'MVR')}</p>}
          {createError && <p role="alert" className="sm:col-span-2 text-sm text-hot">{createError}</p>}
          <Field label="Stage win probability"><input className="input" name="probability" type="number" value={availableStages.find((stage) => stage.id === selectedStageId)?.winProbabilityPct ?? dealProbability} readOnly aria-readonly="true" /></Field>
          <Field label="Intent Tier">
            <select className="input" name="intentTier" required value={dealIntent} onChange={(event) => setDealIntent(event.target.value as Deal['intentTier'])}>
              <option value="P1">P1 · Ready to Buy</option>
              <option value="P2">P2 · Evaluating</option>
              <option value="P3">P3 · Nurture</option>
            </select>
          </Field>
          <Field label="Expected Close"><DateInput name="closeDate" required value={dealCloseDate} onIsoChange={setDealCloseDate} aria-label="Expected close date" /></Field>
          <Field label="Source"><select className="input" value={dealSource} onChange={(event) => setDealSource(event.target.value)}><option value="">Select source</option><option>Referral</option><option>Website</option><option>Renewal</option><option>Partner</option></select></Field>
          <Field label="Remarks / Notes"><textarea className="input min-h-20" value={dealNotes} onChange={(event) => setDealNotes(event.target.value)} placeholder="Initial scoping, client context, or missing information" /></Field>
          <Field label="Next activity date"><DateInput name="nextActivityAt" value={dealNextActivityAt} onIsoChange={setDealNextActivityAt} aria-label="Next activity date" /></Field>
          <Field label="Next activity"><input className="input" name="nextActivityTitle" value={dealNextActivityTitle} onChange={(event) => setDealNextActivityTitle(event.target.value)} placeholder="e.g. Call client for documents" maxLength={120} /></Field>
        </form>
      </Modal>
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Deals" size="sm" footer={<><button className="btn-ghost" onClick={() => setStageFilter('')}>Clear</button><button className="btn-primary" onClick={() => setFilterOpen(false)}>Apply Filter</button></>}>
        <Field label="Stage"><select className="input" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{[...new Set(deals.map((deal) => deal.stage))].map((stage) => <option key={stage}>{stage}</option>)}</select></Field>
      </Modal>
      <Modal
        open={Boolean(pendingLeadDeletion)}
        onClose={() => setPendingLeadDeletion(null)}
        title="Delete lead?"
        subtitle={`Delete “${pendingLeadDeletion?.title ?? pendingLeadDeletion?.client ?? ''}”? This action cannot be undone.`}
        size="sm"
        footer={<><button type="button" className="btn-ghost" onClick={() => setPendingLeadDeletion(null)}>Cancel</button><button type="button" className="btn-danger" disabled={(viewAsRole ?? user.role) !== 'admin'} onClick={confirmDeleteLead}>Delete Lead</button></>}
      >
        <p className="text-sm text-muted">This lead will be permanently removed from the funnel.</p>
      </Modal>
      <Modal
        open={Boolean(pendingDealDeletion)}
        onClose={() => setPendingDealDeletion(null)}
        title="Delete deal?"
        subtitle={`Delete “${pendingDealDeletion?.client ?? ''}”? This action cannot be undone.`}
        size="sm"
        footer={<><button type="button" className="btn-ghost" onClick={() => setPendingDealDeletion(null)}>Cancel</button><button type="button" className="btn-danger" disabled={(viewAsRole ?? user.role) !== 'admin'} onClick={confirmDeleteDeal}>Delete Deal</button></>}
      >
        <p className="text-sm text-muted">The deal will be removed from its pipeline and unlinked from its lead. Deals with an associated invoice cannot be deleted.</p>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}
