import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity as ActivityIcon, AlertTriangle, ArrowLeft, ArrowRight, Building2, CalendarDays, Check, Clock3, Columns3,
  FileText, List, Pencil, Plus, ShieldCheck, Target, Wallet, Trash2,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { TENANT_ID } from '../lib/supabase';
import type { Activity, CompanyContactProfile, Deal, Lead, PipelineStage, StageHistoryAudit } from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import { calculateBrokerageCommission } from '../utils/insurance';
import { hasCompleteCommunicationChannels, requiresCommunicationChannels } from '../utils/communication';
import { hasCompleteClientProfile } from '../utils/customerProfile';
import { isStageSlaOverdue } from '../utils/stageSla';
import { linkContactProfile, mergeContactProfiles } from '../utils/contactProfiles';

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
  createdAt?: string;
  durationMinutes?: number;
  category: 'stage' | 'activity' | 'appointment' | 'proposal' | 'note' | 'task';
}

interface ContactEditorDraft {
  name: string;
  role: string;
  email: string;
  phone: string;
  whatsapp: string;
  telegram: string;
}

const EMPTY_CONTACT_DRAFT: ContactEditorDraft = {
  name: '',
  role: 'Decision Maker',
  email: '',
  phone: '',
  whatsapp: '',
  telegram: '',
};

const LEAD_PROGRESS_STAGES = [
  'Lead Identified',
  'Contact Made',
  'Key Person Identified',
  'Intro Email Sent',
  'Meetings Ongoing',
] as const;
type LeadProgressStage = (typeof LEAD_PROGRESS_STAGES)[number];

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
  const linkedLeadId = 'leadId' in item ? item.leadId : item.id;
  const linkedDealId = 'dealId' in item ? item.dealId : item.id;
  return clients.find((client) => client.id === item.clientId)
    ?? clients.find((client) => client.name.trim().toLowerCase() === item.client.trim().toLowerCase())
    ?? clients.find((client) => client.contacts?.some((contact) =>
      (linkedLeadId && contact.linkedLeadIds?.includes(linkedLeadId))
      || (linkedDealId && contact.linkedDealIds?.includes(linkedDealId))));
}

function dateBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function progressStageForLead(lead: Lead) {
  return progressStageForLeadName(lead.funnelStage);
}

function progressStageForLeadName(stageName: string): LeadProgressStage {
  const stage = stageName.toLowerCase();
  if (stage.includes('qualified') || stage.includes('bound') || stage.includes('won') || stage.includes('l3:')) return LEAD_PROGRESS_STAGES[4];
  if (stage.includes('meeting') || stage.includes('negotiat') || stage.includes('underwriter')) return LEAD_PROGRESS_STAGES[4];
  if (stage.includes('intro') || stage.includes('email') || stage.includes('quoted')) return LEAD_PROGRESS_STAGES[3];
  if (stage.includes('key person') || stage.includes('comparative') || stage.includes('presentation') || stage.includes('l2:')) return LEAD_PROGRESS_STAGES[2];
  if (stage.includes('contact') || stage.includes('market') || stage.includes('tender') || stage.includes('slip') || stage.includes('kyc') || stage.includes('l1:')) return LEAD_PROGRESS_STAGES[1];
  return LEAD_PROGRESS_STAGES[0];
}

function pipelineStageIndexForLead(lead: Lead) {
  const stage = lead.funnelStage.toLowerCase();
  if (stage.includes('qualified') || stage.includes('bound') || stage.includes('won') || stage.includes('l3:')) return 5;
  return LEAD_PROGRESS_STAGES.indexOf(progressStageForLead(lead));
}

function formatStageDuration(milliseconds: number) {
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} ${days === 1 ? 'day' : 'days'} / ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

function formatDays(milliseconds: number | undefined) {
  return milliseconds === undefined ? '—' : `${Math.floor(milliseconds / 86400000)}d`;
}

function stageSlaHealth(durationMilliseconds: number | undefined, targetDays: number) {
  if (!Number.isFinite(targetDays) || targetDays <= 0 || durationMilliseconds === undefined || !Number.isFinite(durationMilliseconds)) {
    return 'unconfigured' as const;
  }
  const targetMilliseconds = targetDays * 86400000;
  if (durationMilliseconds > targetMilliseconds) return 'overdue' as const;
  if (durationMilliseconds > targetMilliseconds * 0.75) return 'warning' as const;
  return 'healthy' as const;
}

function getTelemetryTimestampOverride(targetDays: number, now: number) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
  const parameters = new URLSearchParams(window.location.search);
  const testState = parameters.get('telemetry')?.toLowerCase();
  const testDurationRatio = testState === 'healthy' ? 0.5
    : testState === 'warning' ? 0.85
      : testState === 'overdue' ? 1.05 : undefined;

  if (testDurationRatio !== undefined && targetDays > 0) {
    return { timestamp: now - targetDays * 86400000 * testDurationRatio, label: testState?.toUpperCase() ?? 'TEST' };
  }

  const timestampOverride = parameters.get('stageEnteredAt');
  if (timestampOverride) {
    const parsedTimestamp = Date.parse(timestampOverride);
    if (Number.isFinite(parsedTimestamp)) return { timestamp: parsedTimestamp, label: 'TIMESTAMP' };
  }

  return undefined;
}

function formatElapsedInterval(milliseconds: number) {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  if (hours) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : 'Less than a minute';
}

