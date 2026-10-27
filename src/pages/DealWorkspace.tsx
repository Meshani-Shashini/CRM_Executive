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

interface TimelineEntry {
  key: string;
  title: string;
  description: string;
  date: string;
  durationMinutes?: number;
}

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
  initialSelectedKey,
  onClose,
}: {
  deals: Deal[];
  onCreateDeal?: () => void;
  onEditDeal?: (deal: Deal) => void;
  initialSelectedKey?: string;
  onClose?: () => void;
}) {
  const {
    activities, setActivities, clients, setClients, deals: allDeals, setDeals, leads, setLeads,
    products, pipelines, pipelineStages, stageHistory, setStageHistory, invoices, setInvoices, user, users,
  } = useApp();
  const [selectedKey, setSelectedKey] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'kanban' | 'inspection'>('kanban');
  const [kanbanPipelineId, setKanbanPipelineId] = useState('');
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [activityModal, setActivityModal] = useState<'meeting' | 'note' | 'quote' | null>(null);
  const [moveStage, setMoveStage] = useState<PipelineStage | null>(null);
  const [lossReason, setLossReason] = useState('');
  const [moveError, setMoveError] = useState('');
  const [stageChangeRemarks, setStageChangeRemarks] = useState('');
  const [stageContactName, setStageContactName] = useState('');
  const [stageContactEmail, setStageContactEmail] = useState('');
  const [stageContactPhone, setStageContactPhone] = useState('');
  const [stageWhatsapp, setStageWhatsapp] = useState('');
  const [stageTelegram, setStageTelegram] = useState('');
  const [stageInsurer, setStageInsurer] = useState('');
  const [intakeComplete, setIntakeComplete] = useState(false);
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
  const relatedLeadId = selectedDeal?.leadId ?? selectedLead?.id;
  const relatedDealId = selectedDeal?.id ?? selectedLead?.dealId;
  const selectedActivities = activities
    .filter((activity) => (Boolean(relatedDealId) && activity.dealId === relatedDealId)
      || (Boolean(relatedLeadId) && activity.leadId === relatedLeadId)
      || (!activity.dealId && !activity.leadId && Boolean(selectedClient) && activity.clientId === selectedClient?.id))
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
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const kanbanPipeline = activePipelines.find((pipeline) => pipeline.id === kanbanPipelineId)
    ?? activePipelines.find((pipeline) => deals.some((deal) => deal.pipelineId === pipeline.id))
    ?? activePipelines[0];
  const kanbanStages = pipelineStages.filter((stage) => stage.pipelineId === kanbanPipeline?.id)
    .sort((left, right) => left.stageOrder - right.stageOrder);
  const timelineEntries: TimelineEntry[] = [
    ...(selectedDeal?.createdAt ? [{
      key: `deal-created-${selectedDeal.id}`,
      title: 'Deal created',
      description: `${selectedDeal.product} · ${selectedDeal.stage}`,
      date: selectedDeal.createdAt,
    }] : []),
    ...(selectedDeal?.nextActivityAt ? [{
      key: `deal-follow-up-${selectedDeal.id}`,
      title: selectedDeal.nextActivityTitle ?? 'Scheduled follow-up',
      description: 'Scheduled activity',
      date: selectedDeal.nextActivityAt,
    }] : []),
    ...(selectedLead?.lastActivity ? [{
      key: `lead-last-activity-${selectedLead.id}`,
      title: 'Lead activity',
      description: `${selectedLead.lastActivity}${selectedLead.notes ? ` · ${selectedLead.notes}` : ''}`,
      date: selectedLead.closeDate ?? selectedLead.renewalDate,
    }] : []),
    ...selectedHistory.map((entry) => {
      const target = pipelineStages.find((stage) => stage.id === entry.toStageId)?.name ?? 'Pipeline stage';
      return {
        key: entry.id,
        title: `Stage: ${target}`,
        description: entry.lossReason ? `Loss reason: ${entry.lossReason}` : entry.details ?? '',
        date: entry.enteredAt,
      };
    }),
    ...selectedActivities.map((activity) => {
      const actor = users.find((person) => person.id === activity.userId);
      const details = [
        activity.description,
        activity.personsMet ? `Persons met: ${activity.personsMet}` : '',
        activity.meetingMode ? `Mode: ${activity.meetingMode}` : '',
        activity.venue ? `Venue: ${activity.venue}` : '',
        activity.outcome ? `Outcome: ${activity.outcome}` : '',
        activity.followUpAction ? `Follow-up: ${activity.followUpAction}` : '',
        activity.userId ? `By ${actor?.name ?? (activity.userId === user.id ? user.name : activity.userId)}` : '',
      ].filter(Boolean).join(' · ');
      return {
        key: activity.id,
        title: activity.title,
        description: details,
        date: activity.date,
        ...(activity.durationMinutes !== undefined ? { durationMinutes: activity.durationMinutes } : {}),
      };
    }),
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));

  useEffect(() => {
    if (!kanbanPipeline || kanbanPipelineId === kanbanPipeline.id) return;
    setKanbanPipelineId(kanbanPipeline.id);
  }, [kanbanPipeline, kanbanPipelineId]);

  useEffect(() => {
    if (!initialSelectedKey) return;
    setSelectedKey(initialSelectedKey);
    setWorkspaceView('inspection');
  }, [initialSelectedKey]);

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
    const activityDate = String(data.get('activityDate') ?? '');
    const meetingMode = String(data.get('meetingMode') ?? '') as Activity['meetingMode'];
    const durationMinutes = type === 'meeting' ? Number(data.get('durationMinutes')) : undefined;
    const activity: Activity = {
      id: `activity-${crypto.randomUUID()}`,
      clientId: selectedClient?.id ?? selectedItem.clientId ?? '',
      ...(selectedLead ? { leadId: selectedLead.id } : selectedDeal?.leadId ? { leadId: selectedDeal.leadId } : {}),
      ...(selectedDeal ? { dealId: selectedDeal.id } : {}),
      ...(insurer ? { insurer } : {}),
      type,
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
      date: activityDate ? new Date(activityDate).toISOString() : new Date().toISOString(),
      userId: user.id,
      ...(type === 'meeting' ? {
        meetingMode,
        venue: String(data.get('venue') ?? '').trim(),
        personsMet: String(data.get('personsMet') ?? '').trim(),
        outcome: String(data.get('outcome') ?? '').trim(),
        followUpAction: String(data.get('followUpAction') ?? '').trim(),
        durationMinutes,
      } : {}),
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
      contactProfileId: selectedLead.contactProfileId,
      contactRole: selectedLead.contactRole,
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
    if (selectedClient && selectedLead.contactProfileId) {
      setClients((current) => current.map((client) => client.id === selectedClient.id
        ? {
          ...client,
          contacts: (client.contacts ?? []).map((contact) => contact.id === selectedLead.contactProfileId
            ? { ...contact, linkedDealIds: [...new Set([...(contact.linkedDealIds ?? []), deal.id])] }
            : contact),
        }
        : client));
    }
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
    if (!selectedDeal) {
      setMoveError('Select a deal before changing its stage.');
      return;
    }
    if (!currentStage) {
      setMoveError('The deal’s current stage is not configured in its pipeline.');
      return;
    }
    const now = new Date().toISOString();
    const lost = isLostStage(target.name);
    const bound = isBoundStage(target.name);
    if (lost && !reason) {
      setMoveError('A loss reason is mandatory.');
      return;
    }
    const requiresIntake = requiresCommunicationChannels(target.name);
    if (requiresIntake) {
      const errors: string[] = [];
      if (!selectedClient || !hasCompleteClientProfile(selectedClient)) {
        errors.push('Complete the client profile (TIN, country, address, contact, product, and class).');
      }
      if (!hasCompleteCommunicationChannels({ contactPhone: stageContactPhone, whatsapp: stageWhatsapp, telegram: stageTelegram })) {
        errors.push('Enter valid phone, WhatsApp, and Telegram contact details.');
      }
      if (!stageContactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stageContactEmail.trim())) {
        errors.push('Enter the primary contact name and a valid contact email.');
      }
      if (!stageInsurer.trim() || stageInsurer.trim().toLowerCase() === 'not assigned') {
        errors.push('Assign an insurer before progressing to tender or quote comparison.');
      }
      if (!selectedDeal.productCode || !Number.isFinite(selectedDeal.value) || selectedDeal.value <= 0 || !selectedDeal.closeDate) {
        errors.push('Complete the product, insured value, and expected close date.');
      }
      if (!intakeComplete) errors.push(`Confirm completion of required intake: ${selectedProduct?.keyUnderwritingIntakeArtifacts ?? 'proposal form, risk schedule, and claims history'}.`);
      if (errors.length) {
        setMoveError(errors.join(' '));
        return;
      }
    }
    const contactProfileId = selectedDeal.contactProfileId
      ?? (stageContactName.trim() && stageContactEmail.trim() ? `contact-${crypto.randomUUID()}` : undefined);
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
        ...(stageChangeRemarks.trim() ? { details: stageChangeRemarks.trim() } : {}),
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
          contactName: stageContactName.trim(),
          ...(contactProfileId ? {
            contactProfileId,
            contactRole: selectedDeal.contactRole ?? 'Decision Maker',
          } : {}),
          contactEmail: stageContactEmail.trim(),
          contactPhone: stageContactPhone.trim(),
          whatsapp: stageWhatsapp.trim(),
          telegram: stageTelegram.trim(),
          insurer: stageInsurer.trim(),
          intakeCompleted: intakeComplete,
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
    if (selectedClient && contactProfileId && stageContactName.trim() && stageContactEmail.trim()) {
      setClients((current) => current.map((client) => {
        if (client.id !== selectedClient.id) return client;
        const contacts = client.contacts ?? [];
        const profile = {
          id: contactProfileId,
          name: stageContactName.trim(),
          role: selectedDeal.contactRole ?? 'Decision Maker',
          email: stageContactEmail.trim(),
          phone: stageContactPhone.trim(),
          whatsapp: stageWhatsapp.trim(),
          telegram: stageTelegram.trim(),
          linkedLeadIds: selectedDeal.leadId ? [selectedDeal.leadId] : [],
          linkedDealIds: [selectedDeal.id],
        };
        const existing = contacts.some((contact) => contact.id === contactProfileId);
        return {
          ...client,
          contacts: existing
            ? contacts.map((contact) => contact.id === contactProfileId ? {
              ...profile,
              linkedLeadIds: [...new Set([...(contact.linkedLeadIds ?? []), ...(profile.linkedLeadIds ?? [])])],
              linkedDealIds: [...new Set([...(contact.linkedDealIds ?? []), selectedDeal.id])],
            } : contact)
            : [...contacts, profile],
        };
      }));
    }
    setActivities([{
      id: `activity-${crypto.randomUUID()}`,
      clientId: selectedClient?.id ?? selectedDeal.clientId ?? '',
      dealId: selectedDeal.id,
      type: 'note',
      title: `Stage changed: ${currentStage?.name ?? selectedDeal.stage} → ${target.name}`,
      description: stageChangeRemarks.trim() || `Deal moved from ${currentStage?.name ?? selectedDeal.stage} to ${target.name}.`,
      date: now,
      userId: user.id,
    }, ...activities]);
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
    setStageChangeRemarks('');
  };

  const requestStageChange = (target: PipelineStage, deal = selectedDeal) => {
    if (!deal || target.name === deal.stage) return;
    setSelectedKey(`deal:${deal.id}`);
    setContactError('');
    setMoveStage(target);
    setLossReason('');
    setMoveError('');
    setStageChangeRemarks('');
    setStageContactName(deal.contactName ?? '');
    setStageContactEmail(deal.contactEmail ?? '');
    setStageContactPhone(deal.contactPhone ?? '');
    setStageWhatsapp(deal.whatsapp ?? '');
    setStageTelegram(deal.telegram ?? '');
    setStageInsurer(deal.insurer ?? '');
    setIntakeComplete(deal.intakeCompleted ?? false);
  };

  const visibleQuotes = quotes.map((quote) => ({
    ...quote,
    insurer: quote.insurer ?? quote.description.match(/Insurer:\s*([^;]+)/i)?.[1] ?? 'Insurer',
  }));

  const assignContactProfile = (profileId: string) => {
    const profile = selectedClient?.contacts?.find((contact) => contact.id === profileId);
    if (!profile) return;
    if (selectedDeal) {
      setDeals((current) => current.map((deal) => deal.id === selectedDeal.id
        ? {
          ...deal,
          contactProfileId: profile.id,
          contactRole: profile.role,
          contactName: profile.name,
          contactEmail: profile.email,
          contactPhone: profile.phone,
          whatsapp: profile.whatsapp,
          telegram: profile.telegram,
        }
        : deal));
      setClients((current) => current.map((client) => client.id === selectedClient?.id
        ? {
          ...client,
          contacts: (client.contacts ?? []).map((contact) => contact.id === profile.id
            ? { ...contact, linkedDealIds: [...new Set([...(contact.linkedDealIds ?? []), selectedDeal.id])] }
            : contact),
        }
        : client));
    } else if (selectedLead) {
      setLeads((current) => current.map((lead) => lead.id === selectedLead.id
        ? {
          ...lead,
          contactProfileId: profile.id,
          contactRole: profile.role,
          contact: profile.name,
          contactEmail: profile.email,
          contactPhone: profile.phone,
          whatsapp: profile.whatsapp,
          telegram: profile.telegram,
        }
        : lead));
      setClients((current) => current.map((client) => client.id === selectedClient?.id
        ? {
          ...client,
          contacts: (client.contacts ?? []).map((contact) => contact.id === profile.id
            ? { ...contact, linkedLeadIds: [...new Set([...(contact.linkedLeadIds ?? []), selectedLead.id])] }
            : contact),
        }
        : client));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-ink-800/60 p-1" role="tablist" aria-label="Deal workspace views">
          <button type="button" role="tab" aria-selected={workspaceView === 'kanban'} onClick={() => setWorkspaceView('kanban')} className={`rounded-md px-3 py-1.5 text-sm ${workspaceView === 'kanban' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}>Kanban</button>
          <button type="button" role="tab" aria-selected={workspaceView === 'inspection'} onClick={() => setWorkspaceView('inspection')} className={`rounded-md px-3 py-1.5 text-sm ${workspaceView === 'inspection' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}>Inspection</button>
        </div>
        {onClose && <button type="button" className="btn-ghost !py-1.5" onClick={onClose}>Back to leads</button>}
      </div>
      {workspaceView === 'kanban' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white">Deals pipeline</h2><p className="mt-1 text-xs text-muted">Drag a deal to another stage to review and save the change.</p></div>
            <select className="input !w-auto" value={kanbanPipeline?.id ?? ''} onChange={(event) => setKanbanPipelineId(event.target.value)} aria-label="Select deal pipeline">
              {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </div>
          {kanbanStages.length ? <div className="overflow-x-auto pb-3">
            <div className="grid min-w-[1200px] gap-3" style={{ gridTemplateColumns: `repeat(${kanbanStages.length}, minmax(190px, 1fr))` }}>
              {kanbanStages.map((stage) => {
                const stageDeals = deals.filter((deal) => deal.pipelineId === kanbanPipeline?.id && deal.stage === stage.name);
                return <section key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  event.preventDefault();
                  const dealId = event.dataTransfer.getData('text/deal-id');
                  const droppedDeal = deals.find((deal) => deal.id === dealId);
                  if (droppedDeal) requestStageChange(stage, droppedDeal);
                }} className="min-w-0 rounded-xl border border-ink-700 bg-ink-900/55 p-2.5">
                  <header className="mb-2 flex items-center justify-between gap-2 px-1">
                    <h3 className="text-sm font-semibold text-white">{stage.name}</h3><Badge variant="muted">{stageDeals.length}</Badge>
                  </header>
                  <div className="max-h-[calc(100vh-310px)] min-h-48 space-y-2 overflow-y-auto rounded-lg bg-ink-950/40 p-1.5">
                    {stageDeals.map((deal) => <button key={deal.id} type="button" draggable
                      onDragStart={(event) => { event.dataTransfer.setData('text/deal-id', deal.id); event.dataTransfer.effectAllowed = 'move'; }}
                      onClick={() => { setSelectedKey(`deal:${deal.id}`); setWorkspaceView('inspection'); }}
                      className="w-full cursor-grab rounded-lg border border-ink-700 bg-ink-800/80 p-3 text-left shadow-sm transition hover:border-brand-400/50 active:cursor-grabbing">
                      <span className="block truncate text-sm font-semibold text-white">{deal.client}</span>
                      <span className="mt-1 block truncate text-xs text-muted">{deal.product} · {deal.insurer}</span>
                      <span className="mt-2 block text-xs text-brand-300">{formatAmount(deal.value, deal.currency)}</span>
                    </button>)}
                    {!stageDeals.length && <p className="py-7 text-center text-[11px] text-muted/60">Drop deals here</p>}
                  </div>
                </section>;
              })}
            </div>
          </div> : <div className="glass rounded-xl p-6 text-center text-sm text-muted">Choose a pipeline with configured stages to view its Kanban board.</div>}
        </div>
      ) : (
    <div className={`grid min-h-[calc(100vh-8rem)] grid-cols-1 gap-3 xl:h-[calc(100vh-8rem)] xl:min-h-0 ${selectedLead ? 'xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)]' : 'xl:grid-cols-[280px_minmax(350px,1fr)_360px]'}`}>
      {!selectedLead && <aside className="glass flex min-h-[320px] flex-col overflow-hidden rounded-2xl xl:min-h-0">
        <div className="border-b border-ink-600 p-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold text-white">Deals & Leads</h2><p className="mt-1 text-xs text-muted">{records.length} records</p></div>
            {onCreateDeal && <button type="button" className="btn-primary !px-2.5 !py-2" onClick={onCreateDeal} aria-label="Create deal"><Plus size={15} /></button>}
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
        {onCreateDeal && <button type="button" className="btn-ghost m-3" onClick={onCreateDeal}><Plus size={14} /> New deal</button>}
      </aside>}

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
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-white">{selectedItem.client}</h1><Badge variant={selectedDeal ? 'brand' : 'muted'}>{selectedDeal ? 'Deal' : 'Lead'}</Badge><Badge variant={stageBadgeTone(selectedDeal?.stage ?? selectedLead?.funnelStage ?? '')}>{selectedDeal?.stage ?? selectedLead?.funnelStage}</Badge>{selectedLead && <><Badge variant={selectedLead.temperature === 'HOT' ? 'hot' : selectedLead.temperature === 'COLD' ? 'cold' : 'warm'}>{selectedLead.temperature}</Badge><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1E2024] text-[10px] font-semibold text-[#8E95A2]" title={users.find((person) => person.id === selectedLead.ownerId)?.name}>{avatarCode(users.find((person) => person.id === selectedLead.ownerId)?.name ?? '')}</span></>}</div>
                <p className="mt-1 text-sm text-muted">{selectedDeal?.product ?? selectedProduct?.name ?? selectedLead?.productCode} · {selectedPipeline?.name ?? 'No pipeline'} · Ref {selectedItem.id}</p>
              </div>
            </div>
            {selectedDeal && onEditDeal && <button type="button" className="btn-ghost !py-1.5" onClick={() => onEditDeal(selectedDeal)}>Edit deal</button>}
          </div>

          {selectedLead ? (
            <div className="mt-5 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              <section>
                <h2 className="mb-4 text-base font-semibold text-white">Client Details</h2>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  <DetailValue label="Name" value={selectedClient?.name ?? selectedLead.client} />
                  <DetailValue label="Identification" value={selectedClient?.tin || '—'} />
                  <DetailValue label="Email" value={selectedLead.contactEmail ?? selectedClient?.email ?? '—'} />
                  <DetailValue label="Phone" value={selectedLead.contactPhone ?? selectedClient?.phone ?? '—'} />
                  <DetailValue label="Address" value={selectedClient?.address || '—'} />
                  <DetailValue label="Country" value={selectedClient?.country || selectedLead.country || '—'} />
                </div>
              </section>
              <section>
                <h2 className="mb-4 text-base font-semibold text-white">Policy Details</h2>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  <DetailValue label="Probability Percentage" value="—" />
                  <DetailValue label="Insurance Type" value={selectedProduct?.name ?? selectedLead.insuranceClass} />
                  <DetailValue label="Current Insurer" value={selectedClient?.insurer || '—'} />
                  <DetailValue label="Current Broker" value="—" />
                  <DetailValue label="Sum Insured" value={formatAmount(selectedLead.sumInsured, selectedLead.currency ?? 'MVR')} />
                  <DetailValue label="Premium Value" value={formatAmount(selectedLead.premium, selectedLead.currency ?? 'MVR')} />
                  <DetailValue label="Currency" value={selectedLead.currency ?? 'MVR'} />
                  <DetailValue label="Expiry / Renewal Date" value={formatDate(selectedLead.renewalDate)} />
                </div>
              </section>
              <section className="sm:col-span-2">
                <h2 className="mb-4 text-base font-semibold text-white">Deal Information</h2>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  <DetailValue label="Deal Owner" value={users.find((person) => person.id === selectedLead.ownerId)?.name ?? selectedLead.ownerId} />
                  <DetailValue label="Contact Role" value={selectedLead.contactRole ?? 'Decision Maker'} />
                  <DetailValue label="Lead Stage" value={selectedLead.funnelStage} />
                  <DetailValue label="Expected Closing Date" value={formatDate(selectedLead.closeDate ?? selectedLead.renewalDate)} />
                  <DetailValue label="Remarks / Notes" value={selectedLead.notes || '—'} />
                  <Field label="Assign company contact">
                    <select className="input" value={selectedLead.contactProfileId ?? ''} onChange={(event) => assignContactProfile(event.target.value)}>
                      <option value="">Current lead contact</option>
                      {(selectedClient?.contacts ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.role} · {profile.name}</option>)}
                    </select>
                  </Field>
                </div>
              </section>
              <section className="sm:col-span-2 rounded-xl border border-ink-700 bg-ink-900/30 p-4">
                <h2 className="mb-3 text-sm font-semibold text-white">Company Contact Profiles</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(selectedClient?.contacts ?? []).map((profile) => <div key={profile.id} className="rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium text-white">{profile.name}</span><Badge variant="muted">{profile.role}</Badge></div>
                    <p className="mt-2 text-muted">{profile.email} · {profile.phone}</p>
                  </div>)}
                  {!(selectedClient?.contacts?.length) && <p className="text-xs text-muted">Contact profiles added through Lead creation will be available here for deal progression.</p>}
                </div>
              </section>
            </div>
          ) : <>
          <section className="mt-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><FileText size={15} className="text-brand-300" /> Placement overview</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <OverviewStat label="Insured value" value={formatAmount(selectedDeal?.value ?? 0, selectedDeal?.currency ?? 'MVR')} />
              <OverviewStat label="Win probability" value={`${selectedDeal?.probability ?? '—'}%`} />
              <OverviewStat label="Expected close" value={formatDate(selectedDeal?.closeDate ?? '')} />
              <OverviewStat label="Brokerage estimate" value={formatAmount(selectedDeal?.brokerageCommission ?? 0, selectedDeal?.currency ?? 'MVR')} />
              <OverviewStat label="Owner / representative" value={users.find((person) => person.id === selectedItem.ownerId)?.name ?? selectedItem.ownerId} />
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
              {selectedClient?.contacts?.length ? <Field label="Assign company contact">
                <select className="input mb-3" value={selectedDeal?.contactProfileId ?? ''} onChange={(event) => assignContactProfile(event.target.value)}>
                  <option value="">Current contact</option>
                  {selectedClient.contacts.map((profile) => <option key={profile.id} value={profile.id}>{profile.role} · {profile.name}</option>)}
                </select>
              </Field> : null}
              <div className="space-y-2 text-sm">
                <p className="text-white">{selectedDeal?.contactName ?? selectedClient?.contactPerson ?? 'Contact not set'}</p>
                <p className="flex items-center gap-2 text-muted"><Phone size={13} /> {selectedDeal?.contactPhone ?? selectedClient?.phone ?? 'Phone missing'}</p>
                <p className="flex items-center gap-2 text-muted"><MessageSquare size={13} /> WhatsApp: {selectedDeal?.whatsapp ?? 'Missing'}</p>
                <p className="text-muted">Telegram: {selectedDeal?.telegram ?? 'Missing'}</p>
                <p className="text-muted">{selectedDeal?.contactEmail ?? selectedClient?.email ?? 'Email not set'}</p>
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
                <button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={() => setActivityModal('meeting')}><CalendarDays size={13} /> Schedule / Log Meeting</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={() => setActivityModal('note')}><Plus size={13} /> Note</button>
              </div>
            </div>
            <div className="relative space-y-3 border-l border-ink-600 pl-4">
              {timelineEntries.map((entry) => <TimelineItem
                key={entry.key}
                title={entry.title}
                description={entry.description}
                date={entry.date}
                durationMinutes={entry.durationMinutes}
              />)}
              {!timelineEntries.length && <p className="text-sm text-muted">No activity has been recorded yet.</p>}
            </div>
          </section>
          </>}
        </>}
      </main>

      {selectedLead ? <aside className="glass min-h-[320px] overflow-y-auto rounded-2xl p-4 xl:min-h-0">
        <h2 className="mb-4 text-sm font-semibold text-white">Activity Timeline</h2>
        <div className="space-y-3">
          {timelineEntries.map((entry) => <div key={entry.key} className="rounded-lg border border-ink-700 bg-ink-800 p-3">
            <div className="text-[10px] text-muted">{formatDate(entry.date)}</div>
            <div className="mt-1 text-xs font-medium text-white">{entry.title}</div>
            {entry.description && <p className="mt-1 text-[11px] leading-relaxed text-muted">{entry.description}</p>}
          </div>)}
          {!timelineEntries.length && <p className="py-8 text-center text-sm text-muted">No activity has been recorded yet.</p>}
        </div>
      </aside> : <aside className="space-y-3">
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
      </aside>}
    </div>
      )}
      <Modal open={Boolean(activityModal)} onClose={() => setActivityModal(null)}
        title={activityModal === 'meeting' ? 'Schedule / Log Meeting' : activityModal === 'quote' ? 'Add insurer quote' : 'Add note'}
        subtitle={selectedItem?.client}
        footer={<><button type="button" className="btn-ghost" onClick={() => setActivityModal(null)}>Cancel</button><button type="submit" form="workspace-activity-form" className="btn-primary">{activityModal === 'meeting' ? 'Save Meeting' : 'Save activity'}</button></>}>
        <form id="workspace-activity-form" onSubmit={addActivity} className="space-y-3">
          <Field label="Title"><input className="input" name="title" required maxLength={120} placeholder={activityModal === 'meeting' ? 'Client placement review' : activityModal === 'quote' ? 'Commercial terms' : 'Activity note'} /></Field>
          {activityModal === 'meeting' && <>
            <Field label="Date & Time *"><input className="input" name="activityDate" type="datetime-local" required defaultValue={localDateTimeInput()} /></Field>
            <Field label="Mode *"><select className="input" name="meetingMode" required defaultValue=""><option value="" disabled>Select meeting mode</option><option>Call</option><option>Online</option><option>Site Visit</option><option>Physical Meeting</option></select></Field>
            <Field label="Venue *"><input className="input" name="venue" required maxLength={200} placeholder="Meeting location or online platform" /></Field>
            <Field label="Persons Met *"><input className="input" name="personsMet" required maxLength={500} placeholder="Stakeholder / client contact names" /></Field>
            <Field label="Duration (minutes) *"><input className="input" name="durationMinutes" type="number" min="1" step="1" required /></Field>
            <Field label="Discussion Notes *"><textarea className="input min-h-24" name="description" required placeholder="Record the topics discussed." /></Field>
            <Field label="Outcome *"><textarea className="input min-h-20" name="outcome" required placeholder="Record decisions or results." /></Field>
            <Field label="Follow-up action *"><textarea className="input min-h-20" name="followUpAction" required placeholder="Record the next action and owner." /></Field>
          </>}
          {activityModal === 'quote' && <>
            <Field label="Insurer"><input className="input" name="insurer" required placeholder="Insurer name" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Premium"><input className="input" name="quoteAmount" type="number" min="0" step="0.01" required /></Field><Field label="Currency"><select className="input" name="quoteCurrency" defaultValue="MVR"><option>MVR</option><option>USD</option></select></Field></div>
          </>}
          {activityModal !== 'meeting' && <Field label={activityModal === 'quote' ? 'Terms / coverage notes' : 'Note'}><textarea className="input min-h-24" name="description" required placeholder="Record the terms, coverage, or next steps." /></Field>}
        </form>
      </Modal>

      <Modal open={Boolean(moveStage)} onClose={() => { setMoveStage(null); setMoveError(''); }} title="Update deal stage" subtitle={`${selectedDeal?.client} · ${moveStage?.name}`} size="lg"
        footer={<><button type="button" className="btn-ghost" onClick={() => { setMoveStage(null); setMoveError(''); }}>Cancel</button><button type="button" className="btn-primary" onClick={() => moveStage && applyStageChange(moveStage, lossReason)}>Save stage</button></>}>
        <div className="space-y-3">
          <Field label="New stage"><input className="input" value={moveStage?.name ?? ''} readOnly aria-readonly="true" /></Field>
          {requiresCommunicationChannels(moveStage?.name ?? '') && <>
            <p className="rounded-lg border border-warm/30 bg-warm/5 p-3 text-xs text-muted">Tender and quote-comparison stages require complete client details, validated contact channels, insurer assignment, and the product-specific intake listed below.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary contact *"><input className="input" value={stageContactName} onChange={(event) => setStageContactName(event.target.value)} /></Field>
              <Field label="Contact email *"><input className="input" type="email" value={stageContactEmail} onChange={(event) => setStageContactEmail(event.target.value)} /></Field>
              <Field label="Phone *"><input className="input" type="tel" value={stageContactPhone} onChange={(event) => setStageContactPhone(event.target.value)} /></Field>
              <Field label="WhatsApp *"><input className="input" type="tel" value={stageWhatsapp} onChange={(event) => setStageWhatsapp(event.target.value)} /></Field>
              <Field label="Telegram *"><input className="input" value={stageTelegram} onChange={(event) => setStageTelegram(event.target.value)} /></Field>
              <Field label="Insurer *"><input className="input" value={stageInsurer} onChange={(event) => setStageInsurer(event.target.value)} /></Field>
            </div>
            <div className="rounded-lg border border-ink-600 bg-ink-900/40 p-3">
              <p className="mb-2 text-xs text-muted">Required intake: {selectedProduct?.keyUnderwritingIntakeArtifacts ?? 'Completed proposal form, risk schedule, and prior claims history'}</p>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={intakeComplete} onChange={(event) => setIntakeComplete(event.target.checked)} />
                Required underwriting intake is complete
              </label>
            </div>
          </>}
          {moveStage && isLostStage(moveStage.name) && <Field label="Loss reason (required)"><select className="input" value={lossReason} onChange={(event) => setLossReason(event.target.value)}><option value="">Select a reason</option>{LOSS_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></Field>}
          {moveStage && isBoundStage(moveStage.name) && <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">Confirm that the policy is bound. A pending premium invoice will be created automatically.</p>}
          <Field label="Remarks / Notes (optional)"><textarea className="input min-h-20" value={stageChangeRemarks} onChange={(event) => setStageChangeRemarks(event.target.value)} placeholder="Add stage-change notes for the activity timeline." maxLength={2000} /></Field>
          {moveError && <p role="alert" className="text-sm text-hot">{moveError}</p>}
        </div>
      </Modal>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-ink-600 bg-ink-900/40 p-3"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-1 truncate text-sm font-semibold text-white">{value}</div></div>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-xs text-muted">{label}</div><div className="mt-1 break-words text-sm text-white">{value}</div></div>;
}

function avatarCode(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).slice(0, 2).join('') : (parts[0] ?? '').slice(0, 2)).toUpperCase();
}

function localDateTimeInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function TimelineItem({ title, description, date, durationMinutes }: { title: string; description: string; date?: string; durationMinutes?: number }) {
  const timestamp = date ? new Date(date) : null;
  const formattedTimestamp = timestamp && Number.isFinite(timestamp.getTime())
    ? `${formatDate(timestamp)} · ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  return <div className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-400 bg-ink-950" /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-white">{title}</span><span className="text-[10px] text-muted">{formattedTimestamp}</span></div>{description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}{durationMinutes !== undefined && <p className="mt-1 text-[10px] text-muted">Duration: {durationMinutes} minutes</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}
