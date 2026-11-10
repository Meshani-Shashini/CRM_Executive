import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle, Archive, ArrowLeft, ArrowRight, Building2, CalendarDays, Check,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock3, Columns3, Filter, FileText, List,
  MoreHorizontal, Pencil, Plus, Search, ShieldCheck, Wallet, Trash2, TrendingUp, X,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import LeadTemperatureControl from '../components/LeadTemperatureControl';
import LeadContactSlaBadge from '../components/LeadContactSlaBadge';
import StageStepper from '../components/deal/StageStepper';
import Modal from '../components/ui/Modal';
import PageToolbar from '../components/ui/PageToolbar';
import ViewModeSwitcher from '../components/ui/ViewModeSwitcher';
import TableRowActionsMenu from '../components/ui/TableRowActionsMenu';
import TableShell from '../components/table/TableShell';
import StageMenu from '../components/table/StageMenu';
import { OwnerCell, ProductCodePill, StagePill, TableDateCell } from '../components/table/TableCells';
import ActivityTimelineItem from '../components/ActivityTimelineItem';
import { useApp } from '../store/AppContext';
import { AUTH_BYPASS, TENANT_ID } from '../lib/supabase';
import type { Activity, CompanyContactProfile, Deal, Lead, PipelineStage, StageHistoryAudit } from '../types';
import { formatAmount, toMvr } from '../utils/currency';
import { formatDate } from '../utils/date';
import { hasCompleteCommunicationChannels, requiresCommunicationChannels } from '../utils/communication';
import { hasCompleteClientProfile } from '../utils/customerProfile';
import {
  getStageSlaElapsedDays, isLostPipelineStage, isStageSlaOverdue, isTerminalDealStage, isWonPipelineStage,
} from '../utils/stageSla';
import { linkContactProfile, mergeContactProfiles, normalizeContactNumber } from '../utils/contactProfiles';
import { linkDealToLead } from '../utils/dealFactory';
import { DEAL_PIPELINE_STAGES, getPipelineLossReasons } from '../data/pipelineStageTemplates';
import {
  appendLeadStageTransition, buildLeadTelemetryStages, LEAD_LIFECYCLE_STAGES,
  isLeadLifecycleStage, isTerminalLeadStage, lifecycleStageForLead,
  parseLeadStageTransition, type LeadLifecycleStage,
} from '../utils/leadLifecycle';
import { formatStaffIdentifier } from '../utils/staff';
import { calculateLeadContactSla, getContactMadeSlaTargetDays, getLeadContactedAt } from '../utils/leadSla';
import { buildLeadConversion } from '../utils/leadConversion';
import { getNextActivity } from '../utils/nextActivity';
import { dashboardHref, hashParams, promptQuotationRequestForDeal } from '../utils/navigation';
import { nextLocalReference } from '../utils/references';

interface TimelineEntry {
  key: string;
  title: string;
  description: string;
  date: string;
  durationMinutes?: number;
  category: 'stage' | 'activity' | 'appointment' | 'proposal' | 'note' | 'task' | 'temperature' | 'call' | 'email' | 'upload';
  origin: 'Lead' | 'Deal' | 'Quotation';
  actor: string;
  activityId?: string;
  done?: boolean;
  scheduled?: boolean;
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

const dealListColumns = [
  { key: 'deal', label: 'Title' },
  { key: 'value', label: 'Value' },
  { key: 'client', label: 'Organization' },
  { key: 'contact', label: 'Contact Person' },
  { key: 'close', label: 'Expected Close Date' },
  { key: 'activity', label: 'Next Activity Date' },
  { key: 'owner', label: 'Owner' },
  { key: 'stage', label: 'Stage' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'actions', label: 'Actions' },
] as const;

const workspaceListColumns = [
  { key: 'deal', label: 'Deal' },
  { key: 'client', label: 'Client' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'stage', label: 'Stage' },
  { key: 'product', label: 'Insurance' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'value', label: 'Value' },
  { key: 'owner', label: 'Owner' },
  { key: 'activity', label: 'Next activity' },
  { key: 'close', label: 'Expected close' },
  { key: 'actions', label: 'Actions' },
] as const;

type DealsView = 'pipeline' | 'list' | 'forecast' | 'archive';
type ConditionField = 'owner' | 'client' | 'stage' | 'vendor' | 'product' | 'value' | 'closeDate' | 'activity';
type ConditionOperator = 'is' | 'is not' | 'contains' | '>' | '<' | 'between' | 'empty';
interface DealFilterCondition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
  secondValue: string;
}

interface DealActivityState {
  date?: string;
  title?: string;
  state: 'overdue' | 'today' | 'future' | 'none';
}

function DealActivityIndicator({ activity, compact = false }: { activity: DealActivityState; compact?: boolean }) {
  const label = activity.state === 'overdue'
    ? 'View overdue activity'
    : activity.state === 'today' || activity.state === 'none'
      ? activity.title ?? 'No activity scheduled'
      : activity.title ?? 'Scheduled activity';
  const color = activity.state === 'overdue'
    ? 'bg-hot text-hot'
    : activity.state === 'future'
      ? 'bg-emerald-400 text-emerald-300'
      : 'bg-amber-400 text-amber-300';
  return <span className="inline-flex min-w-0 items-center gap-1.5" aria-label={label}
    title={`${label}${activity.date ? ` · ${localDate(activity.date)}` : ''}`}>
    <span className={`h-2 w-2 shrink-0 rounded-full ${color.split(' ')[0]}`} aria-hidden="true" />
    {!compact && <span className={`truncate text-[10px] ${color.split(' ')[1]}`}>{activity.date ? localDate(activity.date) : 'No activity'}</span>}
  </span>;
}

const CONDITION_FIELDS: { value: ConditionField; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'client', label: 'Client' },
  { value: 'stage', label: 'Stage' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'product', label: 'Insurance type' },
  { value: 'value', label: 'Value' },
  { value: 'closeDate', label: 'Expected close' },
  { value: 'activity', label: 'Next activity' },
];

const CONDITION_OPERATORS: ConditionOperator[] = ['is', 'is not', 'contains', '>', '<', 'between', 'empty'];

function isClosedDeal(deal: Deal, stage?: PipelineStage) {
  return isTerminalDealStage(deal.stage, deal.disposition, stage);
}

function isWonDeal(deal: Deal, stage?: PipelineStage) {
  return deal.disposition === 'won' || Boolean(stage?.isClosedWon) || (!stage && isWonPipelineStage(deal.stage));
}

function localDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA') : '';
}

function dateAtLocalMidnight(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return [year, month, day].every(Number.isFinite)
    ? new Date(year, month - 1, day)
    : new Date(value);
}