export default function DealWorkspace({
  deals,
  onCreateDeal,
  onEditDeal,
  onEditLead,
  onDeleteLead,
  onDeleteDeal,
  initialSelectedKey,
  onClose,
}: {
  deals: Deal[];
  onCreateDeal?: () => void;
  onEditDeal?: (deal: Deal) => void;
  onEditLead?: (lead: Lead) => void;
  onDeleteLead?: (lead: Lead) => void;
  onDeleteDeal?: (deal: Deal) => void;
  initialSelectedKey?: string;
  onClose?: () => void;
}) {
  const {
    activities, setActivities, clients, setClients, deals: allDeals, setDeals, leads, setLeads,
    products, pipelines, pipelineStages, stageHistory, setStageHistory, invoices, setInvoices, user, users, viewAsRole,
  } = useApp();
  const [selectedKey, setSelectedKey] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'kanban' | 'inspection'>('kanban');
  const [kanbanPipelineId, setKanbanPipelineId] = useState('');
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [activityModal, setActivityModal] = useState<'meeting' | 'note' | 'quote' | 'task' | null>(null);
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
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContactError, setAddContactError] = useState('');
  const [editingContactId, setEditingContactId] = useState('');
  const [contactEditorDraft, setContactEditorDraft] = useState<ContactEditorDraft>(EMPTY_CONTACT_DRAFT);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<'all' | TimelineEntry['category']>('all');
  const [clockNow, setClockNow] = useState(Date.now());

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
  const progressDeal = selectedDeal ?? (selectedLead
    ? allDeals.find((deal) => deal.id === selectedLead.dealId || deal.leadId === selectedLead.id)
    : undefined);
  const linkedLead = selectedLead ?? (selectedDeal
    ? leads.find((lead) => lead.id === selectedDeal.leadId || lead.dealId === selectedDeal.id)
    : undefined);
  const activeRole = viewAsRole ?? user.role;
  const dealHasInvoice = Boolean(selectedDeal && (selectedDeal.linkedInvoiceId
    || invoices.some((invoice) => invoice.linkedDealId === selectedDeal.id)));
  const selectedClient = selectedItem ? clientForItem(selectedItem, clients) : undefined;
  const clientContacts = selectedClient?.contacts ?? [];
  const itemContacts = selectedLead?.contacts ?? linkedLead?.contacts ?? [];
  const contactProfiles = mergeContactProfiles(clientContacts, itemContacts);
  const primaryContactName = selectedLead?.contact ?? selectedDeal?.contactName ?? selectedClient?.contactPerson ?? '';
  const primaryContactProfile = contactProfiles.find((profile) =>
    (selectedLead?.contactProfileId ?? selectedDeal?.contactProfileId) === profile.id
    || profile.name.trim().toLowerCase() === primaryContactName.trim().toLowerCase());
  const resolvedContactPhone = selectedLead?.contactPhone || selectedDeal?.contactPhone
    || primaryContactProfile?.phone || selectedClient?.phone || '';
  const resolvedWhatsapp = selectedLead?.whatsapp || selectedDeal?.whatsapp || primaryContactProfile?.whatsapp || '';
  const resolvedTelegram = selectedLead?.telegram || selectedDeal?.telegram || primaryContactProfile?.telegram || '';
  const primaryContact: CompanyContactProfile | undefined = primaryContactName.trim() ? {
    ...primaryContactProfile,
    id: primaryContactProfile?.id ?? selectedLead?.contactProfileId ?? selectedDeal?.contactProfileId ?? `primary-${selectedItem?.id ?? 'contact'}`,
    name: primaryContactName,
    role: selectedLead?.contactRole ?? selectedDeal?.contactRole ?? primaryContactProfile?.role ?? 'Decision Maker',
    email: selectedLead?.contactEmail || selectedDeal?.contactEmail || primaryContactProfile?.email || selectedClient?.email || '',
    phone: selectedLead?.contactPhone || selectedDeal?.contactPhone || primaryContactProfile?.phone || selectedClient?.phone || '',
    whatsapp: selectedLead?.whatsapp || selectedDeal?.whatsapp || primaryContactProfile?.whatsapp || '',
    telegram: selectedLead?.telegram || selectedDeal?.telegram || primaryContactProfile?.telegram || '',
  } : undefined;
  const detailContacts = mergeContactProfiles(primaryContact ? [primaryContact] : undefined, contactProfiles);
  const selectedProduct = products.find((product) => product.code === selectedItem?.productCode)
    ?? products.find((product) => product.name === (selectedDeal?.product ?? ''));
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedItem?.pipelineId);
  const stages = pipelineStages.filter((stage) => stage.pipelineId === progressDeal?.pipelineId)
    .sort((left, right) => left.stageOrder - right.stageOrder);
  const leadPipelineStages = pipelineStages.filter((stage) => stage.pipelineId === selectedLead?.pipelineId)
    .sort((left, right) => left.stageOrder - right.stageOrder);
  const currentStage = stages.find((stage) => stage.name === progressDeal?.stage);
  const relatedLeadId = selectedDeal?.leadId ?? selectedLead?.id;
  const relatedDealId = selectedDeal?.id ?? selectedLead?.dealId ?? progressDeal?.id;
  const selectedActivities = activities
    .filter((activity) => (Boolean(relatedDealId) && activity.dealId === relatedDealId)
      || (Boolean(relatedLeadId) && activity.leadId === relatedLeadId)
      || (!activity.dealId && !activity.leadId && Boolean(selectedClient) && activity.clientId === selectedClient?.id))
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const quotes = selectedActivities.filter((activity) => activity.type === 'quote' && activity.quoteAmount !== undefined);
  const selectedHistory = progressDeal
    ? stageHistory.filter((entry) => entry.dealId === progressDeal.id).sort((left, right) => right.enteredAt.localeCompare(left.enteredAt))
    : [];
  const stageEntry = selectedHistory.find((entry) => !entry.exitedAt);
  const enteredAt = [stageEntry?.enteredAt, progressDeal?.stageChangedAt, selectedLead?.stageChangedAt, selectedLead?.routedAt, progressDeal?.createdAt, selectedLead?.createdAt]
    .find((timestamp): timestamp is string => Boolean(timestamp && Number.isFinite(Date.parse(timestamp))));
  const activeProgressStage = progressDeal
    ? progressDeal.stage
    : selectedLead ? progressStageForLead(selectedLead) : '';
  const progressStages: readonly (PipelineStage | string)[] = progressDeal ? stages : LEAD_PROGRESS_STAGES;
  const activeProgressIndex = progressStages.findIndex((stage) => (typeof stage === 'string' ? stage : stage.name) === activeProgressStage);
  const activeTargetStage = currentStage ?? (!progressDeal && selectedLead
    ? leadPipelineStages[pipelineStageIndexForLead(selectedLead)]
    : undefined);
  const targetDays = activeTargetStage?.stagnationDaysThreshold ?? 0;
  const telemetryOverride = getTelemetryTimestampOverride(targetDays, clockNow);
  const stageEnteredAt = telemetryOverride?.timestamp ?? (enteredAt ? Date.parse(enteredAt) : Number.NaN);
  const hasStageTimestamp = Number.isFinite(stageEnteredAt);
  const elapsedMilliseconds = hasStageTimestamp ? Math.max(0, clockNow - stageEnteredAt) : 0;
  const activeSlaHealth = stageSlaHealth(elapsedMilliseconds, targetDays);
  const isStagnant = activeSlaHealth === 'overdue';
  const leadStageHistory = selectedActivities
    .filter((activity) => activity.title.startsWith('Lead stage changed:'))
    .map((activity) => {
      const transition = /^Lead stage changed:\s*(.*?)\s*→\s*(.*?)\s*$/.exec(activity.title);
      return transition
        ? { from: progressStageForLeadName(transition[1]), to: progressStageForLeadName(transition[2]), date: activity.date }
        : undefined;
    })
    .filter((transition): transition is { from: LeadProgressStage; to: LeadProgressStage; date: string } => Boolean(transition))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const progressStartDate = progressDeal
    ? selectedHistory[selectedHistory.length - 1]?.enteredAt ?? progressDeal.createdAt ?? enteredAt
    : selectedLead?.createdAt ?? leadStageHistory[0]?.date ?? selectedLead?.routedAt ?? enteredAt;
  const progressStartMilliseconds = progressStartDate ? Date.parse(progressStartDate) : Number.NaN;
  const stageTimeline = progressStages.map((stage, index) => {
    const name = typeof stage === 'string' ? stage : stage.name;
    const pipelineStage = typeof stage === 'string' ? undefined : stage;
    if (progressDeal) {
      const history = pipelineStage
        ? selectedHistory.find((entry) => entry.toStageId === pipelineStage.id)
        : undefined;
      const stageStart = history?.enteredAt
        ?? (index === 0 ? progressDeal.createdAt : undefined)
        ?? (name === progressDeal.stage ? progressDeal.stageChangedAt ?? progressDeal.createdAt : undefined);
      const isCurrent = name === progressDeal.stage;
      const stageEnd = history?.exitedAt ?? (isCurrent && stageStart ? new Date(clockNow).toISOString() : undefined);
      const startMs = stageStart ? Date.parse(stageStart) : Number.NaN;
      const endMs = stageEnd ? Date.parse(stageEnd) : Number.NaN;
      const cumulative = Number.isFinite(startMs) && Number.isFinite(progressStartMilliseconds)
        ? Math.max(0, (isCurrent ? clockNow : Number.isFinite(endMs) ? endMs : startMs) - progressStartMilliseconds)
        : undefined;
      return {
        key: pipelineStage?.id ?? name,
        name,
        index,
        active: isCurrent,
        done: activeProgressIndex >= 0 && index < activeProgressIndex,
        enteredAt: stageStart,
        duration: Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : undefined,
        cumulative,
        targetDays: pipelineStage?.stagnationDaysThreshold ?? leadPipelineStages[index]?.stagnationDaysThreshold ?? 0,
      };
    }

    const transitionIn = leadStageHistory.find((transition) => transition.to === name);
    const transitionOut = leadStageHistory.find((transition) => transition.from === name);
    const isCurrent = name === activeProgressStage;
    const stageStart = transitionIn?.date
      ?? (index === 0 || !leadStageHistory.length ? selectedLead?.createdAt ?? selectedLead?.routedAt : undefined)
      ?? (isCurrent ? selectedLead?.stageChangedAt ?? selectedLead?.routedAt ?? selectedLead?.createdAt : undefined);
    const stageEnd = transitionOut?.date ?? (isCurrent && stageStart ? new Date(clockNow).toISOString() : undefined);
    const startMs = stageStart ? Date.parse(stageStart) : Number.NaN;
    const endMs = stageEnd ? Date.parse(stageEnd) : Number.NaN;
    const cumulative = Number.isFinite(startMs) && Number.isFinite(progressStartMilliseconds)
      ? Math.max(0, (isCurrent ? clockNow : Number.isFinite(endMs) ? endMs : startMs) - progressStartMilliseconds)
      : undefined;
    return {
      key: name,
      name,
      index,
      active: isCurrent,
      done: activeProgressIndex >= 0 && index < activeProgressIndex,
      enteredAt: stageStart,
      duration: Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : undefined,
      cumulative,
      targetDays: leadPipelineStages[index]?.stagnationDaysThreshold ?? 0,
    };
  });
  const recordSlaStatus = (record: typeof records[number]) => {
    const recordDeal = record.kind === 'deal'
      ? record.item as Deal
      : allDeals.find((deal) => deal.id === (record.item as Lead).dealId || deal.leadId === record.item.id);
    const recordLead = record.kind === 'lead'
      ? record.item as Lead
      : leads.find((lead) => lead.id === recordDeal?.leadId || lead.dealId === recordDeal?.id);
    const recordStages = pipelineStages
      .filter((stage) => stage.pipelineId === (recordDeal?.pipelineId ?? recordLead?.pipelineId))
      .sort((left, right) => left.stageOrder - right.stageOrder);
    const recordStage = recordDeal
      ? recordStages.find((stage) => stage.name === recordDeal.stage)
      : recordLead
        ? recordStages[pipelineStageIndexForLead(recordLead)]
        : undefined;
    if (!recordStage) return { overdue: false, targetDays: 0 };
    const activeHistory = recordDeal && stageHistory.find((entry) =>
      entry.dealId === recordDeal.id && entry.toStageId === recordStage.id && !entry.exitedAt);
    const recordEnteredAt = activeHistory?.enteredAt
      ?? recordDeal?.stageChangedAt
      ?? recordLead?.stageChangedAt
      ?? recordLead?.routedAt
      ?? recordDeal?.createdAt
      ?? recordLead?.createdAt;
    return {
      overdue: isStageSlaOverdue(recordEnteredAt, recordStage.stagnationDaysThreshold, clockNow),
      targetDays: recordStage.stagnationDaysThreshold,
    };
  };
  const progressionEvents = [
    ...selectedHistory.map((entry) => entry.enteredAt),
    ...selectedActivities
      .filter((activity) => activity.title.startsWith('Lead stage changed:'))
      .map((activity) => activity.date),
  ].filter((date) => Number.isFinite(Date.parse(date)));
  const lastWeekProgressions = progressionEvents.filter((date) => {
    const age = clockNow - Date.parse(date);
    return age >= 0 && age <= 7 * 86400000;
  }).length;
  const lastMonthProgressions = progressionEvents.filter((date) => {
    const age = clockNow - Date.parse(date);
    return age >= 0 && age <= 30 * 86400000;
  }).length;
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
      createdAt: selectedDeal.createdAt,
      category: 'stage' as const,
    }] : []),
    ...(selectedDeal?.nextActivityAt ? [{
      key: `deal-follow-up-${selectedDeal.id}`,
      title: selectedDeal.nextActivityTitle ?? 'Scheduled follow-up',
      description: 'Scheduled task',
      date: selectedDeal.nextActivityAt,
      createdAt: selectedDeal.nextActivityCreatedAt,
      category: 'task' as const,
    }] : []),
    ...selectedHistory.map((entry) => {
      const target = pipelineStages.find((stage) => stage.id === entry.toStageId)?.name ?? 'Pipeline stage';
      return {
        key: entry.id,
        title: `Stage: ${target}`,
        description: entry.lossReason ? `Loss reason: ${entry.lossReason}` : entry.details ?? '',
        date: entry.enteredAt,
        createdAt: entry.enteredAt,
        category: 'stage' as const,
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
        createdAt: activity.createdAt,
        category: activity.type === 'meeting' ? 'appointment' as const
          : activity.type === 'quote' ? 'proposal' as const
            : activity.type === 'task' ? 'task' as const
              : activity.title.startsWith('Lead stage changed:') ? 'stage' as const
                : activity.type === 'note' ? 'note' as const : 'activity' as const,
        ...(activity.durationMinutes !== undefined ? { durationMinutes: activity.durationMinutes } : {}),
      };
    }),
  ].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const filteredTimelineEntries = timelineFilter === 'all'
    ? timelineEntries
    : timelineEntries.filter((entry) => entry.category === timelineFilter);

  useEffect(() => {
    if (!kanbanPipeline || kanbanPipelineId === kanbanPipeline.id) return;
    setKanbanPipelineId(kanbanPipeline.id);
  }, [kanbanPipeline, kanbanPipelineId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setTimelineFilter('all');
  }, [selectedKey]);

  useEffect(() => {
    if (!initialSelectedKey) return;
    setSelectedKey(initialSelectedKey);
    setWorkspaceView('inspection');
  }, [initialSelectedKey]);

  useEffect(() => {
    if (!selectedItem) return;
    setContactName(selectedDeal?.contactName ?? selectedLead?.contact ?? selectedClient?.contactPerson ?? '');
    setContactPhone(resolvedContactPhone);
    setWhatsapp(resolvedWhatsapp);
    setTelegram(resolvedTelegram);
    setContactError('');
  }, [selectedKey, selectedDeal, selectedLead, selectedClient, selectedItem, resolvedContactPhone, resolvedWhatsapp, resolvedTelegram]);

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
    const type = activityModal === 'meeting' ? 'meeting'
      : activityModal === 'quote' ? 'quote'
        : activityModal === 'task' ? 'task' : 'note';
    const amount = type === 'quote' ? Number(data.get('quoteAmount')) : undefined;
    const currency = type === 'quote' ? String(data.get('quoteCurrency')) as 'MVR' | 'USD' : undefined;
    const insurer = String(data.get('insurer') ?? '').trim();
    const activityDate = String(data.get('activityDate') ?? '');
    const meetingMode = String(data.get('meetingMode') ?? '') as Activity['meetingMode'];
    const durationMinutes = type === 'meeting' ? Number(data.get('durationMinutes')) : undefined;
    const createdAt = new Date().toISOString();
    const activity: Activity = {
      id: `activity-${crypto.randomUUID()}`,
      clientId: selectedClient?.id ?? selectedItem.clientId ?? '',
      ...(selectedLead ? { leadId: selectedLead.id } : selectedDeal?.leadId ? { leadId: selectedDeal.leadId } : {}),
      ...(selectedDeal ? { dealId: selectedDeal.id } : {}),
      ...(insurer ? { insurer } : {}),
      type,
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
      date: activityDate ? new Date(activityDate).toISOString() : createdAt,
      createdAt,
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
    const contactChannels = {
      contactPhone: resolvedContactPhone,
      whatsapp: resolvedWhatsapp,
      telegram: resolvedTelegram,
    };
    if (!hasCompleteCommunicationChannels(contactChannels)) {
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
    const enteredAt = new Date().toISOString();
    const value = selectedLead.value ?? selectedLead.sumInsured ?? selectedLead.premium;
    const deal: Deal = {
      id: `deal-${crypto.randomUUID()}`,
      leadId: selectedLead.id,
      pipelineId: pipeline.id,
      createdAt: enteredAt,
      stageChangedAt: enteredAt,
      client: selectedLead.client,
      clientId: selectedLead.clientId,
      contactName: selectedLead.contact,
      contactProfileId: selectedLead.contactProfileId ?? primaryContactProfile?.id,
      contactRole: selectedLead.contactRole,
      contactEmail: selectedLead.contactEmail || primaryContactProfile?.email || '',
      ...contactChannels,
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
    const linkedLeadContacts = mergeContactProfiles(
      selectedLead.contacts,
      contactProfiles.filter((contact) => contact.linkedLeadIds?.includes(selectedLead.id)),
      primaryContact ? [primaryContact] : undefined,
    )
      .map((contact) => linkContactProfile(contact, selectedLead.id, deal.id));
    setLeads((current) => current.map((lead) => lead.id === selectedLead.id
      ? {
        ...lead,
        dealId: deal.id,
        contactProfileId: lead.contactProfileId ?? primaryContactProfile?.id,
        contactEmail: lead.contactEmail || primaryContactProfile?.email || '',
        ...contactChannels,
        contacts: linkedLeadContacts,
      }
      : lead));
    if (selectedClient) {
      setClients((current) => current.map((client) => client.id === selectedClient.id
        ? { ...client, contacts: mergeContactProfiles(client.contacts, linkedLeadContacts) }
        : client));
    }
    setStageHistory((current) => [...current, {
      id: `stage-${crypto.randomUUID()}`,
      tenantId: TENANT_ID,
      dealId: deal.id,
      fromStageId: null,
      toStageId: firstStage.id,
      enteredAt,
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
        const enteredAt = Date.parse(entry.enteredAt);
        const durationSeconds = Number.isFinite(enteredAt)
          ? Math.max(0, Math.floor((Date.now() - enteredAt) / 1000))
          : 0;
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
          stageChangedAt: now,
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
        stageChangedAt: now,
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
        nextActivityCreatedAt: now,
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
      createdAt: now,
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
    const profile = contactProfiles.find((contact) => contact.id === profileId);
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
          contacts: client.contacts?.some((contact) => contact.id === profile.id)
            ? (client.contacts ?? []).map((contact) => contact.id === profile.id
              ? { ...contact, linkedDealIds: [...new Set([...(contact.linkedDealIds ?? []), selectedDeal.id])] }
              : contact)
            : [...(client.contacts ?? []), { ...profile, linkedDealIds: [...new Set([...(profile.linkedDealIds ?? []), selectedDeal.id])] }],
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
          contacts: client.contacts?.some((contact) => contact.id === profile.id)
            ? (client.contacts ?? []).map((contact) => contact.id === profile.id
              ? { ...contact, linkedLeadIds: [...new Set([...(contact.linkedLeadIds ?? []), selectedLead.id])] }
              : contact)
            : [...(client.contacts ?? []), { ...profile, linkedLeadIds: [...new Set([...(profile.linkedLeadIds ?? []), selectedLead.id])] }],
        }
        : client));
    }
  };

  const openEditContact = (contact: CompanyContactProfile) => {
    setEditingContactId(contact.id);
    setContactEditorDraft({
      name: contact.name,
      role: contact.role || 'Decision Maker',
      email: contact.email,
      phone: contact.phone,
      whatsapp: contact.whatsapp ?? '',
      telegram: contact.telegram ?? '',
    });
    setAddContactError('');
    setAddContactOpen(true);
  };

  const saveContactProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLead && !selectedDeal) return;
    setAddContactError('');
    const name = contactEditorDraft.name.trim();
    const role = contactEditorDraft.role.trim();
    const email = contactEditorDraft.email.trim();
    const phone = contactEditorDraft.phone.trim();
    const whatsapp = contactEditorDraft.whatsapp.trim();
    const telegram = contactEditorDraft.telegram.trim();
    if (!name || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !/^[+()\d\s-]{7,}$/.test(phone)) {
      setAddContactError('Enter a name, role, valid email address, and valid phone number.');
      return;
    }
    if (detailContacts.some((contact) => contact.id !== editingContactId
      && contact.email.trim().toLowerCase() === email.toLowerCase())) {
      setAddContactError('A contact with this email is already linked to this lead.');
      return;
    }
    const contact: CompanyContactProfile = linkContactProfile({
      id: editingContactId || `contact-${crypto.randomUUID()}`,
      name,
      role,
      email,
      phone,
      whatsapp,
      telegram,
      linkedLeadIds: contactProfiles.find((profile) => profile.id === editingContactId)?.linkedLeadIds ?? [],
      linkedDealIds: contactProfiles.find((profile) => profile.id === editingContactId)?.linkedDealIds ?? [],
    }, selectedLead?.id ?? linkedLead?.id, selectedDeal?.id ?? selectedLead?.dealId ?? linkedLead?.dealId);

    if (selectedLead || linkedLead) {
      const targetLead = selectedLead ?? linkedLead;
      if (targetLead) setLeads((current) => current.map((lead) => {
        if (lead.id !== targetLead.id) return lead;
        const contacts = lead.contacts ?? [];
        const isPrimary = lead.contactProfileId === contact.id
          || (!lead.contactProfileId && lead.contact.trim().toLowerCase() === contact.name.trim().toLowerCase());
        return {
          ...lead,
          contacts: mergeContactProfiles(contacts, [linkContactProfile(contact, lead.id, lead.dealId)]),
          ...(isPrimary ? {
            contact: contact.name,
            contactRole: contact.role,
            contactEmail: contact.email,
            contactPhone: contact.phone,
            whatsapp: contact.whatsapp,
            telegram: contact.telegram,
          } : {}),
        };
      }));
    }

    if (selectedDeal) setDeals((current) => current.map((deal) => {
      const isPrimary = deal.contactProfileId === contact.id
        || (!deal.contactProfileId && deal.contactName?.trim().toLowerCase() === contact.name.trim().toLowerCase());
      if (deal.id !== selectedDeal.id || !isPrimary) return deal;
      return {
        ...deal,
        contactName: contact.name,
        contactRole: contact.role,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        whatsapp: contact.whatsapp,
        telegram: contact.telegram,
      };
    }));

    if (selectedClient) {
      setClients((current) => current.map((client) => {
        if (client.id !== selectedClient.id) return client;
        return {
          ...client,
          contacts: mergeContactProfiles(client.contacts, [contact]),
        };
      }));
    }
    setEditingContactId('');
    setContactEditorDraft(EMPTY_CONTACT_DRAFT);
    setAddContactOpen(false);
    setAddContactError('');
  };

  return (
    <div className="space-y-2">
      {(workspaceView === 'kanban' || !selectedItem) && <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-ink-800/60 p-1" role="tablist" aria-label="Deal workspace views">
          <button type="button" role="tab" aria-selected={workspaceView === 'kanban'} onClick={() => setWorkspaceView('kanban')} className={`rounded-md px-3 py-1.5 text-sm ${workspaceView === 'kanban' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}>Kanban</button>
          <button type="button" role="tab" aria-selected={workspaceView === 'inspection'} onClick={() => setWorkspaceView('inspection')} className={`rounded-md px-3 py-1.5 text-sm ${workspaceView === 'inspection' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}>Inspection</button>
        </div>
        {onClose && <button type="button" className="btn-ghost !py-1.5" onClick={onClose}>Back to leads</button>}
      </div>}
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
    <div className={`grid min-h-[calc(100vh-8rem)] grid-cols-1 gap-3 xl:h-[calc(100vh-8rem)] xl:min-h-0 ${selectedLead ? 'xl:grid-cols-1' : 'xl:grid-cols-[280px_minmax(0,1fr)]'}`}>
      {!selectedLead && <aside className="glass flex min-h-[320px] flex-col overflow-hidden rounded-2xl xl:min-h-0">
        <div className="border-b border-ink-600 p-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold text-white">Deals & Leads</h2><p className="mt-1 text-xs text-muted">{records.length} records</p></div>
            {onCreateDeal && <button type="button" className="btn-primary !px-2.5 !py-2 !text-xs" onClick={onCreateDeal}>+ Deal</button>}
          </div>
          <input className="input mt-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, product, stage…" aria-label="Search deals and leads" />
          <select className="input mt-2" value={productFilter} onChange={(event) => setProductFilter(event.target.value)} aria-label="Filter by product">
            <option value="">All products</option>
            {products.map((product) => <option key={product.code} value={product.code}>{product.code} · {product.name}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {records.map((record) => {
            const { kind, item, key } = record;
            const slaStatus = recordSlaStatus(record);
            return (
            <button key={key} type="button" onClick={() => setSelectedKey(key)}
              className={`w-full border-b border-ink-700/60 p-3 text-left transition ${selected?.key === key ? 'border-l-2 border-l-brand-400 bg-brand-500/10' : 'hover:bg-ink-750/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">{item.client}</div>
                  <div className="mt-1 truncate text-xs text-muted">{kind === 'deal' ? (item as Deal).product : (item as Lead).title}</div>
                </div>
                <Badge variant={kind === 'deal' ? 'brand' : 'muted'}>{kind}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="pill border border-ink-600 bg-ink-800 text-muted !px-2 !py-0.5">{item.productCode ?? 'No product'}</span>
                <Badge variant={stageBadgeTone(kind === 'deal' ? (item as Deal).stage : (item as Lead).funnelStage)}>
                  {kind === 'deal' ? (item as Deal).stage : (item as Lead).funnelStage}
                </Badge>
                {slaStatus.overdue && <Badge variant="hot"><Clock3 size={11} /> SLA overdue</Badge>}
              </div>
              <div className="mt-2 text-xs text-brand-300">
                {formatAmount(kind === 'deal' ? (item as Deal).value : (item as Lead).value ?? (item as Lead).premium, kind === 'deal' ? (item as Deal).currency : (item as Lead).currency ?? 'MVR')}
              </div>
            </button>
            );
          })}
          {records.length === 0 && <div className="p-5 text-center text-sm text-muted">No matching deals or leads.</div>}
        </div>
        {onCreateDeal && <button type="button" className="btn-ghost m-3 !text-xs" onClick={onCreateDeal}>+ Deal</button>}
      </aside>}

      <main className={`glass min-h-[460px] min-w-0 overflow-y-auto rounded-2xl p-3 sm:p-4 xl:min-h-0 ${selectedLead ? 'flex flex-col' : ''}`}>
        {!selectedItem ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <ShieldCheck size={30} className="text-brand-400" /><h2 className="mt-3 font-semibold text-white">Your placement workspace</h2>
            <p className="mt-1 text-sm text-muted">Select a lead or deal to see its complete lifecycle and activity.</p>
          </div>
        ) : <>
          <div className="order-0 flex flex-wrap items-center justify-between gap-2 border-b border-ink-600 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <Building2 size={17} className="shrink-0 text-brand-300" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><h1 className="text-lg font-semibold text-white">{selectedItem.client}</h1><Badge variant={selectedDeal ? 'brand' : 'muted'}>{selectedDeal ? 'Deal' : 'Lead'}</Badge><Badge variant={stageBadgeTone(selectedDeal?.stage ?? selectedLead?.funnelStage ?? '')}>{selectedDeal?.stage ?? selectedLead?.funnelStage}</Badge>{selectedLead && <><Badge variant={selectedLead.temperature === 'HOT' ? 'hot' : selectedLead.temperature === 'COLD' ? 'cold' : 'warm'}>{selectedLead.temperature}</Badge><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E2024] text-[10px] font-semibold text-[#8E95A2]" title={users.find((person) => person.id === selectedLead.ownerId)?.name}>{avatarCode(users.find((person) => person.id === selectedLead.ownerId)?.name ?? '')}</span></>}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span>{selectedDeal?.product ?? selectedProduct?.name ?? selectedLead?.productCode} · {selectedPipeline?.name ?? 'No pipeline'} · Ref {selectedItem.id}</span>
                  {progressDeal && selectedLead && <button type="button" className="text-brand-300 hover:text-white" onClick={() => setSelectedKey(`deal:${progressDeal.id}`)}>Open linked deal</button>}
                  {selectedDeal && linkedLead && <button type="button" className="text-brand-300 hover:text-white" onClick={() => setSelectedKey(`lead:${linkedLead.id}`)}>Open linked lead · {linkedLead.title ?? linkedLead.client}</button>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-lg border border-[#1B1E22] bg-[#0B0C0E] p-1" role="tablist" aria-label="Deal workspace views">
                <button type="button" role="tab" aria-label="Kanban view" title="Kanban view" aria-selected={false} onClick={() => setWorkspaceView('kanban')} className="rounded-md p-2 text-muted transition hover:text-white"><Columns3 size={14} /></button>
                <button type="button" role="tab" aria-label="Inspection view" title="Inspection view" aria-selected={true} onClick={() => setWorkspaceView('inspection')} className="rounded-md bg-[#1B1E22] p-2 text-white transition"><List size={14} /></button>
              </div>
              {onClose && <button type="button" aria-label="Back to leads" title="Back to leads" className="btn-ghost !px-2 !py-1.5" onClick={onClose}><ArrowLeft size={14} /></button>}
              {(activeRole === 'admin' || activeRole === 'sales') && selectedLead && onEditLead && <button type="button" aria-label="Edit lead" title="Edit lead" className="btn-ghost !px-2 !py-1.5" onClick={() => onEditLead(selectedLead)}><Pencil size={14} /></button>}
              {selectedDeal && onEditDeal && <button type="button" aria-label="Edit deal" title="Edit deal" className="btn-ghost !px-2 !py-1.5" onClick={() => onEditDeal(selectedDeal)}><Pencil size={14} /></button>}
              {activeRole === 'admin' && selectedLead && onDeleteLead && <button type="button" aria-label="Delete lead" title="Delete lead" className="btn-ghost !px-2 !py-1.5 text-hot" onClick={() => onDeleteLead(selectedLead)}><Trash2 size={14} /></button>}
              {activeRole === 'admin' && selectedDeal && onDeleteDeal && <button type="button" aria-label="Delete deal" className="btn-ghost !px-2 !py-1.5 text-hot" disabled={dealHasInvoice} title={dealHasInvoice ? 'Deals linked to invoices cannot be deleted.' : 'Delete deal'} onClick={() => onDeleteDeal(selectedDeal)}><Trash2 size={14} /></button>}
            </div>
          </div>

          <section aria-label={progressDeal ? 'Placement telemetry stage tracker' : 'Lead telemetry stage tracker'} className={`telemetry-panel order-1 mt-2 min-w-0 rounded-xl ${selectedLead ? 'p-1.5' : 'p-2.5'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="sr-only">{progressDeal ? 'Placement telemetry' : 'Lead telemetry'}</h2>
                  <ActivityIcon size={14} className="text-[#A7F2C5]" aria-hidden="true" />
                  {progressDeal && <span className="text-[10px] tracking-wide text-[#6C727F]" title={`${selectedPipeline?.name ?? 'Pipeline'} stage sequence`}>{selectedPipeline?.name ?? 'Pipeline'}</span>}
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#27C272]">
                  {telemetryOverride && <span className="text-[#E09228]">Test · {telemetryOverride.label}</span>}
                  <span className="telemetry-live-dot" aria-hidden="true" /><span className="sr-only">Live tracking</span>
                </span>
              </div>
              <div className={`${selectedLead ? 'mt-1' : 'mt-2'} min-w-0`}>
                {stageTimeline.length ? <div className={`-mx-1 w-full max-w-full overflow-x-auto px-1 stage-stepper-scroll ${selectedLead ? 'pb-1' : 'pb-2'}`}>
                  <ol className="telemetry-track flex w-max min-w-full items-start justify-between gap-1">
                      {stageTimeline.map((stage) => {
                        const pipelineStage = typeof progressStages[stage.index] === 'string'
                          ? undefined
                          : progressStages[stage.index] as PipelineStage;
                        const stageEnteredAtMilliseconds = stage.enteredAt ? Date.parse(stage.enteredAt) : Number.NaN;
                        const stageElapsedMilliseconds = stage.active
                          ? Number.isFinite(stageEnteredAtMilliseconds)
                            ? Math.max(0, clockNow - stageEnteredAtMilliseconds)
                            : 0
                          : stage.duration;
                        const durationMilliseconds = stage.active && telemetryOverride
                          ? Math.max(0, clockNow - telemetryOverride.timestamp)
                          : stageElapsedMilliseconds;
                        const health = stageSlaHealth(durationMilliseconds, stage.targetDays);
                        const stageOverdue = health === 'overdue';
                        const healthLabel = health === 'overdue' ? 'DRAGGED'
                          : health === 'warning' ? 'AT RISK'
                            : health === 'healthy' ? 'ON TRACK' : 'NO SLA';
                        const healthColor = health === 'overdue' ? '#FF3366'
                          : health === 'warning' ? '#E09228'
                            : health === 'healthy' ? '#27C272' : '#A7F2C5';
                        return <li key={stage.key} className="telemetry-step relative w-36 shrink-0">
                          {stage.index < stageTimeline.length - 1 && <span
                            className={`telemetry-connector ${selectedLead ? 'is-compact' : ''} ${stage.done ? 'is-complete' : ''}`}
                            aria-hidden="true" />}
                          <button type="button" disabled={!progressDeal || stage.active || selectedDeal?.disposition === 'won' || selectedDeal?.disposition === 'lost'}
                            onClick={() => pipelineStage && progressDeal && requestStageChange(pipelineStage, progressDeal)}
                            title={stage.active && stageOverdue ? `SLA overdue: stage exceeded its ${stage.targetDays}-day target` : stage.active && health === 'warning' ? `SLA warning: stage is approaching its ${stage.targetDays}-day target` : stage.name}
                            aria-label={`${stage.name}${stage.active ? `; stage duration ${formatStageDuration(stageElapsedMilliseconds ?? 0)}; total ${formatDays(stage.cumulative)}` : stage.done ? '; completed' : '; upcoming'}${stage.active && stageOverdue ? `; SLA overdue, target ${stage.targetDays} days` : stage.active && health === 'warning' ? `; approaching target of ${stage.targetDays} days` : ''}`}
                            aria-current={stage.active ? 'step' : undefined}
                            className={`telemetry-stage relative z-[1] flex w-full flex-col items-center border-0 bg-transparent px-1 py-0 text-center disabled:cursor-default ${stage.active ? 'is-active' : stage.done ? 'is-complete' : 'is-pending'}`}>
                            <span className={`telemetry-node ${stage.active ? `is-${health}` : stage.done ? 'is-complete' : ''}`}>
                              {stage.active && (health === 'overdue' || health === 'warning') ? <Clock3 size={12} aria-hidden="true" /> : stage.done ? <Check size={12} aria-hidden="true" /> : <span className="telemetry-node-core" />}
                            </span>
                            <span className={`mt-1 whitespace-nowrap text-[10px] font-semibold leading-4 sm:text-[11px] ${stage.active ? 'text-white' : stage.done ? 'text-[#A5DDBB]' : 'text-[#808896]'}`}>
                              {stage.name}
                            </span>
                            {stage.active && selectedLead && <span className="telemetry-metric telemetry-metric-compact flex shrink-0 flex-nowrap items-center gap-x-1 whitespace-nowrap font-mono text-[8px] leading-none text-[#C9D2CC]"
                              aria-label={`${formatDays(stageElapsedMilliseconds)} elapsed, ${stage.targetDays > 0 ? `${stage.targetDays} days target` : 'no target'}${stage.cumulative !== undefined ? `, ${formatDays(stage.cumulative)} total` : ''}`}>
                              <span><Clock3 size={10} aria-hidden="true" />{formatDays(stageElapsedMilliseconds)}</span>
                              <span><Target size={10} aria-hidden="true" />{stage.targetDays > 0 ? `${stage.targetDays}d` : '—'}</span>
                            </span>}
                            {stage.active && !selectedLead && <>
                              <span className="telemetry-metric mt-0.5 flex w-full flex-nowrap items-center justify-center gap-x-2 whitespace-nowrap font-mono text-[8px] leading-4 text-[#C9D2CC]"
                                aria-label={`${formatDays(stageElapsedMilliseconds)} elapsed, ${stage.targetDays > 0 ? `${stage.targetDays} days target` : 'no target'}${stage.cumulative !== undefined ? `, ${formatDays(stage.cumulative)} total` : ''}`}>
                                <span><Clock3 size={10} aria-hidden="true" />{formatDays(stageElapsedMilliseconds)}</span>
                                <span><Target size={10} aria-hidden="true" />{stage.targetDays > 0 ? `${stage.targetDays}d` : '—'}</span>
                              </span>
                              <span className={`telemetry-sla-label mt-1 whitespace-nowrap font-mono text-[10px] leading-4 tracking-[0.08em] sm:text-[11px] is-${health}`} style={{ color: healthColor }}>
                                {healthLabel} · {stage.targetDays > 0 ? `${stage.targetDays}D TARGET` : 'NO SLA'}
                              </span>
                            </>}
                          </button>
                        </li>;
                      })}
                  </ol>
                </div> : <p className="py-2 text-xs text-muted">No stages are configured for this pipeline.</p>}
            </div>
          </section>

          {selectedLead ? (
            <>
            <div className="order-2 mt-3 grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
                <h2 className="mb-4 text-sm font-semibold text-white">Client Details</h2>
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  <DetailValue label="Name" value={selectedClient?.name ?? selectedLead.client} />
                  <DetailValue label="Identification" value={selectedClient?.tin || '—'} />
                  <DetailValue label="Address" value={selectedClient?.address || '—'} />
                  <DetailValue label="Country" value={selectedClient?.country || selectedLead.country || '—'} />
                  <DetailValue label="Email" value={selectedClient?.email || '—'} />
                  <DetailValue label="Phone" value={selectedClient?.phone || '—'} />
                </div>
                <div className="mt-4 border-t border-ink-700 pt-4">
                  <h3 className="mb-3 text-xs font-semibold text-white">Lead Details</h3>
                  <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                    <DetailValue label="Lead Owner" value={users.find((person) => person.id === selectedLead.ownerId)?.name ?? selectedLead.ownerId} />
                    <DetailValue label="Lead Stage" value={selectedLead.funnelStage} />
                    <DetailValue label="Expected Closing Date" value={formatDate(selectedLead.closeDate ?? selectedLead.renewalDate)} />
                    <DetailValue label="Remarks / Notes" value={selectedLead.notes || '—'} />
                  </div>
                </div>
              </section>
              <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
                <h2 className="mb-4 text-sm font-semibold text-white">Policy Details</h2>
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
            </div>
            <section className="order-3 mt-3 min-w-0 rounded-xl border border-ink-600 bg-ink-900/30 p-3">
              <ContactDirectory contacts={detailContacts} primaryContactId={primaryContact?.id}
                assignedContactId={selectedLead.contactProfileId} onAssign={assignContactProfile}
                onEditContact={openEditContact} compact />
            </section>
            </>
          ) : <>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="mb-4 text-sm font-semibold text-white">Client & Contact Details</h2>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <DetailValue label="Client" value={selectedClient?.name ?? selectedDeal?.client ?? '—'} />
                <DetailValue label="Identification" value={selectedClient?.tin || '—'} />
                <DetailValue label="Address" value={selectedClient?.address || '—'} />
                <DetailValue label="Country" value={selectedClient?.country || '—'} />
                <DetailValue label="Client email" value={selectedClient?.email || '—'} />
                <DetailValue label="Client phone" value={selectedClient?.phone || '—'} />
              </div>
              <ContactDirectory contacts={detailContacts} primaryContactId={primaryContact?.id}
                assignedContactId={selectedDeal?.contactProfileId} onAssign={assignContactProfile}
                onEditContact={openEditContact} />
              <form className="mt-4 rounded-xl border border-ink-600 bg-ink-950/40 p-4" onSubmit={saveContactChannels}>
                <h3 className="mb-3 text-xs font-semibold text-white">Update communication channels</h3>
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

            <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><FileText size={15} className="text-brand-300" /> Policy Details</h2>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <DetailValue label="Insurance Type" value={selectedProduct?.name ?? selectedDeal?.product ?? '—'} />
                <DetailValue label="Current Insurer" value={selectedDeal?.insurer || selectedClient?.insurer || '—'} />
                <DetailValue label="Sum Insured" value={formatAmount(selectedClient?.sumInsured ?? selectedDeal?.value ?? 0, selectedDeal?.currency ?? 'MVR')} />
                <DetailValue label="Premium" value={formatAmount(selectedClient?.premium ?? selectedDeal?.value ?? 0, selectedDeal?.currency ?? 'MVR')} />
                <DetailValue label="Probability" value={`${selectedDeal?.probability ?? '—'}%`} />
                <DetailValue label="Expected Close" value={formatDate(selectedDeal?.closeDate ?? '')} />
                <DetailValue label="Policy Expiry" value={formatDate(selectedDeal?.policyExpiry ?? selectedClient?.expiry ?? '')} />
                <DetailValue label="Brokerage Estimate" value={formatAmount(selectedDeal?.brokerageCommission ?? 0, selectedDeal?.currency ?? 'MVR')} />
                <DetailValue label="Owner / Representative" value={users.find((person) => person.id === selectedItem.ownerId)?.name ?? selectedItem.ownerId} />
              </div>
              {selectedProduct && <div className="mt-4 rounded-xl border border-ink-600 bg-ink-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="text-sm font-medium text-white">{selectedProduct.code} · {selectedProduct.name}</div><div className="mt-1 text-xs text-muted">{selectedProduct.category} · {selectedProduct.classType} · {selectedProduct.salesCycleVelocity ?? '14–30 Days'} cycle</div></div>
                  <Badge variant={selectedProduct.riskLevel === 'Very High' || selectedProduct.riskLevel === 'High' ? 'hot' : 'muted'}>{selectedProduct.riskLevel ?? 'Medium'} risk</Badge>
                </div>
                <div className="mt-2 text-xs text-muted"><span className="text-white">Underwriting intake:</span> {selectedProduct.keyUnderwritingIntakeArtifacts ?? 'Completed proposal form, asset/risk schedule and prior claims history'}</div>
              </div>}
            </section>
          </div>
          </>}
          <section className={`${selectedLead ? 'order-4' : ''} mt-4 min-w-0 border-t border-ink-600 pt-3`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock3 size={15} className="text-brand-300" /> Activity</h2>
                <p className="mt-1 text-xs text-muted">Stage movement and client touchpoints.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('meeting')}><CalendarDays size={13} /> Appointment</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('quote')}><FileText size={13} /> Proposal</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('note')}><Plus size={13} /> Note</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('task')}><Check size={13} /> Task</button>
              </div>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Weekly stage progression</p>
                <p className="mt-1 text-lg font-semibold text-white">{lastWeekProgressions}<span className="ml-1 text-xs font-normal text-muted">stage changes · last 7 days</span></p>
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Monthly stage progression</p>
                <p className="mt-1 text-lg font-semibold text-white">{lastMonthProgressions}<span className="ml-1 text-xs font-normal text-muted">stage changes · last 30 days</span></p>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter timeline entries">
              {([
                ['all', 'All'],
                ['stage', 'Stage changes'],
                ['activity', 'Activity'],
                ['appointment', 'Appointments'],
                ['proposal', 'Proposals'],
                ['note', 'Notes'],
                ['task', 'Tasks'],
              ] as const).map(([category, label]) => (
                <button key={category} type="button" aria-pressed={timelineFilter === category}
                  onClick={() => setTimelineFilter(category)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${timelineFilter === category ? 'border-brand-400 bg-brand-400/15 text-white' : 'border-ink-700 text-muted hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="-mx-1 max-h-60 max-w-full touch-pan-x overflow-auto overscroll-contain scroll-smooth timeline-scrollbar px-1 pb-2"
              role="region" aria-label="Activity timeline" tabIndex={0}>
              <div className="flex w-max min-w-full items-stretch gap-3">
                {filteredTimelineEntries.map((entry, index) => <TimelineItem
                  key={entry.key}
                  title={entry.title}
                  description={entry.description}
                  date={entry.date}
                  createdAt={entry.createdAt}
                  elapsedFromPrevious={index > 0
                    ? Math.max(0, Date.parse(entry.date) - Date.parse(filteredTimelineEntries[index - 1].date))
                    : undefined}
                  durationMinutes={entry.durationMinutes}
                  category={entry.category}
                />)}
                {!filteredTimelineEntries.length && <p className="min-w-full rounded-xl border border-ink-700 bg-ink-900/40 p-5 text-center text-sm text-muted">{timelineEntries.length ? 'No entries match this filter.' : 'No activity has been recorded yet.'}</p>}
              </div>
            </div>
          </section>
          {selectedLead ? <section className="order-4 mt-3 rounded-xl border border-ink-600 bg-ink-900/30 p-3">
            <h2 className="text-sm font-semibold text-white">Lead progression</h2>
            {progressDeal ? <p className="mt-3 text-xs text-win">This lead is linked to deal {progressDeal.id} and follows its placement stages.</p> : <>
              <p className="mt-3 text-xs text-muted">Convert this lead to begin the placement stage workflow.</p>
              {!hasCompleteCommunicationChannels(selectedLead) && <p className="mt-2 text-xs text-warm">Complete valid phone, WhatsApp, and Telegram details first.</p>}
              <button type="button" className="btn-primary mt-3 !py-1.5" onClick={convertLead}><ArrowRight size={13} /> Convert to deal</button>
            </>}
          </section> : <section className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={15} className="text-brand-300" /> Compliance alerts</h2>
              <div className="mt-3 space-y-2 text-xs">
                {selectedItem && !hasCompleteCommunicationChannels(selectedItem)
                  ? <p className="flex gap-2 text-warm"><AlertTriangle size={14} className="shrink-0" /> Phone, WhatsApp and Telegram must be complete before tender or quotation.</p>
                  : <p className="flex gap-2 text-win"><Check size={14} /> Communication details are complete.</p>}
                {selectedClient?.accountStatus === 'draft' && <p className="flex gap-2 text-warm"><AlertTriangle size={14} /> Customer profile is still a draft.</p>}
                {selectedProduct?.isStatutoryMandatory && <p className="flex gap-2 text-warm"><AlertTriangle size={14} /> Statutory mandatory cover: confirm compliance evidence.</p>}
                {selectedProduct && <p className="text-muted">Required intake: {selectedProduct.keyUnderwritingIntakeArtifacts}</p>}
                {isStagnant && <p className="flex items-start gap-2 rounded-lg border border-hot/30 bg-hot/10 p-2 text-hot"><AlertTriangle size={14} className="shrink-0" /> This stage exceeded its {targetDays}-day target SLA.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Wallet size={15} className="text-brand-300" /> Quotes comparison</h2>
                <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => setActivityModal('quote')}><Plus size={12} /> Quote</button>
              </div>
              {visibleQuotes.length ? <div className="overflow-x-auto"><table className="w-full min-w-52 text-left text-xs">
                <thead className="text-[10px] uppercase text-muted"><tr><th className="pb-2 font-medium">Insurer</th><th className="pb-2 text-right font-medium">Premium</th><th className="pb-2 text-right font-medium">Date</th></tr></thead>
                <tbody>{visibleQuotes.map((quote) => <tr key={quote.id} className="border-t border-ink-700/60"><td className="py-2 text-white">{quote.insurer}</td><td className="py-2 text-right text-brand-300">{formatAmount(quote.quoteAmount ?? 0, quote.quoteCurrency ?? 'MVR')}</td><td className="py-2 text-right text-muted">{formatDate(quote.date)}</td></tr>)}</tbody>
              </table></div> : <p className="text-xs text-muted">No insurer quotes recorded. Add quotes to compare premium and terms.</p>}
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="text-sm font-semibold text-white">Binding actions</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost !px-2 !py-2 text-xs" disabled={!selectedDeal} onClick={() => setActivityModal('quote')}><FileText size={13} /> Add quote</button>
                <button type="button" className="btn-primary !px-2 !py-2 text-xs" disabled={!selectedDeal || !stages.find((stage) => isBoundStage(stage.name))} onClick={() => {
                  const finalStage = stages.find((stage) => isBoundStage(stage.name));
                  if (finalStage) requestStageChange(finalStage);
                }}><ShieldCheck size={13} /> Bind policy</button>
              </div>
              {selectedDeal?.linkedInvoiceId && <p className="mt-2 text-xs text-win">Invoice generated for this bound deal.</p>}
            </div>
          </section>}
        </>}
      </main>

    </div>
      )}
      <Modal open={addContactOpen} onClose={() => { setAddContactOpen(false); setAddContactError(''); setEditingContactId(''); }}
        title={editingContactId ? 'Edit contact' : 'Add lead contact'} subtitle={selectedItem?.client}
        footer={<><button type="button" className="btn-ghost" onClick={() => { setAddContactOpen(false); setAddContactError(''); setEditingContactId(''); }}>Cancel</button><button type="submit" form="lead-contact-form" className="btn-primary">{editingContactId ? <><Pencil size={14} /> Save Contact</> : <><Plus size={14} /> Add Contact</>}</button></>}>
        <form id="lead-contact-form" onSubmit={saveContactProfile} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *"><input className="input" name="name" required maxLength={120} value={contactEditorDraft.name}
            onChange={(event) => setContactEditorDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Role *"><select className="input" name="role" required value={contactEditorDraft.role}
            onChange={(event) => setContactEditorDraft((current) => ({ ...current, role: event.target.value }))}>
            <option>Decision Maker</option><option>Finance / Invoice</option><option>Risk Manager</option><option>Technical Lead</option><option>Other</option>
          </select></Field>
          <Field label="Email *"><input className="input" name="email" type="email" required value={contactEditorDraft.email}
            onChange={(event) => setContactEditorDraft((current) => ({ ...current, email: event.target.value }))} /></Field>
          <Field label="Phone *"><input className="input" name="phone" type="tel" required value={contactEditorDraft.phone}
            onChange={(event) => setContactEditorDraft((current) => ({ ...current, phone: event.target.value }))} /></Field>
          <Field label="WhatsApp"><input className="input" name="whatsapp" type="tel" value={contactEditorDraft.whatsapp}
            onChange={(event) => setContactEditorDraft((current) => ({ ...current, whatsapp: event.target.value }))} /></Field>
          <Field label="Telegram"><input className="input" name="telegram" value={contactEditorDraft.telegram}
            onChange={(event) => setContactEditorDraft((current) => ({ ...current, telegram: event.target.value }))} /></Field>
          <div className="sm:col-span-2">
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs"
              onClick={() => setContactEditorDraft((current) => ({ ...current, whatsapp: current.phone, telegram: current.phone }))}>
              Same as Phone
            </button>
            <p className="mt-1 text-[11px] text-muted">Copies this contact’s phone number into WhatsApp and Telegram.</p>
          </div>
          {addContactError && <p role="alert" className="sm:col-span-2 text-xs text-hot">{addContactError}</p>}
        </form>
      </Modal>
      <Modal open={Boolean(activityModal)} onClose={() => setActivityModal(null)}
        title={activityModal === 'meeting' ? 'Schedule / Log Meeting'
          : activityModal === 'quote' ? 'Add insurer quote'
            : activityModal === 'task' ? 'Schedule task' : 'Add note'}
        subtitle={selectedItem?.client}
        footer={<><button type="button" className="btn-ghost" onClick={() => setActivityModal(null)}>Cancel</button><button type="submit" form="workspace-activity-form" className="btn-primary">{activityModal === 'meeting' ? 'Save Meeting' : activityModal === 'task' ? 'Save task' : 'Save activity'}</button></>}>
        <form id="workspace-activity-form" onSubmit={addActivity} className="space-y-3">
          <Field label={activityModal === 'task' ? 'Task title' : 'Title'}><input className="input" name="title" required maxLength={120} placeholder={activityModal === 'meeting' ? 'Client placement review' : activityModal === 'quote' ? 'Commercial terms' : activityModal === 'task' ? 'Follow up with client' : 'Activity note'} /></Field>
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
          {activityModal === 'task' && <>
            <Field label="Due date & time *"><input className="input" name="activityDate" type="datetime-local" required defaultValue={localDateTimeInput()} /></Field>
            <Field label="Task details"><textarea className="input min-h-24" name="description" required placeholder="Describe the action, owner, or expected outcome." /></Field>
          </>}
          {activityModal === 'quote' && <>
            <Field label="Insurer"><input className="input" name="insurer" required placeholder="Insurer name" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Premium"><input className="input" name="quoteAmount" type="number" min="0" step="0.01" required /></Field><Field label="Currency"><select className="input" name="quoteCurrency" defaultValue="MVR"><option>MVR</option><option>USD</option></select></Field></div>
          </>}
          {activityModal !== 'meeting' && activityModal !== 'task' && <Field label={activityModal === 'quote' ? 'Terms / coverage notes' : 'Note'}><textarea className="input min-h-24" name="description" required placeholder="Record the terms, coverage, or next steps." /></Field>}
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

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-xs text-muted">{label}</div><div className="mt-1 break-words text-sm text-white">{value}</div></div>;
}

function ContactDirectory({
  contacts,
  primaryContactId,
  assignedContactId,
  onAssign,
  onEditContact,
  compact = false,
}: {
  contacts: CompanyContactProfile[];
  primaryContactId?: string;
  assignedContactId?: string;
  onAssign: (profileId: string) => void;
  onEditContact: (contact: CompanyContactProfile) => void;
  compact?: boolean;
}) {
  return <section className={compact ? '' : 'mt-3 border-t border-ink-700 pt-3'} aria-label="Customer contacts">
    <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? 'mb-1' : 'mb-2'}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white">Contacts <span className="ml-1 font-normal text-muted">{contacts.length}</span></h3>
      </div>
      {contacts.length > 1 && <select className="input !w-auto max-w-full !py-1.5 text-xs" aria-label="Assign primary contact"
        value={assignedContactId ?? ''} onChange={(event) => onAssign(event.target.value)}>
        <option value="" disabled>Select a contact</option>
        {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.role} · {contact.name}</option>)}
      </select>}
    </div>
    <div className="max-h-40 overflow-x-auto overflow-y-auto pr-1">
      {contacts.length > 0 ? <div className="min-w-[740px]">
        <dl className={`grid grid-cols-[minmax(130px,1.2fr)_minmax(150px,1.5fr)_repeat(3,minmax(115px,1fr))_32px] gap-3 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#B9C1CC] ${compact ? 'py-1' : 'pb-1.5'}`}>
          <dt>Name</dt><dt>Email</dt><dt>Phone</dt><dt>WhatsApp</dt><dt>Telegram</dt><dt><span className="sr-only">Edit</span></dt>
        </dl>
        <div className="divide-y divide-ink-700/70">
          {contacts.map((contact) => {
            const primary = contact.id === primaryContactId;
            return <article key={contact.id} className={`grid grid-cols-[minmax(130px,1.2fr)_minmax(150px,1.5fr)_repeat(3,minmax(115px,1fr))_32px] items-center gap-3 bg-ink-950/35 px-2 text-xs ${compact ? 'py-1.5' : 'py-2'}`}>
              <div className="flex min-w-0 items-center gap-1.5" title={`${contact.name}${contact.role ? ` · ${contact.role}` : ''}`}>
                <span className="min-w-0 truncate font-semibold text-white">{contact.name}</span>
                <span className="min-w-0 truncate text-[10px] text-muted">{contact.role}</span>
                {primary && <span className="shrink-0 text-[9px] uppercase tracking-wide text-brand-300">Primary</span>}
              </div>
              <span className="truncate text-[#DCE5E0]" title={contact.email || '—'}>{contact.email || '—'}</span>
              <span className="truncate text-[#DCE5E0]" title={contact.phone || '—'}>{contact.phone || '—'}</span>
              <span className="truncate text-[#DCE5E0]" title={contact.whatsapp || '—'}>{contact.whatsapp || '—'}</span>
              <span className="truncate text-[#DCE5E0]" title={contact.telegram || '—'}>{contact.telegram || '—'}</span>
              <button type="button" className="rounded-md p-1 text-muted transition hover:bg-ink-700 hover:text-white"
                aria-label={`Edit ${contact.name}`} title={`Edit ${contact.name}`}
                onClick={() => onEditContact(contact)}><Pencil size={13} /></button>
            </article>;
          })}
        </div>
      </div> : <p className="rounded-lg border border-ink-700 bg-ink-950/45 p-3 text-xs text-muted">No contacts are linked to this customer yet.</p>}
    </div>
  </section>;
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

function TimelineItem({ title, description, date, createdAt, elapsedFromPrevious, durationMinutes, category }: {
  title: string;
  description: string;
  date?: string;
  createdAt?: string;
  elapsedFromPrevious?: number;
  durationMinutes?: number;
  category: TimelineEntry['category'];
}) {
  const timestamp = date ? new Date(date) : null;
  const formattedTimestamp = timestamp && Number.isFinite(timestamp.getTime())
    ? `${formatDate(timestamp)} · ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  const createdTimestamp = createdAt ? new Date(createdAt) : null;
  const formattedCreatedTimestamp = createdTimestamp && Number.isFinite(createdTimestamp.getTime())
    ? `${formatDate(createdTimestamp)} · ${createdTimestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  const categoryLabel = category === 'appointment' ? 'Appointment'
    : category === 'proposal' ? 'Proposal'
      : category === 'stage' ? 'Stage change'
        : category === 'note' ? 'Note' : category === 'task' ? 'Task' : 'Activity';
  return <article className="timeline-card flex w-64 shrink-0 flex-col rounded-xl border border-ink-700 bg-ink-900/50 p-4 sm:w-72">
    <div className="flex items-center justify-between gap-2">
      <Badge variant={category === 'task' ? 'warm' : 'muted'}>{categoryLabel}</Badge>
      <time className="text-right text-[10px] text-muted">{formattedTimestamp}</time>
    </div>
    <h3 className="mt-3 min-h-10 text-sm font-medium text-white">{title}</h3>
    {description && <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{description}</p>}
    {elapsedFromPrevious !== undefined && <p className="mt-3 border-t border-ink-700 pt-2 text-[10px] text-muted">Since previous entry: {formatElapsedInterval(elapsedFromPrevious)}</p>}
    {formattedCreatedTimestamp && <p className="mt-2 text-[10px] text-muted">Logged: {formattedCreatedTimestamp}</p>}
    {durationMinutes !== undefined && <p className="mt-3 border-t border-ink-700 pt-2 text-[10px] text-muted">Duration: {durationMinutes} minutes</p>}
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}
