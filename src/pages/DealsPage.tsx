import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Plus, X } from 'lucide-react';
import type { CompanyContactProfile, Deal, Lead, ProductCode } from '../types';
import {
  DEFAULT_USD_TO_MVR_RATE, formatAmount, formatCurrencyInput, formatCurrencyInputForDisplay,
  parseCurrencyInput, toMvr, type Currency,
} from '../utils/currency';
import { hashParams } from '../utils/navigation';
import DateInput from '../components/ui/DateInput';
import ProductSelect from '../components/ui/ProductSelect';
import { calculateBrokerageCommission } from '../utils/insurance';
import { normalizeDateInput } from '../utils/date';
import {
  hasCompleteCommunicationChannels, isValidPhoneNumber, isValidTelegramContact,
  requiresCommunicationChannels,
} from '../utils/communication';
import { findMatchingContactProfile, linkContactProfile, mergeContactProfiles } from '../utils/contactProfiles';
import DealWorkspace from './DealWorkspace';
import { TENANT_ID } from '../lib/supabase';
import { convertedDealsOnly, linkDealToLead } from '../utils/dealFactory';
import { isTerminalDealStage, isWonPipelineStage } from '../utils/stageSla';

export default function DealsPage() {
  const { deals, setDeals, leads, setLeads, clients, setClients, user, viewAsRole, pipelines, pipelineStages, products, invoices, setStageHistory, vendors, users, quotationRequests } = useApp();
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
  const [dealVendorId, setDealVendorId] = useState('');
  const [dealInsurer, setDealInsurer] = useState('');
  const [dealProbability, setDealProbability] = useState('');
  const [dealIntent, setDealIntent] = useState<Deal['intentTier']>('P3');
  const [dealCloseDate, setDealCloseDate] = useState('');
  const [dealNextActivityAt, setDealNextActivityAt] = useState('');
  const [dealNextActivityTitle, setDealNextActivityTitle] = useState('');
  const [pendingLeadDeletion, setPendingLeadDeletion] = useState<Lead | null>(null);
  const [pendingDealDeletion, setPendingDealDeletion] = useState<Deal | null>(null);
  const [deletionRestriction, setDeletionRestriction] = useState<{ title: string; message: string } | null>(null);
  const [dealSource, setDealSource] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);
  const [legacyRemark, setLegacyRemark] = useState('');
  const [legacyError, setLegacyError] = useState('');
  const [legacyPipelineId, setLegacyPipelineId] = useState('');
  const [legacyClientId, setLegacyClientId] = useState('');
  const [legacyVendorId, setLegacyVendorId] = useState('');
  const [legacyOwnerId, setLegacyOwnerId] = useState(user.id);
  const [stageFilter, setStageFilter] = useState(() => hashParams().get('stage') ?? '');
  const [pipelineFilter, setPipelineFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
  const visibleDeals = convertedDealsOnly(deals, leads).filter((deal) => {
    if (pipelineFilter && deal.pipelineId !== pipelineFilter) return false;
    if (stageFilter && deal.stage !== stageFilter) return false;
    if (ownerFilter && deal.ownerId !== ownerFilter) return false;
    if (vendorFilter && deal.vendorId !== vendorFilter) return false;
    const configuredStage = pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage);
    if (statusFilter === 'open' && isTerminalDealStage(deal.stage, deal.disposition, configuredStage)) return false;
    if (statusFilter === 'won' && !(deal.disposition === 'won' || configuredStage?.isClosedWon || (!configuredStage && isWonPipelineStage(deal.stage)))) return false;
    if (statusFilter === 'lost' && !(deal.disposition === 'lost' || configuredStage?.isClosedLost)) return false;
    if (dealIdFilter && deal.id !== dealIdFilter) return false;
    if (dealFilter === 'won') {
      if (deal.disposition) return deal.disposition === 'won';
      return deal.disposition === 'won' || configuredStage?.isClosedWon || (!configuredStage && isWonPipelineStage(deal.stage));
    }
    return true;
  });
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const insurerOptions = vendors.filter((vendor) => ['Insurer', 'Reinsurer'].includes(vendor.vendorType) && vendor.status === 'active');
  useEffect(() => {
    if (!legacyPipelineId && activePipelines[0]) setLegacyPipelineId(activePipelines[0].id);
    if (!legacyClientId && clients[0]) setLegacyClientId(clients[0].id);
    if (!legacyVendorId && insurerOptions[0]) setLegacyVendorId(insurerOptions[0].id);
  }, [activePipelines, clients, insurerOptions, legacyClientId, legacyPipelineId, legacyVendorId]);
  const availableStages = pipelineStages
    .filter((stage) => stage.pipelineId === createPipelineId)
    .sort((a, b) => a.stageOrder - b.stageOrder);
  const stageFilterOptions = [...new Set(pipelineStages
    .filter((stage) => activePipelines.some((pipeline) => pipeline.id === stage.pipelineId))
    .filter((stage) => !pipelineFilter || stage.pipelineId === pipelineFilter)
    .sort((left, right) => left.stageOrder - right.stageOrder)
    .map((stage) => stage.name))];
  const parsedDealAmount = parseCurrencyInput(dealAmount);
  useEffect(() => {
    const firstStage = availableStages[0];
    if (!firstStage) {
      setSelectedStageId('');
    } else if (!availableStages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(firstStage.id);
    }
  }, [availableStages, selectedStageId]);
  const openLegacyImport = () => {
    if (!['admin', 'sales'].includes(viewAsRole ?? user.role)) return;
    setLegacyPipelineId(activePipelines[0]?.id ?? '');
    setLegacyClientId(clients[0]?.id ?? '');
    setLegacyVendorId(insurerOptions[0]?.id ?? '');
    setLegacyOwnerId(user.id);
    setLegacyRemark('');
    setLegacyError('');
    setLegacyImportOpen(true);
  };

  const submitLegacyImport = () => {
    if (!['admin', 'sales'].includes(viewAsRole ?? user.role)) return;
    if (!legacyClientId || !legacyPipelineId || !legacyRemark.trim()) {
      setLegacyError('Select a client and pipeline and enter a remark before importing.');
      return;
    }
    const pipeline = pipelines.find((item) => item.id === legacyPipelineId) ?? activePipelines[0];
    const stage = pipelineStages.filter((item) => item.pipelineId === pipeline?.id).sort((left, right) => left.stageOrder - right.stageOrder)[0];
    const client = clients.find((item) => item.id === legacyClientId);
    if (!pipeline || !stage || !client) {
      setLegacyError('Choose a valid client and pipeline with at least one configured stage.');
      return;
    }
    const now = new Date().toISOString();
    const dealId = `deal-${crypto.randomUUID()}`;
    const product = products.find((item) => item.code === client.productCode);
    const linked = linkDealToLead({
      id: dealId,
      pipelineId: pipeline.id,
      client: client.name,
      clientId: client.id,
      product: product?.name ?? client.productCode ?? 'Legacy import',
      productCode: product?.code ?? client.productCode ?? 'MOTOR',
      value: 0,
      weighted: 0,
      currency: 'MVR',
      stage: stage.name,
      probability: stage.winProbabilityPct,
      ownerId: legacyOwnerId,
      closeDate: client.expiry ?? now.slice(0, 10),
      insurer: insurerOptions.find((vendor) => vendor.id === legacyVendorId)?.name ?? client.insurer ?? 'Not assigned',
      vendorId: legacyVendorId || undefined,
      source: 'Legacy import',
      notes: legacyRemark.trim(),
      proposalSummary: legacyRemark.trim(),
      createdAt: now,
      stageChangedAt: now,
    }, undefined, { source: 'Legacy import', client });
    setLeads((current) => [linked.lead, ...current]);
    setDeals((current) => [linked.deal, ...current]);
    setStageHistory((current) => [...current, {
      id: `stage-${crypto.randomUUID()}`,
      tenantId: TENANT_ID,
      dealId: dealId,
      fromStageId: null,
      toStageId: stage.id,
      enteredAt: now,
      exitedAt: null,
      durationSeconds: null,
      details: `Legacy import comment: ${legacyRemark.trim()}`,
    }]);
    setLegacyImportOpen(false);
    setLegacyRemark('');
    setLegacyError('');
  };

  const openEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setSelectedProduct(products.find((product) => product.code === deal.productCode || product.name === deal.product));
    setCreatePipelineId(deal.pipelineId ?? '');
    setSelectedStageId(pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage)?.id ?? '');
    setDealCurrency(deal.currency);
    setDealAmount(formatCurrencyInputForDisplay(String(deal.value)));
    setExchangeRate(deal.currency === 'USD' ? String(deal.exchangeRate ?? DEFAULT_USD_TO_MVR_RATE) : '');
    setDealClient(deal.client);
    const matchedVendor = vendors.find((vendor) => vendor.id === deal.vendorId)
      ?? vendors.find((vendor) => vendor.name.trim().toLowerCase() === deal.insurer.trim().toLowerCase());
    setDealVendorId(matchedVendor?.id ?? '');
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
    if (deal.linkedInvoiceId || invoices.some((invoice) => invoice.linkedDealId === deal.id)) {
      setDeletionRestriction({
        title: 'Cannot delete deal',
        message: 'This Deal cannot be deleted while it is linked to an invoice.',
      });
      return;
    }
    const hasLinkedRecord = leads.some((lead) => lead.id === deal.leadId || lead.dealId === deal.id)
      || quotationRequests.some((request) => request.dealId === deal.id);
    if (hasLinkedRecord) {
      setDeletionRestriction({
        title: 'Cannot delete deal',
        message: 'This Deal cannot be deleted because it has a linked Lead or quotation request.',
      });
      return;
    }
    setPendingDealDeletion(deal);
  };

  const requestDeleteLead = (lead: Lead) => {
    if ((viewAsRole ?? user.role) !== 'admin') return;
    const linkedDealIds = new Set(deals
      .filter((deal) => deal.id === lead.dealId || deal.leadId === lead.id)
      .map((deal) => deal.id));
    if (lead.dealId) linkedDealIds.add(lead.dealId);
    const linkedRequest = quotationRequests.some((request) => request.leadId === lead.id || linkedDealIds.has(request.dealId));
    if (deals.some((deal) => deal.id === lead.dealId || deal.leadId === lead.id) || linkedRequest) {
      setDeletionRestriction({
        title: 'Cannot delete lead',
        message: linkedRequest
          ? 'This Lead cannot be deleted because it has a linked quotation request.'
          : 'This Lead cannot be deleted because it has an associated Deal. Reassign or delete the associated Deal first.',
      });
      return;
    }
    setPendingLeadDeletion(lead);
  };

  const confirmDeleteLead = () => {
    if (!pendingLeadDeletion || (viewAsRole ?? user.role) !== 'admin') return;
    const linkedDealIds = new Set(deals
      .filter((deal) => deal.id === pendingLeadDeletion.dealId || deal.leadId === pendingLeadDeletion.id)
      .map((deal) => deal.id));
    if (pendingLeadDeletion.dealId) linkedDealIds.add(pendingLeadDeletion.dealId);
    if (quotationRequests.some((request) => request.leadId === pendingLeadDeletion.id || linkedDealIds.has(request.dealId))) {
      setDeletionRestriction({
        title: 'Cannot delete lead',
        message: 'This Lead cannot be deleted while it is linked to a quotation request.',
      });
      setPendingLeadDeletion(null);
      return;
    }
    setClients((current) => current.map((client) => ({
      ...client,
      contacts: (client.contacts ?? []).map((contact) => ({
        ...contact,
        linkedLeadIds: (contact.linkedLeadIds ?? []).filter((id) => id !== pendingLeadDeletion.id),
      })),
    })));
    setLeads((current) => current.filter((lead) => lead.id !== pendingLeadDeletion.id));
    setPendingLeadDeletion(null);
  };

  const confirmDeleteDeal = () => {
    if (!pendingDealDeletion || (viewAsRole ?? user.role) !== 'admin') return;
    const dealId = pendingDealDeletion.id;
    if (leads.some((lead) => lead.id === pendingDealDeletion.leadId || lead.dealId === dealId)
      || quotationRequests.some((request) => request.dealId === dealId)) {
      setDeletionRestriction({
        title: 'Cannot delete deal',
        message: 'This Deal cannot be deleted while it has a linked Lead or quotation request.',
      });
      setPendingDealDeletion(null);
      return;
    }
    setDeals((current) => current.filter((deal) => deal.id !== dealId));
    setClients((current) => current.map((client) => ({
      ...client,
      contacts: (client.contacts ?? []).map((contact) => ({
        ...contact,
        linkedDealIds: (contact.linkedDealIds ?? []).filter((id) => id !== dealId),
      })),
    })));
    setLeads((current) => current.map((lead) => lead.dealId === dealId
      ? {
        ...lead,
        dealId: undefined,
        contacts: (lead.contacts ?? []).map((contact) => ({
          ...contact,
          linkedDealIds: (contact.linkedDealIds ?? []).filter((id) => id !== dealId),
        })),
      }
      : lead));
    setPendingDealDeletion(null);
  };

  const createDeal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingDeal) {
      setCreateError('Deals must be created by converting a lead or importing a legacy deal.');
      return;
    }
    const data = new FormData(event.currentTarget);
    const value = parseCurrencyInput(dealAmount);
    const closeDate = dealCloseDate;
    const currency = String(data.get('currency')) as Currency;
    const rate = currency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    const dealPhone = String(data.get('contactPhone') ?? '').trim();
    const dealWhatsapp = String(data.get('whatsapp') ?? '').trim();
    const dealTelegram = String(data.get('telegram') ?? '').trim();
    const selectedStage = availableStages.find((stage) => stage.id === selectedStageId);
    const probability = selectedStage?.winProbabilityPct ?? Number(dealProbability);
    const selectedInsurer = insurerOptions.find((vendor) => vendor.id === dealVendorId)
      ?? insurerOptions.find((vendor) => vendor.name.trim().toLowerCase() === dealInsurer.trim().toLowerCase());
    const resolvedInsurerName = selectedInsurer?.name.trim() || dealInsurer.trim();
    if (!dealClient.trim() || !resolvedInsurerName || !selectedProduct || !createPipelineId || !selectedStageId || !dealCurrency || !dealCloseDate || !dealProbability) {
      setCreateError('Complete Client, Insurer, Insurance Product, Pipeline, Stage, Currency, Insured Value, Probability, and Expected Close Date.');
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      setCreateError('Enter a non-negative total insured value.');
      return;
    }
    if (currency === 'USD' && (!Number.isFinite(rate) || !rate || rate <= 0)) {
      setCreateError('Enter a valid positive exchange rate.');
      return;
    }
    if ((dealPhone && !isValidPhoneNumber(dealPhone))
      || (dealWhatsapp && !isValidPhoneNumber(dealWhatsapp))
      || (dealTelegram && !isValidTelegramContact(dealTelegram))) {
      setCreateError('Enter valid Maldives phone numbers starting with +960 and seven subscriber digits. Telegram may also be a username.');
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
    const dealId = editingDeal.id;
    const dealClientRecord = clients.find((client) => client.name === dealClient.trim());
    const contactName = String(data.get('contactName') ?? '').trim();
    const contactEmail = String(data.get('contactEmail') ?? '').trim();
    const matchingContact = findMatchingContactProfile(dealClientRecord?.contacts, {
      id: editingDeal?.contactProfileId ?? '',
      email: contactEmail,
      phone: dealPhone,
    });
    const validContact = Boolean(contactName
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
      && isValidPhoneNumber(dealPhone));
    const dealContactProfile: CompanyContactProfile | undefined = validContact ? {
      id: matchingContact?.id ?? editingDeal?.contactProfileId ?? `contact-${crypto.randomUUID()}`,
      name: contactName,
      role: matchingContact?.role ?? editingDeal?.contactRole ?? 'Decision Maker',
      email: contactEmail,
      phone: dealPhone,
      whatsapp: dealWhatsapp,
      telegram: dealTelegram,
      linkedLeadIds: matchingContact?.linkedLeadIds ?? [],
      linkedDealIds: matchingContact?.linkedDealIds ?? [],
    } : undefined;
    const deal: Deal = {
      ...editingDeal,
      id: dealId,
      leadId: editingDeal.leadId,
      pipelineId: String(data.get('pipelineId')),
      createdAt: editingDeal?.createdAt ?? now,
      stageChangedAt: !editingDeal || (stage && editingDeal.stage !== stage.name)
        ? now
        : editingDeal.stageChangedAt ?? editingDeal.createdAt ?? now,
      client: dealClient.trim(),
      clientId: dealClientRecord?.id,
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
      insurer: resolvedInsurerName,
      vendorId: selectedInsurer?.id ?? editingDeal?.vendorId ?? undefined,
      contactName,
      contactEmail,
      contactPhone: dealPhone,
      whatsapp: dealWhatsapp,
      telegram: dealTelegram,
      contactProfileId: dealContactProfile?.id,
      contactRole: dealContactProfile?.role,
      intentTier: dealIntent,
      source: dealSource.trim(),
      notes: dealNotes.trim(),
      proposalSummary: dealNotes.trim(),
      nextActivityAt,
      nextActivityTitle,
      nextActivityCreatedAt,
    };
    setDeals(deals.map((item) => item.id === editingDeal.id ? deal : item));
    setClients((current) => current.map((client) => {
      const contacts = (client.contacts ?? []).map((contact) => ({
        ...contact,
        linkedDealIds: (contact.linkedDealIds ?? []).filter((id) => id !== deal.id),
      }));
      if (client.id !== dealClientRecord?.id) return { ...client, contacts };
      return {
        ...client,
        contacts: dealContactProfile
          ? mergeContactProfiles(contacts, [linkContactProfile(dealContactProfile, deal.leadId, deal.id)])
          : contacts,
      };
    }));
    if (stage && editingDeal.stage !== stage.name) {
      const previousStage = pipelineStages.find((item) => item.pipelineId === editingDeal.pipelineId && item.name === editingDeal.stage);
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
      <DealWorkspace
        deals={visibleDeals}
        dealsPageMode
        onEditDeal={openEditDeal}
        onDeleteLead={requestDeleteLead}
        onDeleteDeal={requestDeleteDeal}
        onOpenFilters={() => setFilterOpen(true)}
        onLegacyImport={['admin', 'sales'].includes(viewAsRole ?? user.role) ? openLegacyImport : undefined}
        pipelineFilter={pipelineFilter}
        onPipelineFilterChange={setPipelineFilter}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Edit Deal"
        subtitle="Update the opportunity, financials, pipeline, and client context."
        footer={<><button type="button" className="btn-ghost" onClick={() => { setCreateOpen(false); setEditingDeal(null); }}><X size={14} /> Cancel</button><button type="submit" form="new-deal-form" className="btn-primary"><><Plus size={14} /> Update Deal</></button></>}
      >
        <form id="new-deal-form" onSubmit={createDeal} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type of Insurance Product *"><ProductSelect pipelines={pipelines} name="productCode" required value={selectedProduct?.code ?? ''} onChange={setSelectedProduct} /></Field>
          {selectedProduct && <div className="sm:col-span-2 rounded-lg border border-ink-600 bg-ink-900/40 p-3 text-xs text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-white">{selectedProduct.code} · {selectedProduct.name}</span><span>{selectedProduct.riskLevel ?? 'Medium'} risk · {selectedProduct.salesCycleVelocity ?? '14–30 Days'}</span></div>
            <p className="mt-1"><span className="text-white">Underwriting intake:</span> {selectedProduct.keyUnderwritingIntakeArtifacts}</p>
          </div>}
          <Field label="Pipeline"><select className="input" name="pipelineId" required value={createPipelineId} onChange={(event) => setCreatePipelineId(event.target.value)}><option value="">Select pipeline</option>{activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></Field>
          <Field label="Client *"><select className="input" name="client" required value={dealClient} onChange={(event) => setDealClient(event.target.value)}><option value="">Select client</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Insurer *"><select className="input" name="insurer" required value={dealVendorId} onChange={(event) => {
            const selected = insurerOptions.find((vendor) => vendor.id === event.target.value);
            setDealVendorId(event.target.value);
            setDealInsurer(selected?.name ?? '');
          }}><option value="">Select insurer</option>{insurerOptions.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></Field>
          <Field label="Primary contact"><input className="input" name="contactName" defaultValue={editingDeal?.contactName ?? ''} /></Field>
          <Field label="Contact email"><input className="input" name="contactEmail" type="email" defaultValue={editingDeal?.contactEmail ?? ''} /></Field>
          <Field label="Phone"><input className="input" name="contactPhone" type="tel" defaultValue={editingDeal?.contactPhone ?? ''} /></Field>
          <Field label="WhatsApp"><input className="input" name="whatsapp" type="tel" defaultValue={editingDeal?.whatsapp ?? ''} /></Field>
          <Field label="Telegram"><input className="input" name="telegram" defaultValue={editingDeal?.telegram ?? ''} placeholder="@username or phone" /></Field>
          <Field label="Stage"><select className="input" name="stage" required value={selectedStageId} onChange={(event) => setSelectedStageId(event.target.value)}><option value="">Select stage</option>{availableStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
          <Field label="Currency"><select className="input" name="currency" required value={dealCurrency} onChange={(event) => { const currency = event.target.value as Currency | ''; setDealCurrency(currency); setDealAmount(''); setExchangeRate(currency === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : ''); }}><option value="">Select currency</option><option value="MVR">MVR</option><option value="USD">USD</option></select></Field>
          <Field label={`Total Insured Value${dealCurrency ? ` (${dealCurrency})` : ''}`}><input className="input" name="value" type="text" inputMode="decimal" required value={dealAmount} onChange={(event) => setDealAmount(formatCurrencyInput(event.target.value))} onBlur={() => setDealAmount(formatCurrencyInputForDisplay(dealAmount))} /></Field>
          {selectedProduct && Number.isFinite(parsedDealAmount) && parsedDealAmount >= 0 && <p className="self-end text-sm text-brand-300">Tentative brokerage/profit budget: {formatAmount(calculateBrokerageCommission(parsedDealAmount, selectedProduct), dealCurrency || 'MVR')} ({selectedProduct.standardBrokerageRatePct}%)</p>}
          {dealCurrency === 'USD' && <Field label="Exchange rate (1 USD = MVR)"><input className="input" name="exchangeRate" type="number" min="0.000001" step="any" required value={exchangeRate} onChange={(event) => { setExchangeRate(event.target.value); setCreateError(''); }} /></Field>}
          {dealCurrency === 'USD' && parsedDealAmount > 0 && Number(exchangeRate) > 0 && <p className="sm:col-span-2 text-sm text-muted">Equivalent: {formatAmount(toMvr(parsedDealAmount, 'USD', Number(exchangeRate)), 'MVR')}</p>}
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
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Deals" size="sm" footer={<><button type="button" className="btn-ghost" onClick={() => { setPipelineFilter(''); setStageFilter(''); setOwnerFilter(''); setVendorFilter(''); setStatusFilter(''); }}>Clear</button><button type="button" className="btn-primary" onClick={() => setFilterOpen(false)}>Apply Filter</button></>}>
        <div className="space-y-3">
          <Field label="Pipeline"><select className="input" value={pipelineFilter} onChange={(event) => { setPipelineFilter(event.target.value); setStageFilter(''); }}><option value="">All pipelines</option>{activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></Field>
          <Field label="Stage"><select className="input" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{stageFilterOptions.map((stage) => <option key={stage}>{stage}</option>)}</select></Field>
          <Field label="Owner"><select className="input" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="">All owners</option>{users.filter((member) => member.role === 'admin' || member.role === 'sales').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
          <Field label="Vendor"><select className="input" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option value="">All vendors</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></Field>
          <Field label="Status"><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select></Field>
        </div>
      </Modal>
      <Modal
        open={legacyImportOpen}
        onClose={() => setLegacyImportOpen(false)}
        title="Import legacy deal"
        subtitle="Create a deal linked to a converted lead so the historical record remains on the lead/deal lifecycle."
        footer={<><button type="button" className="btn-ghost" onClick={() => setLegacyImportOpen(false)}>Cancel</button><button type="button" className="btn-primary" onClick={submitLegacyImport} disabled={!legacyRemark.trim()}>Create legacy deal</button></>}
      >
        <div className="space-y-3">
          <Field label="Client *"><select className="input" value={legacyClientId} onChange={(event) => setLegacyClientId(event.target.value)}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Pipeline *"><select className="input" value={legacyPipelineId} onChange={(event) => setLegacyPipelineId(event.target.value)}><option value="">Select pipeline</option>{activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></Field>
          <Field label="Insurer / vendor"><select className="input" value={legacyVendorId} onChange={(event) => setLegacyVendorId(event.target.value)}><option value="">Select insurer</option>{insurerOptions.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></Field>
          <Field label="Owner"><select className="input" value={legacyOwnerId} onChange={(event) => setLegacyOwnerId(event.target.value)}>{users.filter((member) => member.role === 'admin' || member.role === 'sales').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
          <Field label="Remark *"><textarea className="input min-h-20" required aria-required="true" value={legacyRemark} onChange={(event) => { setLegacyRemark(event.target.value); setLegacyError(''); }} placeholder="Why this legacy deal is being imported" /></Field>
          {legacyError && <p role="alert" className="text-sm text-hot">{legacyError}</p>}
        </div>
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
        subtitle={`Delete “${[pendingDealDeletion?.client, pendingDealDeletion?.product].filter(Boolean).join(' — ')}”? This action cannot be undone.`}
        size="sm"
        footer={<><button type="button" className="btn-ghost" onClick={() => setPendingDealDeletion(null)}>Cancel</button><button type="button" className="btn-danger" disabled={(viewAsRole ?? user.role) !== 'admin'} onClick={confirmDeleteDeal}>Delete Deal</button></>}
      >
        <p className="text-sm text-muted">The deal will be removed from its pipeline and unlinked from its lead. Deals with an associated invoice cannot be deleted.</p>
      </Modal>
      <Modal
        open={Boolean(deletionRestriction)}
        onClose={() => setDeletionRestriction(null)}
        title={deletionRestriction?.title ?? 'Cannot delete record'}
        size="sm"
        footer={<button type="button" className="btn-primary" onClick={() => setDeletionRestriction(null)}>Close</button>}
      >
        <p role="alert" className="text-sm text-muted">{deletionRestriction?.message}</p>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}