function forecastPeriods(mode: 'month' | 'quarter', offset: number, now = new Date()) {
  return Array.from({ length: 4 }, (_, index) => {
    const shift = offset + index;
    const start = new Date(now.getFullYear(), mode === 'month' ? now.getMonth() + shift : Math.floor(now.getMonth() / 3) * 3 + shift * 3, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + (mode === 'month' ? 1 : 3), 1);
    return {
      start,
      end,
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: mode === 'month'
        ? start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`,
      startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
    };
  });
}

function isLostStage(stage: string | PipelineStage) {
  return isLostPipelineStage(stage);
}

function isBoundStage(stage: string | PipelineStage) {
  return isWonPipelineStage(stage);
}

function stageBadgeTone(stage: string | PipelineStage): 'hot' | 'warm' | 'win' | 'brand' {
  const name = typeof stage === 'string' ? stage : stage.name;
  if (isLostStage(stage)) return 'hot';
  if (name.toLowerCase().includes('converted to deal')) return 'win';
  if (isBoundStage(stage)) return 'win';
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

function formatDurationDays(milliseconds: number | undefined) {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
  const days = Math.floor(milliseconds / 86400000);
  return days === 0 ? '<1d' : `${days}d`;
}

function formatActiveDuration(startDate: string | undefined, now: number) {
  if (!startDate) return undefined;
  const start = Date.parse(startDate);
  if (!Number.isFinite(start) || start > now) return undefined;
  const startDay = new Date(start);
  const nowDay = new Date(now);
  const startDateUtc = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate());
  const currentDateUtc = Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth(), nowDay.getUTCDate());
  const elapsedDays = Math.floor((currentDateUtc - startDateUtc) / 86400000);
  return elapsedDays <= 0 ? 'NOW' : `${elapsedDays}d`;
}

function formatElapsedCalendarDays(startDate: string | undefined, now: number) {
  if (!startDate) return undefined;
  const start = Date.parse(startDate);
  if (!Number.isFinite(start) || start > now) return undefined;
  return formatMeasuredDays(now - start);
}

function formatMeasuredDays(milliseconds: number | undefined) {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
  return formatDurationDays(milliseconds);
}

function elapsedBetweenDates(startDate: string | undefined, endDate: string | undefined) {
  if (!startDate || !endDate) return undefined;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? end - start
    : undefined;
}

function stageDateFromFields(stage: {
  enteredAt?: unknown;
  entered_at?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  date?: unknown;
  createdAt?: unknown;
  startDate?: unknown;
  start_date?: unknown;
}) {
  const candidates = [
    stage.enteredAt,
    stage.entered_at,
    stage.timestamp,
    stage.created_at,
    stage.date,
    stage.createdAt,
    stage.startDate,
    stage.start_date,
  ];
  for (const candidate of candidates) {
    const timestamp = candidate instanceof Date
      ? candidate.getTime()
      : typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? Date.parse(candidate)
          : Number.NaN;
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return undefined;
}

function formatDays(milliseconds: number | undefined) {
  return milliseconds === undefined || !Number.isFinite(milliseconds)
    ? undefined
    : `${Math.floor(Math.max(0, milliseconds) / 86400000)}d`;
}

function formatInterStageDays(milliseconds: number | undefined) {
  return formatDurationDays(milliseconds);
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

function isBusinessActivity(activity: Activity) {
  if (!activity.id.startsWith('audit-')) return true;
  return /^(?:Lead|Deal) created$|^(?:Lead|Deal) stage changed:|^Lead temperature changed:|^Deal expected close changed$/.test(activity.title)
    || /^Quotation request (?:created|status changed)$/.test(activity.title)
    || (activity.title === 'Lead updated' && activity.description.includes('Activity status:'));
}

export default function DealWorkspace({
  deals,
  onEditDeal,
  onEditLead,
  onDeleteLead,
  onDeleteDeal,
  onOpenFilters,
  pipelineFilter,
  onPipelineFilterChange,
  dealsPageMode = false,
  onLegacyImport,
  initialSelectedKey,
  onClose,
}: {
  deals: Deal[];
  onEditDeal?: (deal: Deal) => void;
  onEditLead?: (lead: Lead) => void;
  onDeleteLead?: (lead: Lead) => void;
  onDeleteDeal?: (deal: Deal) => void;
  onOpenFilters?: () => void;
  pipelineFilter?: string;
  onPipelineFilterChange?: (pipelineId: string) => void;
  dealsPageMode?: boolean;
  onLegacyImport?: () => void;
  initialSelectedKey?: string;
  onClose?: () => void;
}) {
  const {
    activities, setActivities, clients, setClients, deals: allDeals, setDeals, leads, setLeads,
    products, pipelines, pipelineStages, stageHistory, setStageHistory, invoices, setInvoices, user, users, vendors, viewAsRole,
    quotationRequests, company,
  } = useApp();
  const [selectedKey, setSelectedKey] = useState(() => {
    const dealId = dealsPageMode ? hashParams().get('id') : null;
    return dealId ? `deal:${dealId}` : '';
  });
  const [workspaceView, setWorkspaceView] = useState<'list' | 'kanban' | 'inspection' | DealsView>(() => {
    if (!dealsPageMode) return 'list';
    const view = hashParams().get('view');
    if (view === 'inspection') return view;
    return view === 'list' || view === 'forecast' || view === 'archive' || view === 'pipeline' ? view : 'list';
  });
  const [kanbanPipelineId, setKanbanPipelineId] = useState('');
  const selectedPipelineFilter = pipelineFilter ?? kanbanPipelineId;
  const changePipelineFilter = onPipelineFilterChange ?? setKanbanPipelineId;
  const [dealListSearch, setDealListSearch] = useState('');
  const [filterConditions, setFilterConditions] = useState<DealFilterCondition[]>([]);
  const [conditionBuilderOpen, setConditionBuilderOpen] = useState(false);
  const [conditionDraft, setConditionDraft] = useState<DealFilterCondition>({
    id: '',
    field: 'owner',
    operator: 'is',
    value: '',
    secondValue: '',
  });
  const [sortKey, setSortKey] = useState<'deal' | 'client' | 'contact' | 'pipeline' | 'stage' | 'product' | 'vendor' | 'value' | 'owner' | 'activity' | 'close'>('close');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortTouched, setSortTouched] = useState(false);
  const [pipelineSort, setPipelineSort] = useState<'activity' | 'value' | 'close' | 'created'>('activity');
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'won' | 'lost'>('all');
  const [forecastMode, setForecastMode] = useState<'month' | 'quarter'>('month');
  const [forecastOffset, setForecastOffset] = useState(0);
  const [openDealActionsId, setOpenDealActionsId] = useState('');
  const [dealActionsAnchor, setDealActionsAnchor] = useState<HTMLButtonElement | null>(null);
  const [openStageMenuId, setOpenStageMenuId] = useState('');
  const [stageMenuAnchor, setStageMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [activityModal, setActivityModal] = useState<'meeting' | 'note' | 'quote' | 'task' | 'schedule' | null>(null);
  const [moveStage, setMoveStage] = useState<PipelineStage | null>(null);
  const [moveOutcome, setMoveOutcome] = useState<'won' | 'lost' | null>(null);
  const [lossReason, setLossReason] = useState('');
  const [winReason, setWinReason] = useState('');
  const [moveError, setMoveError] = useState('');
  const [stageChangeRemarks, setStageChangeRemarks] = useState('');
  const [pendingLeadTelemetryStage, setPendingLeadTelemetryStage] = useState<LeadLifecycleStage | null>(null);
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
  ], [deals, leads]);

  const selected = records.find((record) => record.key === selectedKey);
  const selectedDeal = selected?.kind === 'deal' ? selected.item as Deal : undefined;
  const selectedLead = selected?.kind === 'lead' ? selected.item as Lead : undefined;
  const selectedItem = selectedDeal ?? selectedLead;
  const progressDeal = selectedDeal ?? (selectedLead
    ? allDeals.find((deal) => deal.id === selectedLead.dealId || deal.leadId === selectedLead.id)
    : undefined);
  const linkedLead = selectedLead ?? (selectedDeal
    ? leads.find((lead) => lead.id === selectedDeal.leadId || lead.dealId === selectedDeal.id)
    : undefined);
  const timelineLead = selectedLead ?? linkedLead;
  const linkedQuotationRequests = quotationRequests.filter((request) =>
    (Boolean(selectedDeal) && request.dealId === selectedDeal?.id)
    || (Boolean(linkedLead) && request.leadId === linkedLead?.id)
    || (Boolean(progressDeal) && request.dealId === progressDeal?.id),
  );
  const activeRole = viewAsRole ?? user.role;
  const dealHasInvoice = Boolean(selectedDeal && (selectedDeal.linkedInvoiceId
    || invoices.some((invoice) => invoice.linkedDealId === selectedDeal.id)));
  const selectedClient = selectedItem ? clientForItem(selectedItem, clients) : undefined;
  const relevantLeadId = selectedLead?.id;
  const relevantDealId = selectedDeal?.id ?? selectedLead?.dealId;
  const assignedContactId = selectedLead?.contactProfileId ?? selectedDeal?.contactProfileId ?? linkedLead?.contactProfileId;
  const clientContacts = selectedClient?.contacts?.filter((profile) =>
    profile.id === assignedContactId
    || Boolean(relevantLeadId && profile.linkedLeadIds?.includes(relevantLeadId))
    || Boolean(relevantDealId && profile.linkedDealIds?.includes(relevantDealId))) ?? [];
  const itemContacts = linkedLead?.contacts?.filter((profile) => selectedLead
    || profile.id === assignedContactId
    || Boolean(selectedDeal && profile.linkedDealIds?.includes(selectedDeal.id))) ?? [];
  const contactProfiles = mergeContactProfiles(clientContacts, itemContacts)
    .filter((profile) => profile.name.trim() || profile.email.trim() || profile.phone.trim()
      || profile.whatsapp?.trim() || profile.telegram?.trim());
  const primaryContactName = selectedLead?.contact || selectedDeal?.contactName || linkedLead?.contact || selectedClient?.contactPerson || '';
  const primaryContactEmail = selectedLead?.contactEmail || selectedDeal?.contactEmail || linkedLead?.contactEmail || '';
  const primaryContactNumber = normalizeContactNumber(selectedLead?.contactPhone || selectedDeal?.contactPhone || linkedLead?.contactPhone);
  const primaryContactProfile = contactProfiles.find((profile) =>
    assignedContactId === profile.id
    || Boolean(primaryContactEmail && profile.email.trim().toLowerCase() === primaryContactEmail.trim().toLowerCase())
    || Boolean(primaryContactNumber && normalizeContactNumber(profile.phone) === primaryContactNumber));
  const resolvedContactPhone = selectedLead?.contactPhone || selectedDeal?.contactPhone || linkedLead?.contactPhone
    || primaryContactProfile?.phone || selectedClient?.phone || '';
  const resolvedWhatsapp = selectedLead?.whatsapp || selectedDeal?.whatsapp || linkedLead?.whatsapp || primaryContactProfile?.whatsapp || '';
  const resolvedTelegram = selectedLead?.telegram || selectedDeal?.telegram || linkedLead?.telegram || primaryContactProfile?.telegram || '';
  const primaryContact: CompanyContactProfile | undefined = primaryContactName.trim() ? {
    ...primaryContactProfile,
    id: primaryContactProfile?.id ?? selectedLead?.contactProfileId ?? selectedDeal?.contactProfileId ?? `primary-${selectedItem?.id ?? 'contact'}`,
    name: primaryContactName,
    role: selectedLead?.contactRole ?? selectedDeal?.contactRole ?? linkedLead?.contactRole ?? primaryContactProfile?.role ?? 'Decision Maker',
    email: selectedLead?.contactEmail || selectedDeal?.contactEmail || linkedLead?.contactEmail || primaryContactProfile?.email || '',
    phone: selectedLead?.contactPhone || selectedDeal?.contactPhone || linkedLead?.contactPhone || primaryContactProfile?.phone || '',
    whatsapp: selectedLead?.whatsapp || selectedDeal?.whatsapp || linkedLead?.whatsapp || primaryContactProfile?.whatsapp || '',
    telegram: selectedLead?.telegram || selectedDeal?.telegram || linkedLead?.telegram || primaryContactProfile?.telegram || '',
  } : undefined;
  const detailContacts = mergeContactProfiles(primaryContact ? [primaryContact] : undefined, contactProfiles)
    .filter((profile) => profile.name.trim() || profile.email.trim() || profile.phone.trim()
      || profile.whatsapp?.trim() || profile.telegram?.trim());
  const selectedProduct = products.find((product) => product.code === selectedItem?.productCode)
    ?? products.find((product) => product.name === (selectedDeal?.product ?? ''));
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedItem?.pipelineId);
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const stages = pipelineStages.filter((stage) => stage.pipelineId === progressDeal?.pipelineId)
    .sort((left, right) => left.stageOrder - right.stageOrder);
  const selectedLeadProbability = selectedLead && progressDeal
    ? stages.find((stage) => stage.name === progressDeal.stage)?.winProbabilityPct
      ?? (Number.isFinite(progressDeal.probability) ? progressDeal.probability : undefined)
    : undefined;
  const currentStage = stages.find((stage) => stage.name === progressDeal?.stage);
  const dealStageStatus = progressDeal?.disposition === 'lost' || isLostStage(currentStage ?? progressDeal?.stage ?? '')
    ? 'lost'
    : progressDeal?.disposition === 'won' || isBoundStage(currentStage ?? progressDeal?.stage ?? '')
      ? 'won'
      : 'open';
  const relatedLeadId = selectedDeal?.leadId ?? selectedLead?.id;
  const relatedDealId = selectedDeal?.id ?? selectedLead?.dealId ?? progressDeal?.id;
  const selectedActivities = activities
    .filter((activity) => (Boolean(relatedDealId) && activity.dealId === relatedDealId)
      || (Boolean(relatedLeadId) && activity.leadId === relatedLeadId))
    .filter(isBusinessActivity)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const leadAuditActivities = timelineLead
    ? activities.filter((activity) => activity.id.startsWith('audit-')
      && activity.leadId === timelineLead.id
      && /^Lead (?:created|updated|stage changed|temperature changed):?/.test(activity.title))
    : [];
  const leadCreatedAt = timelineLead
    ? [
      timelineLead.createdAt,
      timelineLead.created_at,
      timelineLead.startDate,
      timelineLead.start_date,
      leadAuditActivities.find((activity) => activity.title === 'Lead created')?.date,
    ]
      .find((timestamp): timestamp is string => Boolean(timestamp && Number.isFinite(Date.parse(timestamp))))
    : undefined;
  const quotes = selectedActivities.filter((activity) => activity.type === 'quote' && activity.quoteAmount !== undefined);
  const selectedHistory = progressDeal
    ? stageHistory.filter((entry) => entry.dealId === progressDeal.id).sort((left, right) => Date.parse(left.enteredAt) - Date.parse(right.enteredAt))
    : [];
  const stageEntry = !selectedLead ? selectedHistory.find((entry) => !entry.exitedAt) : undefined;
  const enteredAt = (selectedLead
    ? [selectedLead.stage_changed_at, selectedLead.stageChangedAt, selectedLead.routedAt, leadCreatedAt]
    : [stageEntry?.enteredAt, progressDeal?.stageChangedAt, progressDeal?.createdAt])
    .find((timestamp): timestamp is string => Boolean(timestamp && Number.isFinite(Date.parse(timestamp))));
  const activeProgressStage = selectedLead
    ? lifecycleStageForLead(selectedLead, Boolean(progressDeal))
    : progressDeal?.stage ?? '';
  const progressStages: readonly (PipelineStage | string)[] = selectedLead
    ? [
      ...LEAD_LIFECYCLE_STAGES.filter((stage) => stage !== 'Converted to deal' && stage !== 'Lost'),
      activeProgressStage === 'Lost' ? 'Lost' : 'Converted to deal',
    ]
    : stages;
  const activeProgressIndex = progressStages.findIndex((stage) => (typeof stage === 'string' ? stage : stage.name) === activeProgressStage);
  const activeTargetStage = selectedLead || !selectedDeal
    || isTerminalDealStage(selectedDeal.stage, selectedDeal.disposition, currentStage)
    ? undefined
    : currentStage;
  const targetDays = activeTargetStage?.stagnationDaysThreshold ?? 0;
  const stageEnteredAt = enteredAt ? Date.parse(enteredAt) : Number.NaN;
  const hasStageTimestamp = Number.isFinite(stageEnteredAt);
  const elapsedMilliseconds = hasStageTimestamp ? Math.max(0, clockNow - stageEnteredAt) : undefined;
  const activeSlaHealth = stageSlaHealth(elapsedMilliseconds, targetDays);
  const isStagnant = activeSlaHealth === 'overdue';
  const activityLeadStageHistory = selectedActivities
    .map((activity) => {
      const transition = parseLeadStageTransition(activity.title);
      return transition ? { ...transition, date: activity.date } : undefined;
    })
    .filter((transition): transition is { from: LeadLifecycleStage; to: LeadLifecycleStage; date: string } => Boolean(transition))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const leadStageHistoryByTimestamp = new Map<string, { from: LeadLifecycleStage; to: LeadLifecycleStage; date: string }>();
  for (const transition of [
    ...(timelineLead?.stageHistory ?? []).flatMap((entry) => {
      const date = stageDateFromFields(entry);
      return isLeadLifecycleStage(entry.fromStage) && isLeadLifecycleStage(entry.toStage) && date
        ? [{ from: entry.fromStage, to: entry.toStage, date }]
        : [];
    }),
    ...activityLeadStageHistory,
  ]) {
    leadStageHistoryByTimestamp.set(`${transition.from}\0${transition.to}\0${Date.parse(transition.date)}`, transition);
  }
  const leadStageHistory = [...leadStageHistoryByTimestamp.values()]
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const leadStageTimelineEntries: TimelineEntry[] = leadStageHistory.map((transition) => {
    const audit = selectedActivities.find((activity) => {
      const parsed = parseLeadStageTransition(activity.title);
      return parsed?.from === transition.from && parsed.to === transition.to
        && Date.parse(activity.date) === Date.parse(transition.date);
    });
    const actor = audit?.actorName
      ?? users.find((person) => person.id === audit?.userId)?.name
      ?? (audit?.userId ? formatStaffIdentifier(audit.userId) : timelineLead?.ownerId
        ? users.find((person) => person.id === timelineLead.ownerId)?.name ?? formatStaffIdentifier(timelineLead.ownerId)
        : 'System');
    return {
      key: `lead-stage-${timelineLead?.id}-${transition.from}-${transition.to}-${Date.parse(transition.date)}`,
      title: `Stage changed: ${transition.from} → ${transition.to}`,
      description: audit?.description ?? '',
      date: transition.date,
      category: 'stage',
      origin: 'Lead',
      actor,
    };
  });
  const structuredLeadTelemetry = selectedLead
    ? buildLeadTelemetryStages(selectedLead, new Date(clockNow))
    : [];
  const firstStoredLeadTransition = selectedLead?.stageHistory?.find((transition) =>
    transition.fromStage === 'Lead Identified' && stageDateFromFields(transition));
  const inferredLeadCreatedAt = firstStoredLeadTransition
    && Number.isFinite(firstStoredLeadTransition.durationDays)
    && firstStoredLeadTransition.durationDays >= 0
    ? new Date(Date.parse(stageDateFromFields(firstStoredLeadTransition) as string) - firstStoredLeadTransition.durationDays * 86400000).toISOString()
    : undefined;
  const leadStartDate = selectedLead
    ? leadCreatedAt
      ?? inferredLeadCreatedAt
      ?? stageDateFromFields({ startDate: selectedLead.startDate, start_date: selectedLead.start_date })
      ?? selectedLead.routedAt
      ?? selectedLead.stage_changed_at
      ?? selectedLead.stageChangedAt
      ?? enteredAt
      ?? new Date(clockNow).toISOString()
    : undefined;
  const progressStartDate = selectedLead
    ? leadStartDate
    : selectedHistory[0]?.enteredAt ?? progressDeal?.createdAt ?? enteredAt;
  const progressStartMilliseconds = progressStartDate ? Date.parse(progressStartDate) : Number.NaN;
  const stageTimeline = progressStages.map((stage, index) => {
    const name = typeof stage === 'string' ? stage : stage.name;
    const pipelineStage = typeof stage === 'string' ? undefined : stage;
    if (progressDeal && !selectedLead) {
      const history = pipelineStage
        ? selectedHistory.find((entry) => entry.toStageId === pipelineStage.id)
        : undefined;
      const historyIndex = history ? selectedHistory.indexOf(history) : -1;
      const nextHistoryEntry = historyIndex >= 0 ? selectedHistory[historyIndex + 1] : undefined;
      const stageStart = history?.enteredAt
        ?? (index === 0 ? progressDeal.createdAt : undefined)
        ?? (name === progressDeal.stage ? progressDeal.stageChangedAt ?? progressDeal.createdAt : undefined);
      const isCurrent = name === progressDeal.stage;
      const terminalReached = isCurrent && isTerminalDealStage(name, progressDeal.disposition, pipelineStage);
      const stageEnd = history?.exitedAt
        ?? nextHistoryEntry?.enteredAt
        ?? (terminalReached ? stageStart : isCurrent && stageStart ? new Date(clockNow).toISOString() : undefined);
      const startMs = stageStart ? Date.parse(stageStart) : Number.NaN;
      const endMs = stageEnd ? Date.parse(stageEnd) : Number.NaN;
      const cumulative = Number.isFinite(startMs) && Number.isFinite(progressStartMilliseconds)
        ? Math.max(0, (isCurrent && !terminalReached ? clockNow : Number.isFinite(endMs) ? endMs : startMs) - progressStartMilliseconds)
        : undefined;
      return {
        key: pipelineStage?.id ?? name,
        name,
        index,
        active: isCurrent && !terminalReached,
        done: (activeProgressIndex >= 0 && index < activeProgressIndex) || terminalReached,
        enteredAt: stageStart,
        duration: Number.isFinite(startMs) && Number.isFinite(endMs)
          ? Math.max(0, endMs - startMs)
          : typeof history?.durationSeconds === 'number' && Number.isFinite(history.durationSeconds)
            ? Math.max(0, history.durationSeconds * 1000)
            : undefined,
        cumulative,
        targetDays: terminalReached ? 0 : pipelineStage?.stagnationDaysThreshold ?? 0,
      };
    }

    const storedStage = structuredLeadTelemetry.find((entry) => entry.stage === name);
    const transitionIn = leadStageHistory.find((transition) => transition.to === name);
    const transitionOut = leadStageHistory.find((transition) => transition.from === name);
    const isCurrent = name === activeProgressStage;
    const stageStart = storedStage?.entered_at
      ?? transitionIn?.date
      ?? (index === 0 ? leadStartDate : undefined)
      ?? (isCurrent ? selectedLead?.stage_changed_at ?? selectedLead?.stageChangedAt ?? selectedLead?.routedAt ?? leadStartDate : undefined);
    const terminalReached = isCurrent && (name === 'Converted to deal' || name === 'Lost');
    const stageEnd = storedStage?.exited_at
      ?? transitionOut?.date
      ?? (isCurrent && !terminalReached && stageStart ? new Date(clockNow).toISOString() : undefined);
    const startMs = stageStart ? Date.parse(stageStart) : Number.NaN;
    const endMs = stageEnd ? Date.parse(stageEnd) : Number.NaN;
    const cumulativeEnd = terminalReached && Number.isFinite(startMs)
      ? startMs
      : isCurrent ? clockNow : Number.isFinite(endMs) ? endMs : startMs;
    const cumulative = Number.isFinite(startMs) && Number.isFinite(progressStartMilliseconds)
      ? Math.max(0, cumulativeEnd - progressStartMilliseconds)
      : undefined;
    return {
      key: name,
      name,
      index,
      active: isCurrent && !terminalReached,
      done: (activeProgressIndex >= 0 && index < activeProgressIndex) || terminalReached,
      enteredAt: stageStart,
      duration: Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, endMs - startMs)
        : undefined,
      cumulative,
      targetDays: 0,
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
    const recordStage = recordDeal ? recordStages.find((stage) => stage.name === recordDeal.stage) : undefined;
    if (!recordDeal || !recordStage || isTerminalDealStage(recordDeal.stage, recordDeal.disposition, recordStage)) {
      return { overdue: false, targetDays: 0 };
    }
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
  const selectedSlaStatus = selected
    ? selected.kind === 'lead' && !progressDeal
      ? calculateLeadContactSla(
        selected.item as Lead,
        getContactMadeSlaTargetDays(selected.item as Lead, pipelineStages),
        clockNow,
      )
      : recordSlaStatus(selected)
    : undefined;
  const dealReferences = useMemo(() => {
    const sortedDeals = [...allDeals].sort((left, right) => {
      const leftYear = (left.createdAt ? new Date(left.createdAt).getFullYear() : new Date().getFullYear());
      const rightYear = (right.createdAt ? new Date(right.createdAt).getFullYear() : new Date().getFullYear());
      return leftYear - rightYear
        || (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
        || left.id.localeCompare(right.id);
    });
    const yearSequence = new Map<number, number>();
    return new Map(sortedDeals.map((deal) => {
      const timestamp = deal.createdAt ? Date.parse(deal.createdAt) : Number.NaN;
      const year = Number.isFinite(timestamp) ? new Date(timestamp).getFullYear() : new Date().getFullYear();
      const sequence = (yearSequence.get(year) ?? 0) + 1;
      yearSequence.set(year, sequence);
      return [deal.id, deal.reference ?? (AUTH_BYPASS ? `DL-${year}-${String(sequence).padStart(4, '0')}` : '')];
    }));
  }, [allDeals]);
  const dealTitle = (deal: Deal) => leads.find((lead) => lead.id === deal.leadId || lead.dealId === deal.id)?.title
    ?? deal.proposalSummary
    ?? `${deal.product} placement`;
  const ownerNameForDeal = (deal: Deal) => users.find((person) => person.id === deal.ownerId)?.name
    ?? formatStaffIdentifier(deal.ownerId);
  const contactNameForDeal = (deal: Deal) => deal.contactName
    ?? clients.find((client) => client.id === deal.clientId)?.contactPerson
    ?? '';
  const activityForDeal = (deal: Deal): DealActivityState => {
    const linkedLeadId = leads.find((lead) => lead.id === deal.leadId || lead.dealId === deal.id)?.id;
    return getNextActivity(activities, {
      dealId: deal.id,
      leadId: linkedLeadId ?? deal.leadId,
      legacyDueDate: deal.nextActivityAt,
      legacyTitle: deal.nextActivityTitle,
    });
  };
  const productForDeal = (deal: Deal) => products.find((product) => product.code === deal.productCode)
    ?? products.find((product) => product.name.trim().toLowerCase() === deal.product.trim().toLowerCase());
  const conditionValue = (deal: Deal, field: ConditionField) => {
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    const activity = activityForDeal(deal);
    switch (field) {
      case 'owner': return ownerNameForDeal(deal);
      case 'client': return deal.client;
      case 'stage': return deal.stage;
      case 'vendor': return vendors.find((item) => item.id === deal.vendorId)?.name ?? deal.insurer ?? '';
      case 'product': return productForDeal(deal)?.name ?? deal.product;
      case 'value': return deal.value;
      case 'closeDate': return deal.closeDate ?? '';
      case 'activity': return activity.title ?? '';
      default: return stage?.name ?? '';
    }
  };
  const conditionMatches = (deal: Deal, condition: DealFilterCondition) => {
    const current = conditionValue(deal, condition.field);
    if (condition.operator === 'empty') return current === '' || current === undefined || current === null;
    if (condition.operator === 'between') {
      const currentNumber = condition.field === 'value' ? Number(current) : Date.parse(String(current));
      const first = condition.field === 'value' ? Number(condition.value) : Date.parse(condition.value);
      const second = condition.field === 'value' ? Number(condition.secondValue) : Date.parse(condition.secondValue);
      return Number.isFinite(currentNumber) && Number.isFinite(first) && Number.isFinite(second)
        && currentNumber >= Math.min(first, second) && currentNumber <= Math.max(first, second);
    }
    if (condition.operator === '>' || condition.operator === '<') {
      const left = condition.field === 'value' ? Number(current) : Date.parse(String(current));
      const right = condition.field === 'value' ? Number(condition.value) : Date.parse(condition.value);
      return Number.isFinite(left) && Number.isFinite(right) && (condition.operator === '>' ? left > right : left < right);
    }
    const left = String(current ?? '').toLowerCase();
    const right = condition.value.toLowerCase();
    return condition.operator === 'is' ? left === right
      : condition.operator === 'is not' ? left !== right
        : left.includes(right);
  };
  const listDeals = deals.filter((deal) => {
    if (selectedPipelineFilter && deal.pipelineId !== selectedPipelineFilter) return false;
    if (filterConditions.some((condition) => !conditionMatches(deal, condition))) return false;
    const vendor = vendors.find((item) => item.id === deal.vendorId)?.name ?? deal.insurer;
    const title = dealTitle(deal);
    const reference = dealReferences.get(deal.id) ?? deal.id;
    const searchable = `${reference} ${deal.id} ${title} ${deal.client} ${vendor}`.toLowerCase();
    return searchable.includes(dealListSearch.trim().toLowerCase());
  });
  const sortedListDeals = [...listDeals].sort((left, right) => {
    const leftValue = sortKey === 'deal' ? dealTitle(left)
      : sortKey === 'client' ? left.client
        : sortKey === 'contact' ? contactNameForDeal(left)
        : sortKey === 'pipeline' ? pipelines.find((pipeline) => pipeline.id === left.pipelineId)?.name ?? ''
          : sortKey === 'stage' ? left.stage
            : sortKey === 'product' ? productForDeal(left)?.name ?? left.product
              : sortKey === 'vendor' ? vendors.find((vendor) => vendor.id === left.vendorId)?.name ?? left.insurer
                : sortKey === 'value' ? left.value
                  : sortKey === 'owner' ? ownerNameForDeal(left)
                    : sortKey === 'activity' ? Date.parse(activityForDeal(left).date ?? '')
                      : Date.parse(left.closeDate ?? '');
    const rightValue = sortKey === 'deal' ? dealTitle(right)
      : sortKey === 'client' ? right.client
        : sortKey === 'contact' ? contactNameForDeal(right)
        : sortKey === 'pipeline' ? pipelines.find((pipeline) => pipeline.id === right.pipelineId)?.name ?? ''
          : sortKey === 'stage' ? right.stage
            : sortKey === 'product' ? productForDeal(right)?.name ?? right.product
              : sortKey === 'vendor' ? vendors.find((vendor) => vendor.id === right.vendorId)?.name ?? right.insurer
                : sortKey === 'value' ? right.value
                  : sortKey === 'owner' ? ownerNameForDeal(right)
                    : sortKey === 'activity' ? Date.parse(activityForDeal(right).date ?? '')
                      : Date.parse(right.closeDate ?? '');
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue));
    return comparison * (sortDirection === 'asc' ? 1 : -1);
  });
  const archiveDeals = sortedListDeals.filter((deal) => {
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    if (!isClosedDeal(deal, stage)) return false;
    return archiveFilter === 'all' || (archiveFilter === 'won' ? isWonDeal(deal, stage) : !isWonDeal(deal, stage));
  });
  const kanbanPipeline = activePipelines.find((pipeline) => pipeline.id === selectedPipelineFilter);
  const kanbanPipelines = selectedPipelineFilter
    ? activePipelines.filter((pipeline) => pipeline.id === selectedPipelineFilter)
    : activePipelines;
  const kanbanStagePipelineId = kanbanPipelines[0]?.id;
  const kanbanStages = DEAL_PIPELINE_STAGES.map((template, index) =>
    pipelineStages.find((stage) => stage.pipelineId === kanbanStagePipelineId && stage.name === template.name)
    ?? {
      ...template,
      id: `open-stage-${index + 1}`,
      pipelineId: kanbanStagePipelineId ?? '',
      stageOrder: index + 1,
    });
  const pipelineLabelForDeal = (deal: Deal) => {
    const pipeline = pipelines.find((item) => item.id === deal.pipelineId);
    return pipeline?.code.toUpperCase() === 'COMMERCIAL' ? 'Commercial'
      : pipeline?.code.toUpperCase() === 'SME_VELOCITY' ? 'SME'
        : pipeline?.code.toUpperCase() === 'RENEWALS' ? 'Renewals'
          : pipeline?.name ?? 'Unknown pipeline';
  };
  const showKanbanPipelineChips = !selectedPipelineFilter
    && new Set(listDeals.map((deal) => deal.pipelineId).filter(Boolean)).size > 1;
  const pipelineDealsByStage = (stage: PipelineStage) => listDeals
    .filter((deal) => deal.stage === stage.name)
    .sort((left, right) => {
      if (pipelineSort === 'value') return right.value - left.value;
      if (pipelineSort === 'close') return (left.closeDate ?? '').localeCompare(right.closeDate ?? '');
      if (pipelineSort === 'created') return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
      const leftDate = Date.parse(activityForDeal(left).date ?? '');
      const rightDate = Date.parse(activityForDeal(right).date ?? '');
      return (Number.isFinite(leftDate) ? leftDate : Number.POSITIVE_INFINITY)
        - (Number.isFinite(rightDate) ? rightDate : Number.POSITIVE_INFINITY);
    });
  const forecastData = useMemo(() => forecastPeriods(forecastMode, forecastOffset, new Date(clockNow)), [forecastMode, forecastOffset, clockNow]);
  const forecastDeals = listDeals.filter((deal) => {
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    return !stage?.isClosedLost && deal.disposition !== 'lost' && !isLostPipelineStage(deal.stage);
  });
  const baseListColumns = dealsPageMode ? dealListColumns : workspaceListColumns;
  const archiveColumns = [
    ...baseListColumns.slice(0, -1),
    { key: 'closedDate', label: 'Closed date' },
    { key: 'lossReason', label: 'Loss reason' },
    baseListColumns[baseListColumns.length - 1],
  ];
  const tableColumns = workspaceView === 'archive' ? archiveColumns : baseListColumns;
  const tableDeals = workspaceView === 'archive' ? archiveDeals : sortedListDeals;
  const pipelineViewDeals = listDeals;
  const toolbarDealCount = workspaceView === 'pipeline' ? pipelineViewDeals.length
    : workspaceView === 'archive' ? archiveDeals.length
      : workspaceView === 'forecast' ? forecastDeals.length
        : listDeals.length;
  const timelineEntries: TimelineEntry[] = [
    ...(timelineLead && leadCreatedAt ? [{
      key: `lead-created-${timelineLead.id}`,
      title: 'Lead created',
      description: timelineLead.title ?? timelineLead.client,
      date: leadCreatedAt,
      category: 'stage' as const,
      origin: 'Lead' as const,
      actor: users.find((person) => person.id === timelineLead.ownerId)?.name ?? formatStaffIdentifier(timelineLead.ownerId),
    }] : []),
    ...(selectedDeal?.createdAt ? [{
      key: `deal-created-${selectedDeal.id}`,
      title: 'Deal created',
      description: `${selectedDeal.product} · ${selectedDeal.stage}`,
      date: selectedDeal.createdAt,
      category: 'stage' as const,
      origin: 'Deal' as const,
      actor: users.find((person) => person.id === selectedDeal.ownerId)?.name ?? formatStaffIdentifier(selectedDeal.ownerId),
    }] : []),
    ...(selectedDeal?.nextActivityAt ? [{
      key: `deal-follow-up-${selectedDeal.id}`,
      title: selectedDeal.nextActivityTitle ?? 'Scheduled follow-up',
      description: 'Scheduled task',
      date: selectedDeal.nextActivityAt,
      category: 'task' as const,
      origin: 'Deal' as const,
      actor: users.find((person) => person.id === selectedDeal.ownerId)?.name ?? formatStaffIdentifier(selectedDeal.ownerId),
    }] : []),
    ...leadStageTimelineEntries,
    ...selectedHistory.map((entry) => {
      const fromStage = pipelineStages.find((stage) => stage.id === entry.fromStageId)?.name ?? 'Start';
      const target = pipelineStages.find((stage) => stage.id === entry.toStageId)?.name ?? 'Pipeline stage';
      const actor = entry.userName
        ?? users.find((person) => person.id === entry.userId)?.name
        ?? (entry.userId === user.id ? user.name : entry.userId ? formatStaffIdentifier(entry.userId) : 'System');
      const expectedCloseChange = entry.details?.startsWith('Expected close changed');
      return {
        key: entry.id,
        title: expectedCloseChange ? 'Expected close changed' : `Stage changed: ${fromStage} → ${target}`,
        description: [
          expectedCloseChange ? entry.details ?? '' : '',
          entry.lossReason ? `Loss reason: ${entry.lossReason}` : '',
          !expectedCloseChange ? entry.details ?? '' : '',
        ].filter(Boolean).join(' · '),
        date: entry.enteredAt,
        category: expectedCloseChange ? 'activity' as const : 'stage' as const,
        origin: 'Deal' as const,
        actor,
      };
    }),
    ...linkedQuotationRequests.flatMap((request) => {
      const creator = users.find((person) => person.id === request.createdBy)?.name
        ?? (request.createdBy === user.id ? user.name : formatStaffIdentifier(request.createdBy));
      const created = [{
        key: `quotation-created-${request.id}`,
        title: `Quotation request created: ${request.ref}`,
        description: `Status: ${request.status}`,
        date: request.createdAt,
        category: 'proposal' as const,
        origin: 'Quotation' as const,
        actor: creator,
      }];
      const updatedAt = Date.parse(request.updatedAt);
      const createdAt = Date.parse(request.createdAt);
      if (!Number.isFinite(updatedAt) || !Number.isFinite(createdAt) || updatedAt <= createdAt) return created;
      const updater = request.updatedBy
        ? users.find((person) => person.id === request.updatedBy)?.name ?? formatStaffIdentifier(request.updatedBy)
        : creator;
      return [...created, {
        key: `quotation-status-${request.id}-${request.updatedAt}`,
        title: `Quotation request status changed: ${request.ref}`,
        description: `Current status: ${request.status}`,
        date: request.updatedAt,
        category: 'proposal' as const,
        origin: 'Quotation' as const,
        actor: updater,
      }];
    }),
    ...selectedActivities
      .filter((activity) => !((selectedLead || linkedLead) && activity.id.startsWith('audit-') && activity.title === 'Lead created'))
      .filter((activity) => !(selectedDeal && activity.id.startsWith('audit-') && activity.title === 'Deal created'))
      .filter((activity) => !(activity.title === 'Deal expected close changed'
        && selectedHistory.some((entry) => entry.details?.startsWith('Expected close changed')
          && Date.parse(entry.enteredAt) === Date.parse(activity.date))))
      .filter((activity) => {
        if (activity.title.startsWith('Lead stage changed:')) {
          const transition = parseLeadStageTransition(activity.title);
          return !transition || !leadStageHistory.some((entry) => entry.from === transition.from
            && entry.to === transition.to && Date.parse(entry.date) === Date.parse(activity.date));
        }
        if (activity.title.startsWith('Deal stage changed:')) {
          return !selectedHistory.some((entry) => Date.parse(entry.enteredAt) === Date.parse(activity.date));
        }
        return true;
      })
      .map((activity) => {
        const actor = users.find((person) => person.id === activity.userId);
        const details = [
          activity.description,
          activity.personsMet ? `Persons met: ${activity.personsMet}` : '',
          activity.meetingMode ? `Mode: ${activity.meetingMode}` : '',
          activity.venue ? `Venue: ${activity.venue}` : '',
          activity.outcome ? `Outcome: ${activity.outcome}` : '',
          activity.followUpAction ? `Follow-up: ${activity.followUpAction}` : '',
          activity.done ? 'Done' : '',
        ].filter(Boolean).join(' · ');
        const activityActor = activity.actorName ?? actor?.name
          ?? (activity.userId === user.id ? user.name : activity.userId ? formatStaffIdentifier(activity.userId) : 'System');
        return {
          key: activity.id,
          title: activity.title,
          description: details,
          date: activity.date,
          origin: activity.dealId === relatedDealId ? 'Deal' as const : 'Lead' as const,
          actor: activityActor,
          activityId: activity.id,
          done: activity.done,
          scheduled: Boolean(activity.dueDate || activity.type === 'task' || activity.type === 'meeting'),
          category: activity.title.startsWith('Lead temperature changed:') ? 'temperature' as const
            : activity.type === 'meeting' ? 'appointment' as const
              : activity.type === 'quote' ? 'proposal' as const
                : activity.type === 'task' ? 'task' as const
                  : (activity.title.startsWith('Lead stage changed:') || activity.title.startsWith('Deal stage changed:')) ? 'stage' as const
                    : activity.type === 'note' ? 'note' as const : activity.type,
          ...(activity.durationMinutes !== undefined ? { durationMinutes: activity.durationMinutes } : {}),
        };
      }),
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const filteredTimelineEntries = timelineFilter === 'all'
    ? timelineEntries
    : timelineEntries.filter((entry) => entry.category === timelineFilter);

  useEffect(() => {
    if (!selectedPipelineFilter || kanbanPipeline) return;
    changePipelineFilter('');
  }, [changePipelineFilter, kanbanPipeline, selectedPipelineFilter]);

  useEffect(() => {
    if (!dealsPageMode) return;
    const syncDealsHash = () => {
      const params = hashParams();
      const view = params.get('view');
      if (view === 'pipeline' || view === 'list' || view === 'forecast' || view === 'archive') {
        setWorkspaceView(view);
      }
      const id = params.get('id');
      const deal = id ? deals.find((item) => item.id === id) : undefined;
      setSelectedKey(deal ? `deal:${deal.id}` : '');
    };
    window.addEventListener('hashchange', syncDealsHash);
    return () => window.removeEventListener('hashchange', syncDealsHash);
  }, [deals, dealsPageMode]);

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
    if (!dealsPageMode) setWorkspaceView('inspection');
  }, [dealsPageMode, initialSelectedKey]);

  const changeDealsView = (view: DealsView) => {
    setWorkspaceView(view);
    setSelectedKey('');
    if (!dealsPageMode) return;
    const params = Object.fromEntries(hashParams().entries());
    delete params.id;
    params.view = view;
    window.location.hash = dashboardHref('deals', params);
  };

  const openDealRecord = (deal: Deal) => {
    setSelectedKey(`deal:${deal.id}`);
    if (!dealsPageMode) {
      setWorkspaceView('inspection');
      return;
    }
    const params = Object.fromEntries(hashParams().entries());
    params.view = workspaceView === 'inspection' ? 'pipeline' : workspaceView;
    params.id = deal.id;
    window.location.hash = dashboardHref('deals', params);
  };

  const returnToDealsView = () => {
    if (!dealsPageMode) {
      onClose?.();
      return;
    }
    setSelectedKey('');
    const params = Object.fromEntries(hashParams().entries());
    delete params.id;
    params.view = workspaceView === 'inspection' ? 'pipeline' : workspaceView;
    window.location.hash = dashboardHref('deals', params);
  };

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
    const type = activityModal === 'schedule'
      ? String(data.get('activityType')) as Activity['type']
      : activityModal === 'meeting' ? 'meeting'
      : activityModal === 'quote' ? 'quote'
        : activityModal === 'task' ? 'task' : 'note';
    const scheduledDueDate = activityModal === 'schedule'
      ? String(data.get('dueDate') ?? '')
      : type === 'task' || type === 'meeting' ? String(data.get('activityDate') ?? '') : '';
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
      date: scheduledDueDate ? new Date(scheduledDueDate).toISOString()
        : activityDate ? new Date(activityDate).toISOString() : createdAt,
      createdAt,
      userId: user.id,
      actorName: user.name,
      ...(scheduledDueDate ? { dueDate: new Date(scheduledDueDate).toISOString(), done: false } : {}),
      ...(activityModal === 'schedule' && String(data.get('assigneeId') ?? '')
        ? { assigneeId: String(data.get('assigneeId')) } : {}),
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
    const existing = allDeals.find((deal) => deal.leadId === selectedLead.id || deal.id === selectedLead.dealId);
    if (selectedLead.dealId || existing) {
      if (!existing) {
        setContactError('This lead already references a deal that could not be found. Resolve the existing link before converting again.');
        return;
      }
      const enteredAt = new Date().toISOString();
      const stageHistory = appendLeadStageTransition(selectedLead, 'Converted to deal', enteredAt);
      setLeads((current) => current.map((lead) => lead.id === selectedLead.id
        ? {
          ...lead,
          dealId: existing.id,
          funnelStage: 'Converted to deal',
          disposition: 'converted',
          stageHistory,
          stageChangedAt: lead.disposition === 'converted' && lead.funnelStage === 'Converted to deal'
            ? lead.stageChangedAt
            : enteredAt,
        }
        : lead));
      setSelectedKey(`deal:${existing.id}`);
      return;
    }
    const product = products.find((item) => item.code === selectedLead.productCode);
    const pipeline = pipelines.find((item) => item.id === selectedLead.pipelineId && item.isActive) ?? activePipelines[0];
    const firstStage = pipeline && pipelineStages.filter((stage) => stage.pipelineId === pipeline.id)
      .sort((left, right) => left.stageOrder - right.stageOrder)[0];
    const contactChannels = {
      contactPhone: resolvedContactPhone,
      whatsapp: resolvedWhatsapp,
      telegram: resolvedTelegram,
    };
    const conversion = buildLeadConversion({
      lead: selectedLead,
      client: selectedClient,
      product,
      pipeline,
      firstStage,
      contactChannels,
      primaryContact: primaryContactProfile ?? primaryContact,
    });
    if (!conversion) {
      setContactError('Complete the company profile and contact details before converting this lead to a deal.');
      return;
    }
    const linkedLeadContacts = mergeContactProfiles(
      selectedLead.contacts,
      contactProfiles.filter((contact) => contact.linkedLeadIds?.includes(selectedLead.id)),
      primaryContact ? [primaryContact] : undefined,
    )
      .map((contact) => linkContactProfile(contact, selectedLead.id, conversion.deal.id));
    setDeals((current) => [conversion.deal, ...current]);
    setLeads((current) => current.map((lead) => lead.id === selectedLead.id
      ? {
        ...lead,
        ...conversion.leadUpdate,
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
    setStageHistory((current) => [...current, conversion.stageHistoryEntry]);
    setSelectedKey(`deal:${conversion.deal.id}`);
  };

  const changeLeadTelemetryStage = (target: LeadLifecycleStage, confirmedWithoutActivity = false) => {
    if (!selectedLead || (activeRole !== 'admin' && activeRole !== 'sales')) return;
    const currentStage = lifecycleStageForLead(selectedLead, Boolean(progressDeal));
    if (target === currentStage || isTerminalLeadStage(currentStage)) return;
    const hasNextActivity = getNextActivity(activities, { leadId: selectedLead.id, dealId: progressDeal?.id }).state !== 'none';
    if (!hasNextActivity && !confirmedWithoutActivity) {
      setPendingLeadTelemetryStage(target);
      return;
    }
    if (!hasNextActivity && company.requireNextActivityForStageChange) {
      setPendingLeadTelemetryStage(null);
      setContactError('Schedule a next activity before moving this lead to another stage.');
      return;
    }
    setPendingLeadTelemetryStage(null);
    if (target === 'Converted to deal') {
      convertLead();
      return;
    }

    const enteredAt = new Date().toISOString();
    let stageHistory;
    try {
      stageHistory = appendLeadStageTransition(selectedLead, target, enteredAt);
    } catch (error) {
      console.error('Could not update the lead telemetry stage.', error);
      setContactError(error instanceof Error ? error.message : 'Could not update the lead stage.');
      return;
    }

    setContactError('');
    setLeads((current) => current.map((lead) => lead.id === selectedLead.id
      ? {
        ...lead,
        funnelStage: target,
        disposition: target === 'Lost' ? 'lost' : undefined,
        lossReason: target === 'Lost' ? lead.lossReason : undefined,
        stageHistory,
        ...(target === 'Contact Made' && !getLeadContactedAt(selectedLead)
          ? { contactedAt: enteredAt, contacted_at: enteredAt }
          : {}),
        stageChangedAt: enteredAt,
        stage_changed_at: enteredAt,
        updatedAt: enteredAt,
        leadFunnelStage: target === 'Meetings Ongoing' ? 'L3: Qualified Opportunity' : undefined,
      }
      : lead));
    setActivities([{
      id: `activity-${crypto.randomUUID()}`,
      clientId: selectedClient?.id ?? selectedLead.clientId ?? '',
      leadId: selectedLead.id,
      type: 'note',
      title: `Lead stage changed: ${currentStage} → ${target}`,
      description: '',
      date: enteredAt,
      createdAt: enteredAt,
      userId: user.id,
      actorName: user.name,
    }, ...activities]);
  };

  const applyStageChange = (target: PipelineStage, reason?: string, outcome?: 'won' | 'lost') => {
    if (!selectedDeal) {
      setMoveError('Select a deal before changing its stage.');
      return;
    }
    if (isTerminalDealStage(selectedDeal.stage, selectedDeal.disposition, currentStage)) {
      setMoveError('A terminal deal cannot be moved to another stage.');
      return;
    }
    if (!currentStage) {
      setMoveError('The deal’s current stage is not configured in its pipeline.');
      return;
    }
    if (company.requireNextActivityForStageChange && activityForDeal(selectedDeal).state === 'none') {
      setMoveError('Schedule a next activity before moving this deal to another stage.');
      return;
    }
    const now = new Date().toISOString();
    const lost = outcome === 'lost' || isLostStage(target);
    const bound = outcome === 'won' || isBoundStage(target);
    if (lost && !reason?.trim()) {
      setMoveError('A loss reason is mandatory.');
      return;
    }
    if (bound && !winReason.trim()) {
      setMoveError('A win reason is mandatory.');
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
        userId: user.id,
        userName: user.name,
        fromStageId: currentStage.id,
        toStageId: target.id,
        enteredAt: now,
        exitedAt: null,
        durationSeconds: null,
        ...((bound || stageChangeRemarks.trim()) ? {
          details: [
            ...(bound ? [`Win reason: ${winReason.trim()}`] : []),
            ...(stageChangeRemarks.trim() ? [`Remarks: ${stageChangeRemarks.trim()}`] : []),
          ].join('\n'),
        } : {}),
        ...(lost ? { outcome: 'lost' as const, lossReason: reason?.trim() } : bound ? { outcome: 'won' as const } : {}),
      };
      return [...next, audit];
    });
    const invoiceId = `invoice-for-${selectedDeal.id}`;
    const policyExpiry = selectedDeal.policyExpiry ?? selectedClient?.expiry;
    const renewalPipeline = pipelines.find((pipeline) => pipeline.isActive && pipeline.code.toLowerCase() === 'renewals');
    const renewalStage = pipelineStages.filter((stage) => stage.pipelineId === renewalPipeline?.id)
      .sort((left, right) => left.stageOrder - right.stageOrder)[0];
    const renewalDealId = `renewal-for-${selectedDeal.id}`;
    const renewalValue = selectedClient?.premium ?? selectedDeal.value;
    const linkedRenewal = bound && policyExpiry && renewalPipeline && renewalStage && !allDeals.some((deal) => deal.id === renewalDealId)
      ? linkDealToLead({
        id: renewalDealId,
        pipelineId: renewalPipeline.id,
        createdAt: now,
        stageChangedAt: now,
        renewalForClientId: selectedClient?.id ?? selectedDeal.clientId,
        renewalForDealId: selectedDeal.id,
        renewalExpiry: policyExpiry,
        policyExpiry,
        client: selectedDeal.client,
        clientId: selectedClient?.id ?? selectedDeal.clientId,
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
      }, undefined, { source: 'Renewal automation', client: selectedClient })
      : undefined;
    setDeals((current) => {
      const updated = current.map((deal) => deal.id === selectedDeal.id
        ? {
          ...deal,
          stage: outcome ? selectedDeal.stage : target.name,
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
          probability: lost ? 0 : bound ? 100 : target.winProbabilityPct,
          weighted: Math.round(deal.value * (lost ? 0 : bound ? 100 : target.winProbabilityPct)) / 100,
          ...(lost ? { disposition: 'lost' as const, lossReason: reason?.trim() } : bound ? {
            disposition: 'won' as const,
            linkedInvoiceId: invoiceId,
            policyExpiry,
            renewalDealId: policyExpiry && renewalStage ? renewalDealId : deal.renewalDealId,
          } : {}),
        }
        : deal);
      if (!linkedRenewal || current.some((deal) => deal.id === renewalDealId)) return updated;
      return [...updated, linkedRenewal.deal];
    });
    if (linkedRenewal) {
      setLeads((current) => current.some((lead) => lead.id === linkedRenewal.lead.id)
        ? current
        : [linkedRenewal.lead, ...current]);
    }
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
    if (stageChangeRemarks.trim()) {
      setActivities([{
        id: `activity-${crypto.randomUUID()}`,
        clientId: selectedClient?.id ?? selectedDeal.clientId ?? '',
        dealId: selectedDeal.id,
        type: 'note',
        title: 'Deal stage change note',
        description: stageChangeRemarks.trim(),
        date: now,
        createdAt: now,
        userId: user.id,
        actorName: user.name,
      }, ...activities]);
    }
    if (bound && !invoices.some((invoice) => invoice.linkedDealId === selectedDeal.id)) {
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      setInvoices([...invoices, {
        id: invoiceId,
        number: AUTH_BYPASS
          ? nextLocalReference('invoice', new Date(now).getFullYear(), invoices.map((invoice) => invoice.number))
          : '',
        ...(AUTH_BYPASS ? {} : { invoiceNumber: '' }),
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
    setMoveOutcome(null);
    setLossReason('');
    setWinReason('');
    setMoveError('');
    setStageChangeRemarks('');
    const dealPipeline = pipelines.find((pipeline) => pipeline.id === selectedDeal.pipelineId);
    if (dealPipeline?.code.toUpperCase() === 'COMMERCIAL'
      && target.name === 'Quotation / Underwriting'
      && !quotationRequests.some((request) => request.dealId === selectedDeal.id)) {
      promptQuotationRequestForDeal(selectedDeal.id);
    }
  };

  const requestStageChange = (target: PipelineStage, deal = selectedDeal, outcome: 'won' | 'lost' | null = null) => {
    if (!deal || isTerminalDealStage(
      deal.stage,
      deal.disposition,
      pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage),
    ) || target.name === deal.stage) return;
    setSelectedKey(`deal:${deal.id}`);
    setContactError('');
    setMoveStage(target);
    setMoveOutcome(outcome);
    setLossReason('');
    setWinReason('');
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

  const requestDealOutcome = (outcome: 'won' | 'lost', deal: Deal) => {
    const currentStage = pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage);
    if (!currentStage) {
      window.alert('Configure this deal’s current pipeline stage before closing the deal.');
      return;
    }
    requestStageChange({
      ...currentStage,
      name: outcome === 'won' ? 'Policy Bound / Won' : 'Lost / Market Declined',
      isClosedWon: outcome === 'won',
      isClosedLost: outcome === 'lost',
      winProbabilityPct: outcome === 'won' ? 100 : 0,
    }, deal, outcome);
  };

  const visibleQuotes = quotes.map((quote) => ({
    ...quote,
    insurer: quote.insurer ?? quote.description.match(/Insurer:\s*([^;]+)/i)?.[1] ?? 'Insurer',
  }));

  const assignContactProfile = (profileId: string) => {
    const profile = detailContacts.find((contact) => contact.id === profileId);
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
    const phoneNumber = normalizeContactNumber(phone);
    if (detailContacts.some((contact) => contact.id !== editingContactId
      && (contact.email.trim().toLowerCase() === email.toLowerCase()
        || (phoneNumber && normalizeContactNumber(contact.phone) === phoneNumber)))) {
      setAddContactError('A contact with this email address or phone number is already linked to this record.');
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

  const moveDealForecastPeriod = (deal: Deal, expectedClose: string) => {
    if (!expectedClose || deal.closeDate === expectedClose) return;
    const now = new Date().toISOString();
    const previousClose = deal.closeDate;
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, closeDate: expectedClose } : item));
    setActivities([{
      id: `audit-${crypto.randomUUID()}`,
      clientId: deal.clientId ?? '',
      dealId: deal.id,
      leadId: deal.leadId,
      type: 'note',
      title: 'Deal expected close changed',
      description: `Expected close changed from ${previousClose} to ${expectedClose}`,
      date: now,
      createdAt: now,
      userId: user.id,
      actorName: user.name,
    }, ...activities]);
    if (stage) {
      setStageHistory((current) => [...current, {
        id: `stage-${crypto.randomUUID()}`,
        tenantId: TENANT_ID,
        dealId: deal.id,
        userId: user.id,
        userName: user.name,
        fromStageId: stage.id,
        toStageId: stage.id,
        enteredAt: now,
        exitedAt: now,
        durationSeconds: 0,
        details: `Expected close changed from ${previousClose} to ${expectedClose} by ${user.name}`,
      }]);
    }
  };

  return (
    <div className="space-y-2">
      {(dealsPageMode ? !selectedItem : workspaceView === 'list' || workspaceView === 'kanban' || !selectedItem) && <div className="space-y-2">
        <PageToolbar name={dealsPageMode ? 'deals' : undefined} testId={dealsPageMode ? 'deals-toolbar' : undefined} className="justify-between">
          <div className="flex flex-wrap items-center gap-2">
          {dealsPageMode ? <ViewModeSwitcher<DealsView>
            label="Deal views"
            value={workspaceView === 'pipeline' || workspaceView === 'list' || workspaceView === 'forecast' || workspaceView === 'archive' ? workspaceView : 'list'}
            options={[
              { value: 'list', label: 'List', Icon: List },
              { value: 'pipeline', label: 'Pipeline', Icon: Columns3 },
              { value: 'forecast', label: 'Forecast', Icon: TrendingUp },
              { value: 'archive', label: 'Archive', Icon: Archive },
            ]}
            onChange={changeDealsView}
            onKeyDown={(event) => {
              const names: DealsView[] = ['list', 'pipeline', 'forecast', 'archive'];
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              const selectedView = names.includes(workspaceView as DealsView) ? workspaceView as DealsView : 'list';
              const current = names.indexOf(selectedView);
              const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
              changeDealsView(names[next]);
              requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-view-option="${names[next]}"]`)?.focus());
            }}
          /> : <ViewModeSwitcher<'list' | 'kanban' | 'inspection'>
            label="Deal workspace views"
            value={workspaceView === 'list' || workspaceView === 'kanban' ? workspaceView : 'inspection'}
            options={[
              { value: 'list', label: 'List' },
              { value: 'kanban', label: 'Kanban' },
              { value: 'inspection', label: 'Inspection' },
            ]}
            onChange={setWorkspaceView}
          />}
          {dealsPageMode && onLegacyImport && <button type="button" className="btn-primary !px-3 !py-1.5 !text-xs" onClick={onLegacyImport}><Plus size={13} /> Legacy deal</button>}
          {!dealsPageMode && onClose && <button type="button" className="btn-ghost !py-1.5" onClick={onClose}>Back to leads</button>}
          </div>
          {dealsPageMode && <div data-testid="deals-toolbar-controls" className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <Badge variant="brand">{toolbarDealCount} {toolbarDealCount === 1 ? 'deal' : 'deals'}</Badge>
            <select className="input !w-auto max-w-full !py-1.5 !text-xs" value={selectedPipelineFilter}
              onChange={(event) => changePipelineFilter(event.target.value)} aria-label="Filter deals by pipeline">
              <option value="">All pipelines</option>
              {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
            {workspaceView === 'list' && <label className="relative w-full md:min-w-36 md:max-w-64 md:flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !py-1.5 pl-9 !text-xs" type="search" value={dealListSearch} onChange={(event) => setDealListSearch(event.target.value)} placeholder="Search deals" aria-label="Search deals" />
            </label>}
            <button type="button" className={`btn-ghost !px-3 !py-1.5 !text-xs ${conditionBuilderOpen ? 'border-brand-400 text-white' : ''}`}
              onClick={() => setConditionBuilderOpen((open) => !open)}><Plus size={13} /> Add condition</button>
            {onOpenFilters && <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={onOpenFilters}><Filter size={13} /> Filter</button>}
          </div>}
        </PageToolbar>
        {dealsPageMode && (conditionBuilderOpen || filterConditions.length > 0) && <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/40 p-2">
          {conditionBuilderOpen && <>
            <select className="input !w-auto !py-1.5 !text-xs" aria-label="Condition field" value={conditionDraft.field}
              onChange={(event) => setConditionDraft((current) => ({ ...current, field: event.target.value as ConditionField }))}>
              {CONDITION_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
            </select>
            <select className="input !w-auto !py-1.5 !text-xs" aria-label="Condition operator" value={conditionDraft.operator}
              onChange={(event) => setConditionDraft((current) => ({ ...current, operator: event.target.value as ConditionOperator }))}>
              {CONDITION_OPERATORS.map((operator) => <option key={operator}>{operator}</option>)}
            </select>
            {conditionDraft.operator !== 'empty' && <>
              <input className="input !w-auto min-w-28 !py-1.5 !text-xs" aria-label="Condition value" type={conditionDraft.field === 'closeDate' ? 'date' : conditionDraft.field === 'value' ? 'number' : 'text'}
                value={conditionDraft.value} onChange={(event) => setConditionDraft((current) => ({ ...current, value: event.target.value }))} />
              {conditionDraft.operator === 'between' && <input className="input !w-auto min-w-28 !py-1.5 !text-xs" aria-label="Condition upper value"
                type={conditionDraft.field === 'closeDate' ? 'date' : 'number'} value={conditionDraft.secondValue}
                onChange={(event) => setConditionDraft((current) => ({ ...current, secondValue: event.target.value }))} />}
            </>}
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => {
              if (conditionDraft.operator !== 'empty' && !conditionDraft.value.trim()) return;
              setFilterConditions((current) => [...current, { ...conditionDraft, id: crypto.randomUUID() }]);
              setConditionDraft((current) => ({ ...current, value: '', secondValue: '' }));
              setConditionBuilderOpen(false);
            }}>Apply</button>
          </>}
          {filterConditions.map((condition) => <button key={condition.id} type="button" className="rounded-full border border-brand-400/40 bg-brand-400/10 px-2 py-1 text-[10px] text-brand-100"
            onClick={() => setFilterConditions((current) => current.filter((item) => item.id !== condition.id))}
            title="Remove condition">
            {CONDITION_FIELDS.find((field) => field.value === condition.field)?.label} {condition.operator} {condition.value || 'empty'}{condition.operator === 'between' ? ` – ${condition.secondValue}` : ''} <X size={10} className="ml-1 inline" />
          </button>)}
        </div>}
      </div>}
      {(workspaceView === 'list' || workspaceView === 'archive') && !selectedItem ? (
        <div className="min-w-0 space-y-3">
          {!dealsPageMode && <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">{workspaceView === 'archive' ? 'Deals archive' : 'Deals list'}</h2>
              <Badge variant="brand">{(workspaceView === 'archive' ? archiveDeals : listDeals).length} {(workspaceView === 'archive' ? archiveDeals : listDeals).length === 1 ? 'deal' : 'deals'}</Badge>
              <select className="input !w-auto max-w-full !py-1.5 !text-xs" value={selectedPipelineFilter} onChange={(event) => changePipelineFilter(event.target.value)} aria-label="Filter deals by pipeline">
                <option value="">All pipelines</option>
                {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
              </select>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input !py-1.5 pl-9 !text-xs" type="search" value={dealListSearch} onChange={(event) => setDealListSearch(event.target.value)} placeholder="Search deals" aria-label="Search deal ID, title, client, lead or vendor" />
              </label>
              {onOpenFilters && <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={onOpenFilters}><Filter size={13} /> Filters</button>}
            </div>
          </div>}
          {dealsPageMode && workspaceView === 'archive' && <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Closed deals</h2>
            <select className="input !w-auto !py-1.5 !text-xs" value={archiveFilter}
              onChange={(event) => setArchiveFilter(event.target.value as 'all' | 'won' | 'lost')} aria-label="Filter archived deals">
              <option value="all">All outcomes</option><option value="won">Won</option><option value="lost">Lost</option>
            </select>
          </div>}
          <TableShell className={workspaceView === 'archive'
            ? `deals-list-fit deals-archive-fit${dealsPageMode ? ' deals-page-archive-fit' : ''}`
            : `deals-list-fit${dealsPageMode ? ' deals-page-list-fit' : ''}`}>
            <table className="table-fixed w-full leading-tight text-left">
              <colgroup>{tableColumns.map((column) => <col key={column.key} />)}</colgroup>
              <thead className={dealsPageMode && workspaceView === 'list'
                ? 'bg-[#111214] font-semibold text-[#D0D3D9]'
                : 'bg-[#111214] text-[10px] font-semibold text-[#D0D3D9]'}>
                <tr>{tableColumns.map((column) => (
                  <th key={column.key} scope="col"
                    aria-sort={dealsPageMode && workspaceView === 'list' && sortKey === column.key
                      ? (sortDirection === 'asc' ? 'ascending' : 'descending')
                      : undefined}
                    className={`border-b border-[#1B1E22] text-left ${dealsPageMode && workspaceView === 'list'
                      ? 'align-middle whitespace-nowrap px-1 py-2'
                      : 'px-2 py-2'}`}>
                    {column.key === 'actions' ? <span className="sr-only">{column.label}</span> : (
                      ['closedDate', 'lossReason'].includes(column.key)
                        ? column.label
                        : <button
                          type="button"
                          title={dealsPageMode && workspaceView === 'list' ? column.label : undefined}
                          aria-label={dealsPageMode && workspaceView === 'list' ? `Sort by ${column.label}` : undefined}
                          className={`inline-flex items-center gap-1 ${dealsPageMode && workspaceView === 'list' ? '' : 'whitespace-nowrap'}`}
                          onClick={() => {
                            const nextKey = column.key as typeof sortKey;
                            setSortTouched(true);
                            if (sortKey === nextKey) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
                            else {
                              setSortKey(nextKey);
                              setSortDirection('asc');
                            }
                          }}
                        >
                          {dealsPageMode && workspaceView === 'list'
                            ? ({
                              deal: 'Deal',
                              client: 'Client',
                              contact: 'Contact',
                              close: 'Expected Close',
                              activity: 'Next Activity',
                            }[column.key] ?? column.label)
                            : column.label}
                          {(!(dealsPageMode && workspaceView === 'list') || sortTouched) && sortKey === column.key && <span
                            className={dealsPageMode && workspaceView === 'list' ? 'inline-flex shrink-0 text-[10px] leading-none' : undefined}
                            aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                        </button>
                    )}
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {tableDeals.map((deal) => {
                  const lead = leads.find((item) => item.id === deal.leadId || item.dealId === deal.id);
                  const pipeline = pipelines.find((item) => item.id === deal.pipelineId);
                  const dealStages = pipelineStages.filter((stage) => stage.pipelineId === deal.pipelineId)
                    .sort((left, right) => left.stageOrder - right.stageOrder);
                  const stage = dealStages.find((item) => item.name === deal.stage);
                  const stageEntry = stageHistory.find((entry) => entry.dealId === deal.id && entry.toStageId === stage?.id && !entry.exitedAt);
                  const enteredAt = stageEntry?.enteredAt ?? deal.stageChangedAt ?? deal.createdAt;
                  const elapsedDays = getStageSlaElapsedDays(enteredAt, clockNow);
                  const isOverdue = stage ? isStageSlaOverdue(enteredAt, stage.stagnationDaysThreshold, clockNow) : false;
                  const vendorName = vendors.find((vendor) => vendor.id === deal.vendorId)?.name ?? deal.insurer ?? 'Not assigned';
                  const dealTitle = lead?.title ?? deal.proposalSummary ?? `${deal.product} placement`;
                  const clientContactName = deal.contactName ?? clients.find((client) => client.id === deal.clientId)?.contactPerson;
                  const ownerName = users.find((person) => person.id === deal.ownerId)?.name ?? formatStaffIdentifier(deal.ownerId);
                  const nextActivity = activityForDeal(deal);
                  const terminal = isTerminalDealStage(deal.stage, deal.disposition, stage);
                  const outcome = deal.disposition === 'won' || stage?.isClosedWon
                    ? 'Won'
                    : deal.disposition === 'lost' || stage?.isClosedLost
                      ? 'Lost'
                      : terminal ? 'Closed' : 'Open';
                  const product = products.find((item) => item.code === deal.productCode)
                    ?? products.find((item) => item.name.trim().toLowerCase() === deal.product.trim().toLowerCase());
                  const productCode = product?.code ?? deal.productCode ?? deal.product.slice(0, 2).toUpperCase();
                  const closedHistory = stageHistory
                    .filter((entry) => entry.dealId === deal.id && (entry.outcome || pipelineStages.some((candidate) =>
                      candidate.id === entry.toStageId && (candidate.isClosedWon || candidate.isClosedLost))))
                    .sort((left, right) => Date.parse(right.enteredAt) - Date.parse(left.enteredAt))[0];
                  const closedDate = closedHistory?.exitedAt ?? closedHistory?.enteredAt ?? (terminal ? deal.stageChangedAt : undefined);
                  const rowLossReason = deal.lossReason ?? stageHistory.find((entry) => entry.dealId === deal.id && entry.lossReason)?.lossReason;
                  const pipelineLabel = pipeline?.code.toUpperCase() === 'COMMERCIAL'
                    ? 'Commercial'
                    : pipeline?.code.toUpperCase() === 'SME_VELOCITY'
                      ? 'SME'
                      : pipeline?.code.toUpperCase() === 'RENEWALS'
                        ? 'Renewals'
                        : pipeline?.name ?? 'Unknown pipeline';
                  const stageOutcome = stage && isLostStage(stage)
                    ? 'lost'
                    : stage && isBoundStage(stage)
                      ? 'won'
                      : 'neutral';
                  const stageCell = (
                    <td data-label="Stage" className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          className="deal-stage-trigger"
                          title={`${stage?.name ?? deal.stage} · ${deal.probability}% win probability`}
                          aria-label={`Change stage for ${dealTitle}`}
                          aria-haspopup="menu"
                          aria-expanded={openStageMenuId === deal.id}
                          disabled={!stage || (activeRole !== 'admin' && activeRole !== 'sales')}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (openStageMenuId === deal.id) {
                              setOpenStageMenuId('');
                              setStageMenuAnchor(null);
                            } else {
                              setOpenStageMenuId(deal.id);
                              setStageMenuAnchor(event.currentTarget);
                            }
                          }}
                        >
                          <StagePill stage={dealsPageMode ? stage?.shortLabel ?? stage?.name ?? deal.stage : stage?.name ?? deal.stage}
                            title={stage?.name ?? deal.stage} outcome={stageOutcome} truncate />
                          <span className={`deal-stage-sla ${isOverdue ? 'deal-stage-sla-overdue' : ''}`} title={stage?.stagnationDaysThreshold ? `Stage SLA: ${elapsedDays ?? 0} of ${stage.stagnationDaysThreshold} days` : 'No stage SLA configured'}>
                            {stage?.stagnationDaysThreshold ? `${elapsedDays ?? 0}/${stage.stagnationDaysThreshold}d` : 'No SLA'}
                          </span>
                        </button>
                        <StageMenu
                          open={openStageMenuId === deal.id}
                          anchor={stageMenuAnchor}
                          label={`Stages for ${dealTitle}`}
                          stages={dealStages}
                          onClose={() => {
                            setOpenStageMenuId('');
                            setStageMenuAnchor(null);
                          }}
                          onSelect={(target) => {
                            setOpenStageMenuId('');
                            setStageMenuAnchor(null);
                            requestStageChange(target, deal);
                          }}
                        />
                      </div>
                    </td>
                  );
                  return (
                    <tr key={deal.id} data-pipeline-id={deal.pipelineId} role="link" tabIndex={0} aria-label={`Open deal details for ${dealTitle}`}
                      onClick={() => openDealRecord(deal)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDealRecord(deal);
                        }
                      }}
                      className="cursor-pointer border-b border-[#1B1E22] last:border-0 transition-colors hover:bg-[#111214] focus-visible:outline focus-visible:outline-1 focus-visible:outline-brand-400">
                      {dealsPageMode ? <>
                        <td data-label="Title" className={`px-2 py-2 font-semibold ${nextActivity.state === 'overdue' ? 'text-hot' : 'text-white'}`}>
                          <span className="block truncate" title={dealTitle}>{dealTitle}</span>
                          <span className="block truncate text-[10px] font-normal leading-none text-[#8E95A2]" title={dealReferences.get(deal.id) ?? deal.id}>{dealReferences.get(deal.id) ?? deal.id}</span>
                        </td>
                        <td data-label="Value" className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className="block whitespace-nowrap font-semibold" title={formatAmount(deal.value, deal.currency ?? 'USD')}>{formatAmount(deal.value, deal.currency ?? 'USD')}</span>
                          <span className="block text-[10px] leading-none text-[#8E95A2]">{deal.probability}%</span>
                        </td>
                        <td data-label="Organization" className="px-2 py-2 font-normal text-[#E1E2E5]"><span className="block truncate" title={deal.client}>{deal.client}</span></td>
                        <td data-label="Contact Person" className="px-2 py-2 font-normal text-[#E1E2E5]"><span className="block truncate" title={clientContactName}>{clientContactName ?? '—'}</span></td>
                        <td data-label="Expected Close Date" className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]"><TableDateCell value={deal.closeDate} /></td>
                        <td data-label="Next Activity Date" className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className={nextActivity.state === 'overdue' ? 'text-hot' : ''}><DealActivityIndicator activity={nextActivity} /></span>
                        </td>
                        <td data-label="Owner" className="px-2 py-2 font-normal text-[#E1E2E5]"><OwnerCell name={ownerName} /></td>
                        {stageCell}
                        <td data-label="Pipeline" className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className="inline-flex max-w-full items-center rounded-full border border-[#2A2E35] bg-[#17191C] px-2 py-0.5 text-[10px] font-normal text-[#E1E2E5]" title={pipeline?.name ?? 'Unknown pipeline'}>{pipelineLabel}</span>
                        </td>
                      </> : <>
                        <td data-label={workspaceListColumns[0].label} className={`px-2 py-2 font-semibold ${nextActivity.state === 'overdue' ? 'text-hot' : 'text-white'}`}>
                          <span className="block truncate" title={dealTitle}>{dealTitle}</span>
                          <span className="block truncate text-[10px] font-normal leading-none text-[#8E95A2]" title={dealReferences.get(deal.id) ?? deal.id}>{dealReferences.get(deal.id) ?? deal.id}</span>
                        </td>
                        <td data-label={workspaceListColumns[1].label} className="px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className="block truncate" title={deal.client}>{deal.client}</span>
                          {clientContactName && <span className="block truncate text-[10px] text-[#8E95A2]" title={clientContactName}>{clientContactName}</span>}
                        </td>
                        <td data-label={workspaceListColumns[2].label} className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className="inline-flex max-w-full items-center rounded-full border border-[#2A2E35] bg-[#17191C] px-2 py-0.5 text-[10px] font-normal text-[#E1E2E5]" title={pipeline?.name ?? 'Unknown pipeline'}>{pipelineLabel}</span>
                        </td>
                        {stageCell}
                        <td data-label={workspaceListColumns[4].label} className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]"><ProductCodePill code={productCode} name={product?.name ?? deal.product} /></td>
                        <td data-label={workspaceListColumns[5].label} className="px-2 py-2 font-normal text-[#E1E2E5]"><span className="block truncate" title={vendorName}>{vendorName}</span></td>
                        <td data-label={workspaceListColumns[6].label} className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className="block truncate font-semibold" title={formatAmount(deal.value, deal.currency ?? 'USD')}>{formatAmount(deal.value, deal.currency ?? 'USD')}</span>
                          <span className="block text-[10px] leading-none text-[#8E95A2]">{deal.probability}%</span>
                        </td>
                        <td data-label={workspaceListColumns[7].label} className="px-2 py-2 font-normal text-[#E1E2E5]"><OwnerCell name={ownerName} /></td>
                        <td data-label={workspaceListColumns[8].label} className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]">
                          <span className={nextActivity.state === 'overdue' ? 'text-hot' : ''}><DealActivityIndicator activity={nextActivity} /></span>
                        </td>
                        <td data-label={workspaceListColumns[9].label} className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]"><TableDateCell value={deal.closeDate} /></td>
                      </>}
                      {workspaceView === 'archive' && <>
                        <td data-label="Closed date" className="whitespace-nowrap px-2 py-2 font-normal text-[#E1E2E5]"><TableDateCell value={closedDate} /></td>
                        <td data-label="Loss reason" className="px-2 py-2 font-normal text-[#E1E2E5]"><span className="block truncate" title={rowLossReason ?? ''}>{rowLossReason ?? '—'}</span></td>
                      </>}
                      <td data-label="Actions" className="relative px-1 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="rounded-md p-1.5 text-muted hover:bg-ink-700 hover:text-white" aria-label={`Actions for ${dealTitle}`} aria-haspopup="menu" aria-expanded={openDealActionsId === deal.id}
                          onClick={(event) => {
                            if (openDealActionsId === deal.id) {
                              setOpenDealActionsId('');
                              setDealActionsAnchor(null);
                            } else {
                              setOpenDealActionsId(deal.id);
                              setDealActionsAnchor(event.currentTarget);
                            }
                          }}><MoreHorizontal size={15} /></button>
                        <TableRowActionsMenu
                          open={openDealActionsId === deal.id}
                          anchor={dealActionsAnchor}
                          label={`Deal actions for ${dealTitle}`}
                        >
                          {!terminal && (activeRole === 'admin' || activeRole === 'sales') && <>
                            <button type="button" role="menuitem" className="table-row-actions-item text-win hover:bg-ink-700" onClick={() => {
                              setOpenDealActionsId('');
                              setDealActionsAnchor(null);
                              requestDealOutcome('won', deal);
                            }}><Check size={12} /> Mark won</button>
                            <button type="button" role="menuitem" className="table-row-actions-item text-hot hover:bg-ink-700" onClick={() => {
                              setOpenDealActionsId('');
                              setDealActionsAnchor(null);
                              requestDealOutcome('lost', deal);
                            }}><X size={12} /> Mark lost</button>
                          </>}
                          {onEditDeal && <button type="button" role="menuitem" className="table-row-actions-item text-white hover:bg-ink-700" onClick={() => { setOpenDealActionsId(''); setDealActionsAnchor(null); onEditDeal(deal); }}><Pencil size={12} /> Edit deal</button>}
                          {onDeleteDeal && <button type="button" role="menuitem" className="table-row-actions-item text-hot hover:bg-ink-700" onClick={() => { setOpenDealActionsId(''); setDealActionsAnchor(null); onDeleteDeal(deal); }}><Trash2 size={12} /> Delete deal</button>}
                          {outcome !== 'Open' && <span className="block whitespace-nowrap px-3 py-2 text-[10px] text-muted">{outcome}</span>}
                        </TableRowActionsMenu>
                      </td>
                    </tr>
                  );
                })}
                {!tableDeals.length && <tr className="deals-list-empty"><td data-label={baseListColumns[0].label} colSpan={tableColumns.length} className="px-4 py-8 text-center text-muted">No deals match these filters.</td></tr>}
              </tbody>
            </table>
          </TableShell>
        </div>
      ) : dealsPageMode && workspaceView === 'pipeline' && !selectedItem ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">{kanbanPipeline?.name ?? 'All pipelines'}</h2>
              <p className="mt-1 text-xs text-muted">Drag a deal between stages to use the existing stage-change flow.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                Sort
                <select className="input !w-auto !py-1.5 !text-xs" value={pipelineSort} onChange={(event) => setPipelineSort(event.target.value as typeof pipelineSort)} aria-label="Sort pipeline deals">
                  <option value="activity">Next activity</option><option value="value">Value</option>
                  <option value="close">Expected close</option><option value="created">Created</option>
                </select>
              </label>
            </div>
          </div>
          {kanbanStages.length ? <div className="deals-fit min-w-0">
            <div className="deals-board deals-board-compact grid gap-2">
              {kanbanStages.map((stage) => {
                const stageDeals = pipelineDealsByStage(stage);
                const totalMvr = stageDeals.reduce((total, deal) =>
                  total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0);
                const canMoveStage = activeRole === 'admin' || activeRole === 'sales';
                return <section key={stage.id} data-stage-name={stage.name} data-total-mvr={totalMvr}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dealId = event.dataTransfer.getData('text/deal-id');
                    const droppedDeal = listDeals.find((deal) => deal.id === dealId);
                    const targetPipelineId = droppedDeal?.pipelineId ?? kanbanPipelines[0]?.id;
                    const targetStage = droppedDeal && pipelineStages.find((item) =>
                      item.pipelineId === targetPipelineId && item.name === stage.name);
                    if (canMoveStage && droppedDeal && targetStage) requestStageChange(targetStage, droppedDeal);
                  }}
                  className="flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-900/55 p-2.5">
                  <header className="mb-2 min-w-0 px-1">
                    <h3 className="truncate text-sm font-semibold text-white">{stage.name}</h3>
                    <p className="mt-1 truncate text-[10px] text-muted">{formatAmount(totalMvr, 'MVR')} · {stageDeals.length} {stageDeals.length === 1 ? 'deal' : 'deals'}</p>
                  </header>
                  <div className="max-h-[calc(100vh-330px)] min-h-40 space-y-2 overflow-y-auto rounded-lg bg-ink-950/40 p-1.5">
                    {stageDeals.map((deal) => {
                      const nextActivity = activityForDeal(deal);
                      const ownerName = ownerNameForDeal(deal);
                      return <article key={deal.id} draggable={canMoveStage} data-deal-id={deal.id}
                        data-deal-value-mvr={toMvr(deal.value, deal.currency, deal.exchangeRate)}
                        onDragStart={(event) => { event.dataTransfer.setData('text/deal-id', deal.id); event.dataTransfer.effectAllowed = 'move'; }}
                        className="flex min-w-0 cursor-grab items-start gap-2 rounded-lg border border-ink-700 bg-ink-800/80 p-2.5 shadow-sm transition hover:border-brand-400/50 active:cursor-grabbing">
                        <button type="button" onClick={() => openDealRecord(deal)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-xs font-semibold text-white" title={dealTitle(deal)}>{dealTitle(deal)}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted" title={deal.client}>{deal.client}</span>
                          {showKanbanPipelineChips && <span className="mt-1 inline-flex max-w-full truncate rounded-full border border-ink-600 px-1.5 py-0.5 text-[9px] leading-tight text-muted" title={pipelines.find((pipeline) => pipeline.id === deal.pipelineId)?.name ?? 'Unknown pipeline'}>{pipelineLabelForDeal(deal)}</span>}
                          <span className="mt-2 flex min-w-0 items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1E2024] text-[9px] font-semibold text-[#D0D3D9]" title={ownerName}>{avatarCode(ownerName)}</span>
                            <span className="truncate text-[10px] text-brand-300">{formatAmount(deal.value, deal.currency ?? 'USD')}</span>
                          </span>
                        </button>
                        <span className="mt-0.5 shrink-0" aria-label="Next activity"><DealActivityIndicator activity={nextActivity} compact /></span>
                      </article>;
                    })}
                    {!stageDeals.length && <p className="py-7 text-center text-[11px] text-muted/60">Drop deals here</p>}
                  </div>
                </section>;
              })}
            </div>
          </div> : <div className="glass rounded-xl p-6 text-center text-sm text-muted">Choose an active pipeline with configured stages to view its pipeline.</div>}
        </div>
      ) : !dealsPageMode && workspaceView === 'kanban' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white">Deals pipeline</h2><p className="mt-1 text-xs text-muted">Drag a deal to another stage to review and save the change.</p></div>
            <select className="input !w-auto" value={selectedPipelineFilter} onChange={(event) => changePipelineFilter(event.target.value)} aria-label="Select deal pipeline">
              <option value="">All pipelines</option>
              {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </div>
          {kanbanStages.length ? <div className="deals-fit">
            <div className="deals-board grid gap-3">
              {kanbanStages.map((stage) => {
                const stageDeals = listDeals.filter((deal) => deal.stage === stage.name);
                const totalMvr = stageDeals.reduce((total, deal) =>
                  total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0);
                return <section key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  event.preventDefault();
                  const dealId = event.dataTransfer.getData('text/deal-id');
                  const droppedDeal = deals.find((deal) => deal.id === dealId);
                  const targetPipelineId = droppedDeal?.pipelineId ?? kanbanPipelines[0]?.id;
                  const targetStage = droppedDeal && pipelineStages.find((item) =>
                    item.pipelineId === targetPipelineId && item.name === stage.name);
                  if (droppedDeal && targetStage) requestStageChange(targetStage, droppedDeal);
                }} className="min-w-0 rounded-xl border border-ink-700 bg-ink-900/55 p-2.5">
                  <header className="mb-2 flex items-center justify-between gap-2 px-1">
                    <h3 className="min-w-0 break-words text-sm font-semibold text-white">{stage.name}</h3><Badge variant="muted">{stageDeals.length}</Badge>
                  </header>
                <p className="mb-2 px-1 text-[10px] text-muted">{formatAmount(totalMvr, 'MVR')} · {stageDeals.length} {stageDeals.length === 1 ? 'deal' : 'deals'}</p>
                  <div className="max-h-[calc(100vh-310px)] min-h-48 space-y-2 overflow-y-auto rounded-lg bg-ink-950/40 p-1.5">
                    {stageDeals.map((deal) => <button key={deal.id} type="button" draggable
                      onDragStart={(event) => { event.dataTransfer.setData('text/deal-id', deal.id); event.dataTransfer.effectAllowed = 'move'; }}
                      onClick={() => openDealRecord(deal)}
                      className="w-full cursor-grab rounded-lg border border-ink-700 bg-ink-800/80 p-3 text-left shadow-sm transition hover:border-brand-400/50 active:cursor-grabbing">
                      <span className="block truncate text-sm font-semibold text-white">{deal.client}</span>
                      <span className="mt-1 block truncate text-xs text-muted">{deal.product} · {deal.insurer}</span>
                      {showKanbanPipelineChips && <span className="mt-1 inline-flex max-w-full truncate rounded-full border border-ink-600 px-1.5 py-0.5 text-[9px] leading-tight text-muted" title={pipelines.find((pipeline) => pipeline.id === deal.pipelineId)?.name ?? 'Unknown pipeline'}>{pipelineLabelForDeal(deal)}</span>}
                      <span className="mt-2 block text-xs text-brand-300">{formatAmount(deal.value, deal.currency ?? 'USD')}</span>
                    </button>)}
                    {!stageDeals.length && <p className="py-7 text-center text-[11px] text-muted/60">Drop deals here</p>}
                  </div>
                </section>;
              })}
            </div>
          </div> : <div className="glass rounded-xl p-6 text-center text-sm text-muted">Choose a pipeline with configured stages to view its Kanban board.</div>}
        </div>
      ) : dealsPageMode && workspaceView === 'forecast' && !selectedItem ? (
        <section className="min-w-0 space-y-3" aria-label="Deal forecast">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label="Back four periods" onClick={() => setForecastOffset((offset) => offset - 4)}><ChevronsLeft size={14} /></button>
              <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label="Previous period" onClick={() => setForecastOffset((offset) => offset - 1)}><ChevronLeft size={14} /></button>
              <button type="button" className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => setForecastOffset(0)}>Today</button>
              <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label="Next period" onClick={() => setForecastOffset((offset) => offset + 1)}><ChevronRight size={14} /></button>
              <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label="Forward four periods" onClick={() => setForecastOffset((offset) => offset + 4)}><ChevronsRight size={14} /></button>
            </div>
            <div className="inline-flex rounded-lg border border-ink-600 bg-ink-900/50 p-1" role="group" aria-label="Forecast period">
              <button type="button" className={`rounded-md px-3 py-1 text-xs ${forecastMode === 'month' ? 'bg-ink-700 text-white' : 'text-muted'}`} aria-pressed={forecastMode === 'month'} onClick={() => { setForecastMode('month'); setForecastOffset(0); }}>Month</button>
              <button type="button" className={`rounded-md px-3 py-1 text-xs ${forecastMode === 'quarter' ? 'bg-ink-700 text-white' : 'text-muted'}`} aria-pressed={forecastMode === 'quarter'} onClick={() => { setForecastMode('quarter'); setForecastOffset(0); }}>Quarter</button>
            </div>
          </div>
          <div className="forecast-periods grid min-w-0 gap-3">
            {forecastData.map((period) => {
              const periodDeals = forecastDeals.filter((deal) => {
                if (!deal.closeDate) return false;
                const close = dateAtLocalMidnight(deal.closeDate);
                return close >= period.start && close < period.end;
              });
              const wonDeals = periodDeals.filter((deal) => {
                const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
                return isWonDeal(deal, stage);
              });
              const openDeals = periodDeals.filter((deal) => !wonDeals.includes(deal));
              const mvrTotal = (items: Deal[]) => items.reduce((total, deal) =>
                total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0);
              return <section key={period.key} data-period-start={period.startDate}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const deal = forecastDeals.find((item) => item.id === event.dataTransfer.getData('text/deal-id'));
                  if (deal) moveDealForecastPeriod(deal, period.startDate);
                }}
                className="min-w-0 rounded-xl border border-ink-700 bg-ink-900/55 p-2.5">
                <header className="mb-2 min-w-0 border-b border-ink-700 pb-2">
                  <h3 className="truncate text-sm font-semibold text-white">{period.label}</h3>
                  <p className="mt-1 truncate text-[10px] text-muted">Total {formatAmount(mvrTotal(periodDeals), 'MVR')}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[10px]">
                    <span className="text-emerald-300">Won {formatAmount(mvrTotal(wonDeals), 'MVR')}</span>
                    <span className="text-brand-300">Open {formatAmount(mvrTotal(openDeals), 'MVR')}</span>
                  </p>
                </header>
                <div className="max-h-[calc(100vh-360px)] min-h-40 space-y-2 overflow-y-auto">
                  {periodDeals.map((deal) => {
                    const probability = Math.max(0, Math.min(100, deal.probability));
                    const ownerName = ownerNameForDeal(deal);
                    return <article key={deal.id} draggable data-deal-id={deal.id} data-expected-close={deal.closeDate ?? ''}
                      onDragStart={(event) => { event.dataTransfer.setData('text/deal-id', deal.id); event.dataTransfer.effectAllowed = 'move'; }}
                      className="flex min-w-0 items-start gap-2 rounded-lg border border-ink-700 bg-ink-800/80 p-2.5">
                      <button type="button" onClick={() => openDealRecord(deal)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-semibold text-white" title={dealTitle(deal)}>{dealTitle(deal)}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted">{deal.client}</span>
                        <span className="mt-1 block truncate text-[10px] font-semibold text-brand-300">{formatAmount(deal.value, deal.currency ?? 'USD')}</span>
                        <span className="mt-1 flex min-w-0 items-center gap-1.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1E2024] text-[9px] font-semibold text-[#D0D3D9]" title={ownerName}>{avatarCode(ownerName)}</span>
                          <span className="truncate text-[10px] text-muted">{ownerName}</span>
                        </span>
                        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-ink-600" aria-label={`${probability}% win probability`}>
                          <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${probability}%` }} />
                        </span>
                      </button>
                      <span className="mt-0.5 shrink-0"><DealActivityIndicator activity={activityForDeal(deal)} /></span>
                    </article>;
                  })}
                  {!periodDeals.length && <p className="py-7 text-center text-[11px] text-muted/60">Drop deals here</p>}
                </div>
              </section>;
            })}
          </div>
        </section>
      ) : (
    <main className={`glass min-h-[460px] min-w-0 overflow-y-auto rounded-2xl px-3 py-1.5 sm:px-4 sm:py-1.5 xl:min-h-0 ${selectedLead ? 'flex flex-col' : ''}`}>
        {!selectedItem ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <ShieldCheck size={30} className="text-brand-400" /><h2 className="mt-3 font-semibold text-white">No record selected</h2>
            <p className="mt-1 text-sm text-muted">Choose a deal from List or Kanban to open its workspace.</p>
            <button type="button" className="btn-ghost mt-3 !py-1.5" onClick={() => setWorkspaceView('list')}>Go to List</button>
          </div>
        ) : <>
          <div className="order-0 flex flex-wrap items-center justify-between gap-2 border-b border-ink-600 pb-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Building2 size={17} className="shrink-0 text-brand-300" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><h1 className="text-lg font-semibold text-white">{selectedItem.client}</h1><Badge variant={selectedDeal ? 'brand' : 'muted'}>{selectedDeal ? 'Deal' : 'Lead'}</Badge><Badge variant={stageBadgeTone(selectedDeal?.stage ?? (selectedLead ? lifecycleStageForLead(selectedLead, Boolean(progressDeal)) : ''))}>{selectedDeal?.stage ?? (selectedLead ? lifecycleStageForLead(selectedLead, Boolean(progressDeal)) : '')}</Badge>{selectedLead && <><LeadTemperatureControl
                    leadName={selectedLead.title ?? selectedLead.client}
                    temperature={selectedLead.temperature ?? 'WARM'}
                    disabled={activeRole !== 'admin' && activeRole !== 'sales'}
                    onChange={(temperature) => {
                      const updatedAt = new Date().toISOString();
                      setLeads((current) => current.map((lead) =>
                        lead.id === selectedLead.id ? { ...lead, temperature, updatedAt } : lead,
                      ));
                    }}
                  /><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E2024] text-[10px] font-semibold text-[#8E95A2]" title={users.find((person) => person.id === selectedLead.ownerId)?.name ?? formatStaffIdentifier(selectedLead.ownerId)}>{users.find((person) => person.id === selectedLead.ownerId) ? avatarCode(users.find((person) => person.id === selectedLead.ownerId)?.name ?? '') : formatStaffIdentifier(selectedLead.ownerId).slice(0, 2)}</span></>}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span>{selectedDeal?.product ?? selectedProduct?.name ?? selectedLead?.productCode} · {selectedPipeline?.name ?? 'No pipeline'} · Ref {selectedItem.id}</span>
                  {progressDeal && selectedLead && <button type="button" className="text-brand-300 hover:text-white" onClick={() => setSelectedKey(`deal:${progressDeal.id}`)}>Open linked deal</button>}
                  {selectedDeal && linkedLead && <button type="button" className="text-brand-300 hover:text-white" onClick={() => setSelectedKey(`lead:${linkedLead.id}`)}>Open linked lead · {linkedLead.title ?? linkedLead.client}</button>}
                </div>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {dealsPageMode ? <ViewModeSwitcher<DealsView>
                label="Deal workspace views"
                value={workspaceView === 'pipeline' || workspaceView === 'list' || workspaceView === 'forecast' || workspaceView === 'archive' ? workspaceView : 'list'}
                options={[
                  { value: 'list', label: 'List', Icon: List },
                  { value: 'pipeline', label: 'Pipeline', Icon: Columns3 },
                  { value: 'forecast', label: 'Forecast', Icon: TrendingUp },
                  { value: 'archive', label: 'Archive', Icon: Archive },
                ]}
                onChange={changeDealsView}
                onKeyDown={(event) => {
                  const names: DealsView[] = ['list', 'pipeline', 'forecast', 'archive'];
                  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                  event.preventDefault();
                  const selectedView = names.includes(workspaceView as DealsView) ? workspaceView as DealsView : 'list';
                  const current = names.indexOf(selectedView);
                  const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
                  changeDealsView(names[next]);
                  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-view-option="${names[next]}"]`)?.focus());
                }}
              /> : <ViewModeSwitcher<'kanban' | 'inspection'>
                label="Deal workspace views"
                value={workspaceView === 'kanban' ? 'kanban' : 'inspection'}
                options={[
                  { value: 'kanban', label: 'Kanban view', Icon: Columns3 },
                  { value: 'inspection', label: 'Inspection view', Icon: List },
                ]}
                onChange={setWorkspaceView}
              />}
              <button
                type="button"
                aria-label={onClose ? 'Back to leads' : 'Back to deals'}
                title={onClose ? 'Back to leads' : 'Back to deals'}
                className="btn-ghost !px-2 !py-1.5"
                onClick={dealsPageMode ? returnToDealsView : onClose ?? (() => setWorkspaceView('list'))}
              >
                <ArrowLeft size={14} />
              </button>
              {(activeRole === 'admin' || activeRole === 'sales') && selectedLead && onEditLead && <button type="button" aria-label="Edit lead" title="Edit lead" className="btn-ghost !px-2 !py-1.5" onClick={() => onEditLead(selectedLead)}><Pencil size={14} /></button>}
              {selectedDeal && onEditDeal && <button type="button" aria-label="Edit deal" title="Edit deal" className="btn-ghost !px-2 !py-1.5" onClick={() => onEditDeal(selectedDeal)}><Pencil size={14} /></button>}
              {activeRole === 'admin' && selectedLead && onDeleteLead && <button type="button" aria-label="Delete lead" title="Delete lead" className="btn-ghost !px-2 !py-1.5 text-hot" onClick={() => onDeleteLead(selectedLead)}><Trash2 size={14} /></button>}
              {activeRole === 'admin' && selectedDeal && onDeleteDeal && <button type="button" aria-label="Delete deal" className="btn-ghost !px-2 !py-1.5 text-hot" disabled={dealHasInvoice} title={dealHasInvoice ? 'Deals linked to invoices cannot be deleted.' : 'Delete deal'} onClick={() => onDeleteDeal(selectedDeal)}><Trash2 size={14} /></button>}
            </div>
          </div>

          {selectedLead && <section aria-label="Lead telemetry stage tracker" className="telemetry-panel relative order-4 mt-2 w-full min-w-0 rounded-xl px-2 py-3">
            <h2 className="sr-only">{selectedLead ? 'Lead telemetry' : 'Placement telemetry'}</h2>
            {stageTimeline.length ? <>
              <div className="w-full min-w-0 overflow-x-auto py-1">
                <ol className={`telemetry-track flex min-w-[700px] items-start justify-between pl-20 xl:min-w-0 ${selectedLead ? 'telemetry-track--lead' : ''} ${selectedLead && activeProgressStage === 'Lost' ? 'is-lost' : ''}`}>
                      {stageTimeline.map((stage) => {
                        const pipelineStage = typeof progressStages[stage.index] === 'string'
                          ? undefined
                          : progressStages[stage.index] as PipelineStage;
                        const stageEnteredAtMilliseconds = stage.enteredAt
                          ? Date.parse(stage.enteredAt)
                          : stage.active && enteredAt
                            ? Date.parse(enteredAt)
                            : Number.NaN;
                        const stageElapsedMilliseconds = stage.active
                          ? Number.isFinite(stageEnteredAtMilliseconds)
                            ? Math.max(0, clockNow - stageEnteredAtMilliseconds)
                            : undefined
                          : stage.duration;
                        const durationMilliseconds = stageElapsedMilliseconds;
                        const nextStageEnteredAt = stageTimeline[stage.index + 1]?.enteredAt;
                        const interStageMilliseconds = stage.duration
                          ?? elapsedBetweenDates(stage.enteredAt, nextStageEnteredAt)
                          ?? (stage.active ? durationMilliseconds : undefined);
                        const hasNextStage = stage.index < stageTimeline.length - 1;
                        const segmentDurationLabel = stage.done && hasNextStage
                          ? formatInterStageDays(interStageMilliseconds)
                          : '';
                        const segmentTransitionDate = stage.done ? formatDate(nextStageEnteredAt) : undefined;
                        const activeDurationLabel = stage.active
                          ? formatActiveDuration(stage.enteredAt ?? enteredAt, clockNow)
                          : undefined;
                        const durationLabel = stage.active
                          ? activeDurationLabel
                          : stage.done && hasNextStage
                            ? segmentDurationLabel ?? ''
                            : '';
                        const cumulativeLabel = formatDays(stage.cumulative);
                        const displayStageName = stage.name === 'Converted to deal' ? 'Converted' : stage.name;
                        const lostTerminal = selectedLead && stage.name === 'Lost' && stage.done;
                        const health = stageSlaHealth(durationMilliseconds, stage.targetDays);
                        const stageOverdue = health === 'overdue';
                        const stageDateLabel = stage.done || stage.active
                          ? formatDate(stageDateFromFields({
                            enteredAt: stage.index === 0
                              ? progressStartDate
                              : stage.enteredAt ?? (stage.active ? enteredAt : undefined),
                          }))
                          : undefined;
                        const showStageDate = stageDateLabel && !(selectedLead && stage.index === 0);
                        return <li key={stage.key} className="telemetry-step relative flex min-w-0 flex-1 flex-col items-center">
                          <button type="button" disabled={selectedLead
                            ? (activeRole !== 'admin' && activeRole !== 'sales') || isTerminalLeadStage(lifecycleStageForLead(selectedLead, Boolean(progressDeal)))
                            : !pipelineStage || !progressDeal || stage.active || isTerminalDealStage(
                              progressDeal.stage,
                              progressDeal.disposition,
                              currentStage,
                            )}
                            onClick={() => {
                              if (selectedLead && isLeadLifecycleStage(stage.name)) {
                                changeLeadTelemetryStage(stage.name);
                              } else if (pipelineStage && progressDeal) {
                                requestStageChange(pipelineStage, progressDeal);
                              }
                            }}
                            title={stage.active && stageOverdue ? `SLA overdue: stage exceeded its ${stage.targetDays}-day target` : stage.active && health === 'warning' ? `SLA warning: stage is approaching its ${stage.targetDays}-day target` : stage.name}
                            aria-label={`${displayStageName}${stageDateLabel ? `; entered ${stageDateLabel}` : ''}${durationLabel ? `; stage duration ${durationLabel}` : ''}${stage.active ? `${activeDurationLabel ? `; elapsed ${activeDurationLabel}` : ''}` : stage.done ? '; completed' : '; upcoming'}${stage.active && stageOverdue ? `; SLA overdue, target ${stage.targetDays} days` : stage.active && health === 'warning' ? `; approaching target of ${stage.targetDays} days` : ''}`}
                            aria-current={stage.active ? 'step' : undefined}
                            className={`telemetry-stage relative z-[1] flex w-full flex-col items-center border-0 bg-transparent px-0.5 py-0 text-center disabled:cursor-default ${lostTerminal ? 'is-lost' : stage.active ? 'is-active' : stage.done ? 'is-complete' : 'is-pending'}`}>
                            {!selectedLead && <span className="flex h-4 items-center justify-center whitespace-nowrap font-mono text-[10px] font-medium leading-none tabular-nums text-[#8B949E] sm:text-xs">
                              {showStageDate && stageDateLabel}
                            </span>}
                            <span className={`flex h-7 w-full items-center justify-center px-1 text-[10px] font-semibold leading-3 tracking-normal sm:text-xs ${stage.active ? 'text-white' : stage.done ? 'text-[#A5DDBB]' : 'text-[#89919C]'}`}>
                              {displayStageName}
                            </span>
                            <span className={`telemetry-node ${lostTerminal ? 'is-lost' : stage.active ? `is-${health}` : stage.done ? 'is-complete' : ''}`}>
                              {stage.done ? <Check size={11} aria-hidden="true" /> : <span className="telemetry-node-core" />}
                            </span>
                          </button>
                          {!selectedLead && stage.active && (activeDurationLabel || cumulativeLabel) && <span className="relative z-[1] mt-1 min-h-4 whitespace-nowrap text-center text-[9px] font-medium leading-3 tabular-nums text-emerald-300">
                            {activeDurationLabel}{cumulativeLabel && <span className="ml-1 text-[#A8B1BC]">· {cumulativeLabel}</span>}
                          </span>}
                          {stage.index < stageTimeline.length - 1 && <span className={`telemetry-connector ${stage.done ? 'is-complete' : ''}`}>
                            {!selectedLead && stage.done && hasNextStage && segmentDurationLabel && <span className="telemetry-transition-label"
                              title={`${segmentDurationLabel}${segmentTransitionDate ? ` · ${segmentTransitionDate}` : ''} from ${stage.name} to ${stageTimeline[stage.index + 1].name}`}
                              aria-label={`${segmentDurationLabel}${segmentTransitionDate ? `; transitioned ${segmentTransitionDate}` : ''} from ${stage.name} to ${stageTimeline[stage.index + 1].name}`}>
                              {segmentDurationLabel}
                              {segmentTransitionDate && <span className="ml-1 text-[#8B949E]">{segmentTransitionDate}</span>}
                            </span>}
                          </span>}
                        </li>;
                      })}
                </ol>
                {selectedLead && <ol
                  aria-label="Lead stage dates and durations"
                  className="telemetry-metrics-row flex min-w-[700px] items-start justify-between pl-20"
                >
                  {stageTimeline.map((stage) => {
                    const isInitiated = stage.done || stage.active;
                    const nextStage = stageTimeline[stage.index + 1];
                    const rawStageDate = stageDateFromFields(stage)
                      ?? (stage.index === 0 ? progressStartDate : undefined)
                      ?? (stage.active
                        ? selectedLead.stage_changed_at ?? selectedLead.stageChangedAt ?? selectedLead.routedAt
                        : undefined);
                    const enteredDate = isInitiated
                      ? formatDate(stageDateFromFields({ enteredAt: rawStageDate }))
                      : undefined;
                    const reachedTerminal = stage.done
                      && stage.index === stageTimeline.length - 1
                      && (stage.name === 'Converted to deal' || stage.name === 'Lost');
                    const activeDays = stage.active
                      ? formatElapsedCalendarDays(rawStageDate, clockNow)
                      : undefined;
                    const stageTotal = reachedTerminal ? formatDays(stage.cumulative) : undefined;
                    const completedMilliseconds = stage.done && nextStage
                      ? stage.duration ?? elapsedBetweenDates(rawStageDate, stageDateFromFields(nextStage))
                      : undefined;
                    const completedDuration = formatMeasuredDays(completedMilliseconds);
                    const stageDuration = stage.done && !reachedTerminal
                      ? completedDuration
                      : activeDays;
                    return <li key={`metrics-${stage.key}`} className="telemetry-metric-step relative flex min-w-0 flex-1 flex-col items-center text-center">
                      {enteredDate && <span className="whitespace-nowrap font-mono text-[9px] leading-3 tabular-nums text-[#8B949E] sm:text-[10px]">
                        {enteredDate}
                      </span>}
                      {(reachedTerminal ? stageTotal : stageDuration) && <span className="whitespace-nowrap font-mono text-[9px] font-semibold leading-3 tabular-nums text-[#A5DDBB] sm:text-[10px]">
                        {reachedTerminal ? stageTotal : `+${stageDuration}`}
                      </span>}
                    </li>;
                  })}
                </ol>}
                {selectedLead && contactError && <p role="alert" className="mt-2 text-xs text-hot">{contactError}</p>}
              </div></> : <p className="py-1 text-[10px] text-muted">No stages are configured for this pipeline.</p>}
          </section>}

          {selectedLead ? (
            <>
            <div className="order-2 mt-3 grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
                <h2 className="mb-3 text-sm font-semibold text-white">Client Details</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <DetailValue label="Name" value={selectedClient?.name ?? selectedLead.client} />
                  <DetailValue label="Identification" value={selectedClient?.tin} />
                  <DetailValue label="Address" value={selectedClient?.address} />
                  <DetailValue label="Country" value={selectedClient?.country || selectedLead.country} />
                  <DetailValue label="Email" value={selectedClient?.email} />
                  <DetailValue label="Phone" value={selectedClient?.phone} />
                </div>
                <div className="mt-3 border-t border-ink-700 pt-3">
                  <h3 className="mb-2 text-xs font-semibold text-white">Lead Details</h3>
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    <DetailValue label="Lead Owner" value={users.find((person) => person.id === selectedLead.ownerId)?.name ?? formatStaffIdentifier(selectedLead.ownerId)} />
                    <DetailValue label="Lead Stage" value={lifecycleStageForLead(selectedLead, Boolean(progressDeal))} />
                    <DetailValue label="Contacted At" value={formatDate(getLeadContactedAt(selectedLead)) || 'Awaiting first contact'} />
                    {selectedLead.lossReason && <DetailValue label="Loss reason" value={selectedLead.lossReason} />}
                    <DetailValue label="Expected Closing Date" value={formatDate(selectedLead.closeDate ?? selectedLead.renewalDate)} />
                    <DetailValue label="Remarks / Notes" value={selectedLead.notes} />
                  </div>
                  <div className="mt-3"><LeadContactSlaBadge lead={selectedLead} pipelineStages={pipelineStages} now={clockNow} /></div>
                </div>
              </section>
              <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
                <h2 className="mb-3 text-sm font-semibold text-white">Policy Details</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <DetailValue label="Probability Percentage" value={selectedLeadProbability === undefined ? undefined : `${selectedLeadProbability}%`} />
                  <DetailValue label="Insurance Type" value={selectedProduct?.name ?? selectedLead.insuranceClass} />
                  <DetailValue label="Current Insurer" value={selectedClient?.insurer} />
                  <DetailValue label="Sum Insured" value={Number.isFinite(selectedLead.sumInsured) && selectedLead.sumInsured > 0 ? formatAmount(selectedLead.sumInsured, selectedLead.currency ?? 'MVR') : undefined} />
                  <DetailValue label="Premium Value" value={Number.isFinite(selectedLead.premium) && selectedLead.premium > 0 ? formatAmount(selectedLead.premium, selectedLead.currency ?? 'MVR') : undefined} />
                  <DetailValue label="Expiry / Renewal Date" value={formatDate(selectedLead.renewalDate)} />
                </div>
              </section>
            </div>
            <section className="order-3 mt-3 min-w-0 rounded-xl border border-ink-600 bg-ink-900/30 p-3">
              <ContactDirectory contacts={detailContacts} primaryContactId={primaryContact?.id}
                assignedContactId={primaryContact?.id ?? selectedLead.contactProfileId} onAssign={assignContactProfile}
                onEditContact={openEditContact} compact />
            </section>
            </>
          ) : <>
          <div data-testid="deal-detail-cards" className="mt-3 grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">Client & Contact Details</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <DetailValue label="Client" value={selectedClient?.name ?? selectedDeal?.client} />
              <DetailValue label="Identification" value={selectedClient?.tin} />
              <DetailValue label="Address" value={selectedClient?.address} />
              <DetailValue label="Country" value={selectedClient?.country} />
              <DetailValue label="Client email" value={selectedClient?.email} />
              <DetailValue label="Client phone" value={selectedClient?.phone} />
              </div>
              <ContactDirectory contacts={detailContacts} primaryContactId={primaryContact?.id}
                assignedContactId={primaryContact?.id ?? selectedDeal?.contactProfileId} onAssign={assignContactProfile}
                onEditContact={openEditContact} />
              <form className="mt-3 rounded-xl border border-ink-600 bg-ink-950/40 p-3" onSubmit={saveContactChannels}>
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
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><FileText size={15} className="text-brand-300" /> Policy Details</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailValue label="Insurance Type" value={selectedProduct?.name ?? selectedDeal?.product} />
                <DetailValue label="Current Insurer" value={selectedDeal?.insurer?.toLowerCase() === 'not assigned' ? selectedClient?.insurer : selectedDeal?.insurer || selectedClient?.insurer} />
                <DetailValue label="Sum Insured" value={selectedClient && selectedClient.sumInsured > 0
                  ? formatAmount(selectedClient.sumInsured, 'MVR')
                  : selectedDeal && Number.isFinite(selectedDeal.value) && selectedDeal.value > 0 ? formatAmount(selectedDeal.value, selectedDeal.currency)
                    : linkedLead && Number.isFinite(linkedLead.sumInsured) && linkedLead.sumInsured > 0
                      ? formatAmount(linkedLead.sumInsured, linkedLead.currency ?? 'MVR') : undefined} />
                <DetailValue label="Premium" value={selectedClient && Number.isFinite(selectedClient.premium) && selectedClient.premium > 0
                  ? formatAmount(selectedClient.premium, 'MVR')
                  : linkedLead && Number.isFinite(linkedLead.premium) && linkedLead.premium > 0
                    ? formatAmount(linkedLead.premium, linkedLead.currency ?? 'MVR') : undefined} />
                <DetailValue label="Probability" value={selectedDeal && Number.isFinite(selectedDeal.probability) ? `${selectedDeal.probability}%` : undefined} />
                <DetailValue label="Expected Close" value={formatDate(selectedDeal?.closeDate)} />
                <DetailValue label="Policy Expiry" value={formatDate(selectedDeal?.policyExpiry ?? selectedClient?.expiry)} />
                <DetailValue label="Brokerage Estimate" value={selectedDeal?.brokerageCommission !== undefined && Number.isFinite(selectedDeal.brokerageCommission)
                  ? formatAmount(selectedDeal.brokerageCommission, selectedDeal.currency) : undefined} />
                <DetailValue label="Owner / Representative" value={users.find((person) => person.id === selectedItem.ownerId)?.name ?? formatStaffIdentifier(selectedItem.ownerId)} />
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
          {selectedDeal && <section data-testid="deal-stage-stepper" aria-label="Deal stage tracker" className="mt-3 min-w-0 rounded-xl border border-ink-600 bg-ink-900/30 px-2 py-3 sm:px-4">
            <StageStepper
              pipelineStages={stages}
              currentStageId={currentStage?.id}
              dealStatus={dealStageStatus}
              lossReason={selectedDeal.lossReason}
              stageEnteredAt={enteredAt}
              now={clockNow}
              canEdit={activeRole === 'admin' || activeRole === 'sales'}
              onSelect={(target) => requestStageChange(target, selectedDeal)}
            />
          </section>}
          <section data-testid="workspace-activity" className={`${selectedLead ? 'order-5' : ''} mt-4 min-w-0 border-t border-ink-600 pt-3`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock3 size={15} className="text-brand-300" /> Activity</h2>
                <p className="mt-1 text-xs text-muted">Stage movement and client touchpoints.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('schedule')}><CalendarDays size={13} /> Schedule next activity</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('meeting')}><CalendarDays size={13} /> Appointment</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('quote')}><FileText size={13} /> Proposal</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('note')}><Plus size={13} /> Note</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setActivityModal('task')}><Check size={13} /> Task</button>
              </div>
            </div>
            <div data-testid="activity-summary" aria-label="Record summary" className="mb-4 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/50 px-3 py-2 text-xs">
              <Badge variant={selectedDeal ? 'brand' : 'muted'}>{selectedDeal ? 'Deal' : 'Lead'}</Badge>
              <Badge variant={stageBadgeTone(selectedDeal?.stage ?? (selectedLead ? lifecycleStageForLead(selectedLead, Boolean(progressDeal)) : ''))}>
                {selectedDeal?.stage ?? (selectedLead ? lifecycleStageForLead(selectedLead, Boolean(progressDeal)) : '')}
              </Badge>
              <span className="text-[#E1E2E5]">{selectedProduct?.name ?? selectedDeal?.product ?? selectedLead?.insuranceClass ?? selectedItem?.productCode ?? 'No insurance type'}</span>
              <span className="font-semibold text-white">
                {selectedDeal
                  ? formatAmount(selectedDeal.value, selectedDeal.currency ?? 'USD')
                  : formatAmount(selectedLead?.value ?? selectedLead?.premium ?? 0, selectedLead?.currency ?? 'MVR')}
              </span>
              <span className="text-muted">{users.find((person) => person.id === selectedItem?.ownerId)?.name ?? formatStaffIdentifier(selectedItem?.ownerId ?? '')}</span>
              <Badge variant={selectedSlaStatus?.overdue ? 'hot' : 'muted'}>
                <Clock3 size={11} /> {selectedSlaStatus?.overdue ? 'SLA overdue' : selectedSlaStatus ? 'SLA on track' : 'SLA unavailable'}
              </Badge>
            </div>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter timeline entries">
              {([
                ['all', 'All'],
                ['stage', 'Stage changes'],
                ['temperature', 'Temperature'],
                ['activity', 'Activity'],
                ['appointment', 'Appointments'],
                ['proposal', 'Proposals'],
                ['note', 'Notes'],
                ['task', 'Tasks'],
                ['call', 'Calls'],
                ['email', 'Emails'],
                ['upload', 'Uploads'],
              ] as const).map(([category, label]) => (
                <button key={category} type="button" aria-pressed={timelineFilter === category}
                  onClick={() => setTimelineFilter(category)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${timelineFilter === category ? 'border-brand-400 bg-brand-400/15 text-white' : 'border-ink-700 text-muted hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="-mx-1 max-h-60 max-w-full overflow-y-auto overscroll-contain scroll-smooth timeline-scrollbar px-1 pb-2"
              role="region" aria-label="Activity timeline" tabIndex={0}>
              <div className="flex min-w-full flex-col gap-1">
                {filteredTimelineEntries.map((entry) => <ActivityTimelineItem
                  key={entry.key}
                  title={entry.title}
                  description={entry.description}
                  date={entry.date}
                  durationMinutes={entry.durationMinutes}
                  category={entry.category}
                  origin={entry.origin}
                  actor={entry.actor}
                  onMarkDone={entry.activityId && entry.scheduled && !entry.done
                    ? () => setActivities(activities.map((activity) => activity.id === entry.activityId
                      ? { ...activity, done: true }
                      : activity))
                    : undefined}
                />)}
                {!filteredTimelineEntries.length && <p className="min-w-full rounded-xl border border-ink-700 bg-ink-900/40 p-5 text-center text-sm text-muted">{timelineEntries.length ? 'No entries match this filter.' : 'No activity has been recorded yet.'}</p>}
              </div>
            </div>
          </section>
          {selectedLead ? <section className="order-6 mt-3 rounded-xl border border-ink-600 bg-ink-900/30 p-3">
            <h2 className="text-sm font-semibold text-white">Lead progression</h2>
            {progressDeal ? <p className="mt-3 text-xs text-win">This lead is linked to deal {progressDeal.id} and follows its placement stages.</p> : <>
              {selectedLead.disposition === 'lost'
                ? <p className="mt-3 text-xs text-hot">This lead is Lost and cannot be converted to a deal.</p>
                : <p className="mt-3 text-xs text-muted">Convert this lead to begin the placement stage workflow.</p>}
              {!hasCompleteCommunicationChannels(selectedLead) && <p className="mt-2 text-xs text-warm">Complete valid phone, WhatsApp, and Telegram details first.</p>}
              {selectedLead.disposition !== 'lost' && <button type="button" className="btn-primary mt-3 !py-1.5" onClick={convertLead}><ArrowRight size={13} /> Convert to deal</button>}
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
              {visibleQuotes.length ? <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-52 text-left text-xs">
                <thead className="text-[10px] text-muted"><tr><th className="pb-2 font-medium">Insurer</th><th className="pb-2 text-right font-medium">Premium</th><th className="pb-2 text-right font-medium">Date</th></tr></thead>
                <tbody>{visibleQuotes.map((quote) => <tr key={quote.id} className="border-t border-ink-700/60"><td className="py-2 text-white">{quote.insurer}</td><td className="py-2 text-right text-brand-300">{formatAmount(quote.quoteAmount ?? 0, quote.quoteCurrency ?? 'MVR')}</td><td className="py-2 text-right text-muted">{formatDate(quote.date)}</td></tr>)}</tbody>
              </table></div> : <p className="text-xs text-muted">No insurer quotes recorded. Add quotes to compare premium and terms.</p>}
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-4">
              <h2 className="text-sm font-semibold text-white">Binding actions</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost !px-2 !py-2 text-xs" disabled={!selectedDeal} onClick={() => setActivityModal('quote')}><FileText size={13} /> Add quote</button>
                <button type="button" className="btn-primary !px-2 !py-2 text-xs" disabled={!selectedDeal || !stages.find((stage) => isBoundStage(stage))} onClick={() => {
                  const finalStage = stages.find((stage) => isBoundStage(stage));
                  if (finalStage) requestStageChange(finalStage);
                }}><ShieldCheck size={13} /> Bind policy</button>
              </div>
              {selectedDeal?.linkedInvoiceId && <p className="mt-2 text-xs text-win">Invoice generated for this bound deal.</p>}
            </div>
          </section>}
        </>}
      </main>
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
      <Modal open={Boolean(pendingLeadTelemetryStage)}
        onClose={() => setPendingLeadTelemetryStage(null)}
        title={company.requireNextActivityForStageChange ? 'Schedule an activity first' : 'Continue without an activity?'}
        subtitle={selectedLead?.client}
        footer={company.requireNextActivityForStageChange
          ? <button type="button" className="btn-primary" onClick={() => setPendingLeadTelemetryStage(null)}>Got it</button>
          : <>
            <button type="button" className="btn-ghost" onClick={() => setPendingLeadTelemetryStage(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => {
              if (pendingLeadTelemetryStage) changeLeadTelemetryStage(pendingLeadTelemetryStage, true);
            }}>Continue</button>
          </>}>
        <div className="flex items-start gap-3 text-sm text-muted">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warm" />
          <p>{company.requireNextActivityForStageChange
            ? 'Schedule a next activity before moving this lead to another stage.'
            : 'No next activity is scheduled. Do you want to continue with this stage change?'}</p>
        </div>
      </Modal>
      <Modal open={Boolean(activityModal)} onClose={() => setActivityModal(null)}
        title={activityModal === 'meeting' ? 'Schedule / Log Meeting'
          : activityModal === 'quote' ? 'Add insurer quote'
            : activityModal === 'schedule' ? 'Schedule next activity'
              : activityModal === 'task' ? 'Schedule task' : 'Add note'}
        subtitle={selectedItem?.client}
        footer={<><button type="button" className="btn-ghost" onClick={() => setActivityModal(null)}>Cancel</button><button type="submit" form="workspace-activity-form" className="btn-primary">{activityModal === 'meeting' ? 'Save Meeting' : activityModal === 'schedule' ? 'Schedule activity' : activityModal === 'task' ? 'Save task' : 'Save activity'}</button></>}>
        <form id="workspace-activity-form" onSubmit={addActivity} className="space-y-3">
          <Field label={activityModal === 'task' || activityModal === 'schedule' ? 'Activity title' : 'Title'}><input className="input" name="title" required maxLength={120} placeholder={activityModal === 'meeting' ? 'Client placement review' : activityModal === 'quote' ? 'Commercial terms' : activityModal === 'task' || activityModal === 'schedule' ? 'Follow up with client' : 'Activity note'} /></Field>
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
          {activityModal === 'schedule' && <>
            <Field label="Activity type"><select className="input" name="activityType" defaultValue="task"><option value="task">Task</option><option value="meeting">Meeting</option><option value="call">Call</option><option value="email">Email</option></select></Field>
            <Field label="Due date *"><input className="input" name="dueDate" type="datetime-local" required defaultValue={localDateTimeInput()} /></Field>
            <Field label="Assignee"><select className="input" name="assigneeId" defaultValue={selectedItem?.ownerId ?? ''}><option value="">Unassigned</option>{users.filter((person) => person.role === 'admin' || person.role === 'sales').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
          </>}
          {activityModal !== 'meeting' && activityModal !== 'task' && activityModal !== 'schedule' && <Field label={activityModal === 'quote' ? 'Terms / coverage notes' : 'Note'}><textarea className="input min-h-24" name="description" required placeholder="Record the terms, coverage, or next steps." /></Field>}
          {activityModal === 'schedule' && <Field label="Note (optional)"><textarea className="input min-h-20" name="description" placeholder="Add context or expected outcome." /></Field>}
        </form>
      </Modal>

      <Modal open={Boolean(moveStage)} onClose={() => { setMoveStage(null); setMoveOutcome(null); setMoveError(''); setWinReason(''); }} title={moveOutcome ? `Mark deal ${moveOutcome}` : 'Update deal stage'} subtitle={`${selectedDeal?.client} · ${moveOutcome ? 'Outcome' : moveStage?.name}`} size="lg"
        footer={<><button type="button" className="btn-ghost" onClick={() => { setMoveStage(null); setMoveOutcome(null); setMoveError(''); setWinReason(''); }}>Cancel</button><button type="button" className="btn-primary" disabled={Boolean(company.requireNextActivityForStageChange && selectedDeal && activityForDeal(selectedDeal).state === 'none')} onClick={() => moveStage && applyStageChange(moveStage, lossReason, moveOutcome ?? undefined)}>{moveOutcome ? `Mark ${moveOutcome}` : 'Save stage'}</button></>}>
        <div className="space-y-3">
          <Field label={moveOutcome ? 'Current stage' : 'New stage'}><input className="input" value={moveOutcome ? selectedDeal?.stage ?? '' : moveStage?.name ?? ''} readOnly aria-readonly="true" /></Field>
          {selectedDeal && activityForDeal(selectedDeal).state === 'none' && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warm/30 bg-warm/5 p-3 text-xs text-warm">
            <span><AlertTriangle size={13} className="mr-1 inline" />No next activity is scheduled. {company.requireNextActivityForStageChange ? 'Scheduling is required by Settings.' : 'You may continue without scheduling one.'}</span>
            <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => { setMoveStage(null); setMoveOutcome(null); setActivityModal('schedule'); }}>Schedule next activity</button>
          </div>}
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
          {moveStage && isLostStage(moveStage) && <Field label="Loss reason (required)"><select className="input" value={lossReason} onChange={(event) => setLossReason(event.target.value)}><option value="">Select a reason</option>{getPipelineLossReasons(selectedPipeline?.code).map((reason) => <option key={reason}>{reason}</option>)}</select></Field>}
          {moveStage && isBoundStage(moveStage) && <>
            <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">Confirm that the policy is bound. A pending premium invoice will be created automatically.</p>
            <Field label="Win reason (required)"><textarea className="input min-h-20" value={winReason} onChange={(event) => { setWinReason(event.target.value); setMoveError(''); }} placeholder="Record why the client selected this placement." maxLength={2000} /></Field>
          </>}
          <Field label="Remarks / Notes (optional)"><textarea className="input min-h-20" value={stageChangeRemarks} onChange={(event) => setStageChangeRemarks(event.target.value)} placeholder="Add stage-change notes for the activity timeline." maxLength={2000} /></Field>
          {moveError && <p role="alert" className="text-sm text-hot">{moveError}</p>}
        </div>
      </Modal>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value?: string }) {
  const displayValue = value?.trim();
  if (!displayValue || displayValue === '—' || displayValue === '-' || displayValue.toLowerCase() === 'not assigned') return null;
  return <div className="min-w-0"><div className="text-xs text-muted">{label}</div><div className="mt-1 break-words text-sm text-white">{displayValue}</div></div>;
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
        <dl className={`grid grid-cols-[minmax(130px,1.2fr)_minmax(150px,1.5fr)_repeat(3,minmax(115px,1fr))_32px] gap-3 px-2 text-[11px] font-medium normal-case tracking-normal text-muted ${compact ? 'py-1' : 'pb-1.5'}`}>
          <dt>Name</dt><dt>Email</dt><dt>Phone</dt><dt>WhatsApp</dt><dt>Telegram</dt><dt><span className="sr-only">Edit</span></dt>
        </dl>
        <div className="divide-y divide-ink-700/70">
          {contacts.map((contact) => {
            const primary = contact.id === primaryContactId;
            return <article key={contact.id} className={`grid grid-cols-[minmax(130px,1.2fr)_minmax(150px,1.5fr)_repeat(3,minmax(115px,1fr))_32px] items-center gap-3 bg-ink-950/35 px-2 text-xs ${compact ? 'py-1.5' : 'py-2'}`}>
              <div className="flex min-w-0 items-center gap-1.5" title={`${contact.name}${contact.role ? ` · ${contact.role}` : ''}`}>
                <span className="min-w-0 truncate font-semibold text-white">{contact.name}</span>
                <span className="min-w-0 truncate text-[10px] text-muted">{contact.role}</span>
                {primary && <span className="shrink-0 text-[9px] tracking-wide text-brand-300">Primary</span>}
              </div>
              <span className="truncate text-white" title={contact.email || undefined}>{contact.email}</span>
              <span className="truncate text-white" title={contact.phone || undefined}>{contact.phone}</span>
              <span className="truncate text-white" title={contact.whatsapp || undefined}>{contact.whatsapp}</span>
              <span className="truncate text-white" title={contact.telegram || undefined}>{contact.telegram}</span>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}
