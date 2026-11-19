import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Check, Clock3, Plus, Settings2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { DEAL_PIPELINE_STAGES, getPipelineLossReasons, PIPELINE_TEMPLATES } from '../data/pipelineStageTemplates';
import { AUTH_BYPASS, TENANT_ID } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanPill } from '../components/kanban';
import { avatarCode } from '../components/table/avatar';
import PageToolbar from '../components/ui/PageToolbar';
import type { Deal, Pipeline, PipelineStage, StageHistoryAudit } from '../types';
import { formatAmount, toMvr } from '../utils/currency';
import { formatDate, formatShortDate } from '../utils/date';
import { hasCompleteCommunicationChannels, requiresCommunicationChannels } from '../utils/communication';
import { hasCompleteClientProfile } from '../utils/customerProfile';
import {
  getStageSlaElapsedDays, isLostPipelineStage, isTerminalDealStage, isWonPipelineStage,
} from '../utils/stageSla';
import { dashboardHref, promptQuotationRequestForDeal } from '../utils/navigation';
import { linkDealToLead } from '../utils/dealFactory';
import { getNextActivity } from '../utils/nextActivity';
import { nextLocalReference } from '../utils/references';
import { validateDealBaseForProgression } from '../utils/monthlyDealSummary';
import { formatStaffIdentifier } from '../utils/staff';

const legacyStageNames: Record<string, string> = {
  'Lead Identified': 'Identified',
  'Qualified (Discovery)': 'Identified',
  'Contact Made': 'Contact Made',
  'Key Person Identified': 'Key Person Identified',
  'Fact-Finding & Risk Survey': 'Requirements Identified',
  'Market Tender & Placing Slip Submission': 'Quotation / Underwriting',
  'Market Placement / Outender': 'Quotation / Underwriting',
  'Market Placement / Tender': 'Quotation / Underwriting',
  'Solution Alignment': 'Meetings',
  'Solution Alignment (Demo/Quote Request)': 'Meetings',
  'Underwriter Negotiation & Structuring': 'Quotation / Underwriting',
  'Underwriter Negotiation': 'Quotation / Underwriting',
  'Internal Slip': 'Quotation / Underwriting',
  'Negotiation & Legal': 'Quotation / Underwriting',
  'Negotiation & Legal (MIRA Compliance)': 'Quotation / Underwriting',
  Quoted: 'Quoted / Proposed',
  'Comparative Analysis & Presentation': 'Quoted / Proposed',
  'Quote Comparison & Presentation': 'Quoted / Proposed',
  'Quote Comparison Presented': 'Quoted / Proposed',
  'Proposal / Business Case': 'Quoted / Proposed',
  'Policy Bound / Won': 'Review and Follow up',
  'Closed-Won': 'Review and Follow up',
  'Closed-Lost': 'Review and Follow up',
  'Lost / Declined': 'Review and Follow up',
  'Lost / Market Declined': 'Review and Follow up',
  'Lapsed / Lost to Competitor': 'Review and Follow up',
  'Policy Bound / won , Lost / Declined': 'Review and Follow up',
  'Intake & Rating': 'Requirements Identified',
  'Intake & Automated Rating': 'Requirements Identified',
  'Standard Package Quoted': 'Quoted / Proposed',
  'Payment & Immediate Cover': 'Review and Follow up',
  'Renewal Audit & Loss Review (T-90d)': 'Identified',
  'Expiring Carrier Terms / Market Re-tender (T-60d)': 'Quotation / Underwriting',
  'Renewal Terms Presentation (T-30d)': 'Quoted / Proposed',
  'Client Renewal Sign-Off (T-15d)': 'Review and Follow up',
  'Policy Renewed & Re-Invoiced': 'Review and Follow up',
};

function availableTemplateKey(pipelines: Pipeline[]) {
  return Object.entries(PIPELINE_TEMPLATES)
    .find(([, template]) => !pipelines.some((pipeline) => pipeline.code.toLowerCase() === template.code.toLowerCase()))?.[0]
    ?? 'commercialDefault';
}

function isLostStage(stage: string | PipelineStage) {
  return isLostPipelineStage(stage);
}

function isWonStage(stage: string | PipelineStage) {
  return isWonPipelineStage(stage);
}

function isRenewalPipeline(pipeline?: Pipeline) {
  return pipeline?.code.toLowerCase() === 'renewals';
}

function pipelineShortLabel(pipeline?: Pipeline) {
  const code = pipeline?.code.toUpperCase();
  return code === 'COMMERCIAL' ? 'Commercial'
    : code === 'SME_VELOCITY' ? 'SME'
      : code === 'RENEWALS' ? 'Renewals'
        : pipeline?.name ?? 'Unknown pipeline';
}

function subtractDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00`);
  result.setDate(result.getDate() - days);
  return result.toISOString().slice(0, 10);
}

type HealthState = 'Healthy' | 'At Risk' | 'Rotting';
type IntentTier = NonNullable<Deal['intentTier']>;

function intentForDeal(deal: Deal): IntentTier {
  if (deal.intentTier) return deal.intentTier;
  if (deal.probability >= 75) return 'P1';
  if (deal.probability >= 40) return 'P2';
  return 'P3';
}

function dealHealth(elapsed: number | null, threshold: number): HealthState {
  if (threshold <= 0 || elapsed === null) return 'Healthy';
  if (elapsed >= threshold) return 'Rotting';
  if (elapsed >= threshold * 0.7) return 'At Risk';
  return 'Healthy';
}

const healthFilterClasses: Record<HealthState, string> = {
  Healthy: 'bg-win/15 text-win border-win/40',
  'At Risk': 'bg-warm/15 text-warm border-warm/40',
  Rotting: 'bg-hot/15 text-hot border-hot/40',
};

function makeId() {
  return crypto.randomUUID();
}

export default function PipelinesPage() {
  const {
    user, users, deals, setDeals, setLeads, clients, pipelines, setPipelines, pipelineStages, setPipelineStages,
    stageHistory, setStageHistory, invoices, setInvoices, quotationRequests, clientQuotations, activities, company, leads,
  } = useApp();
  const [pipelineId, setPipelineId] = useState(pipelines.find((pipeline) => pipeline.isActive)?.id ?? '');
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineTemplateKey, setPipelineTemplateKey] = useState(() => availableTemplateKey(pipelines));
  const [pipelineName, setPipelineName] = useState(() => PIPELINE_TEMPLATES[availableTemplateKey(pipelines)].name);
  const [pipelineCode, setPipelineCode] = useState(() => PIPELINE_TEMPLATES[availableTemplateKey(pipelines)].code);
  const [pipelineError, setPipelineError] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stage: PipelineStage } | null>(null);
  const [moveOutcome, setMoveOutcome] = useState<'won' | 'lost' | ''>('');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [activityWarningOnly, setActivityWarningOnly] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [healthFilter, setHealthFilter] = useState<HealthState | ''>('');
  const [intentFilter, setIntentFilter] = useState<IntentTier | ''>('');
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const defaultPipelineId = activePipelines[0]?.id ?? '';
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === pipelineId);
  const fixedStageSequence = Boolean(selectedPipeline?.isActive);
  const pendingMoveDeal = pendingMove
    ? deals.find((deal) => deal.id === pendingMove.dealId)
    : undefined;
  const pendingMovePipelineCode = pipelines.find((pipeline) =>
    pipeline.id === (pendingMoveDeal?.pipelineId ?? defaultPipelineId))?.code;
  const stages = useMemo(
    () => pipelineStages.filter((stage) => stage.pipelineId === pipelineId).sort((a, b) => a.stageOrder - b.stageOrder),
    [pipelineStages, pipelineId],
  );
  const boardStages = DEAL_PIPELINE_STAGES.map((template, index) =>
    pipelineStages.find((stage) => stage.pipelineId === (pipelineId || defaultPipelineId) && stage.name === template.name)
    ?? {
      ...template,
      id: `open-stage-${index + 1}`,
      pipelineId: pipelineId || defaultPipelineId,
      stageOrder: index + 1,
    });
  const pipelineDeals = deals.filter((deal) => {
    const dealPipelineId = deal.pipelineId ?? defaultPipelineId;
    return activePipelines.some((pipeline) => pipeline.id === dealPipelineId)
      && (!pipelineId || dealPipelineId === pipelineId);
  });
  useEffect(() => {
    if (pipelineId && !pipelines.some((pipeline) => pipeline.id === pipelineId && pipeline.isActive)) {
      setPipelineId(defaultPipelineId);
    }
  }, [defaultPipelineId, pipelines, pipelineId]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const stageForDeal = (deal: typeof deals[number]) => {
    const dealStages = pipelineStages.filter((stage) => stage.pipelineId === (deal.pipelineId ?? defaultPipelineId))
      .sort((left, right) => left.stageOrder - right.stageOrder);
    return dealStages.find((stage) => stage.name === deal.stage)
    ?? (deal.disposition === 'lost'
      ? dealStages.find((stage) => isLostStage(stage))
      : undefined)
    ?? dealStages.find((stage) => stage.name === legacyStageNames[deal.stage])
    ?? dealStages[0];
  };

  const historyForDeal = (dealId: string) =>
    stageHistory.filter((entry) => entry.dealId === dealId).sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));

  const moveDeal = (dealId: string, target: PipelineStage) => {
    const deal = deals.find((item) => item.id === dealId);
    if (!deal || isTerminalDealStage(deal.stage, deal.disposition, stageForDeal(deal))) return;
    if (isWonStage(target) && !clientQuotations.some((quotation) =>
      quotation.dealId === deal.id && quotation.status === 'Accepted')) {
      window.alert('Issue and accept a client quotation before marking this deal Won.');
      return;
    }
    const current = stageForDeal(deal);
    if (!current || current.id === target.id) return;
    if (requiresCommunicationChannels(target.name) && !hasCompleteCommunicationChannels(deal)) {
      window.alert('Enter a valid phone, WhatsApp number, and Telegram username or number before moving this deal to a quotation or tender stage.');
      return;
    }
    if (requiresCommunicationChannels(target.name)) {
      const client = clients.find((item) => item.id === deal.clientId)
        ?? clients.find((item) => item.name.trim().toLowerCase() === deal.client.trim().toLowerCase());
      if (!client || !hasCompleteClientProfile(client)) {
        window.alert('Complete the company profile before moving this deal to a quotation or tender stage.');
        return;
      }
    }
    const linkedLeadId = leads.find((lead) => lead.id === deal.leadId || lead.dealId === deal.id)?.id;
    const nextActivity = getNextActivity(activities, {
      dealId: deal.id,
      leadId: linkedLeadId ?? deal.leadId,
    });
    const renewalWin = isRenewalPipeline(pipelines.find((pipeline) => pipeline.id === (deal.pipelineId ?? defaultPipelineId))) && isWonStage(target);
    const needsMoveDialog = requiresCommunicationChannels(target.name)
      || target.name.toLowerCase().includes('proposal')
      || target.requiresApproval
      || isLostStage(target)
      || isWonStage(target)
      || renewalWin;
    if (needsMoveDialog || nextActivity.state === 'none') {
      setPendingMove({ dealId, stage: target });
      setMoveOutcome(isWonStage(target) || renewalWin ? 'won' : isLostStage(target) ? 'lost' : '');
      setActivityWarningOnly(!needsMoveDialog);
      setMoveModalOpen(true);
      return;
    }
    applyMove(dealId, current, target);
  };

  const applyMove = (
    dealId: string,
    from: PipelineStage,
    to: PipelineStage,
    details?: string,
    lossReason?: string,
    disposition?: 'won' | 'lost',
  ) => {
    const now = new Date().toISOString();
    const movingDeal = deals.find((deal) => deal.id === dealId);
    if (!movingDeal || isTerminalDealStage(movingDeal.stage, movingDeal.disposition, stageForDeal(movingDeal))) return;
    if ((disposition === 'won' || isWonStage(to)) && !clientQuotations.some((quotation) =>
      quotation.dealId === movingDeal.id && quotation.status === 'Accepted')) {
      window.alert('Issue and accept a client quotation before marking this deal Won.');
      return;
    }
    const progressionErrors = validateDealBaseForProgression(movingDeal, { leads, clients });
    if (progressionErrors.length) {
      window.alert(progressionErrors.join(' '));
      return;
    }
    const linkedLeadId = leads.find((lead) => lead.id === movingDeal.leadId || lead.dealId === movingDeal.id)?.id;
    if (company.requireNextActivityForStageChange && getNextActivity(activities, {
      dealId: movingDeal.id,
      leadId: linkedLeadId ?? movingDeal.leadId,
    }).state === 'none') return;
    const reachesPolicyBound = Boolean(movingDeal && isWonStage(to) && !isWonStage(stageForDeal(movingDeal) ?? movingDeal.stage));
    const boundClient = movingDeal && clients.find((client) => client.name.trim().toLowerCase() === movingDeal.client.trim().toLowerCase());
    const renewalPipeline = pipelines.find((pipeline) => pipeline.isActive && isRenewalPipeline(pipeline));
    const renewalStage = renewalPipeline && pipelineStages
      .filter((stage) => stage.pipelineId === renewalPipeline.id)
      .sort((left, right) => left.stageOrder - right.stageOrder)[0];
    const policyExpiry = movingDeal?.policyExpiry ?? boundClient?.expiry;
    const renewalDealId = movingDeal ? `renewal-for-${movingDeal.id}` : '';

    if (reachesPolicyBound && movingDeal) {
      const invoiceId = `invoice-for-${movingDeal.id}`;
      if (!invoices.some((invoice) => invoice.linkedDealId === movingDeal.id)) {
        const issueDate = new Date().toISOString().slice(0, 10);
        const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        setInvoices([...invoices, {
          id: invoiceId,
          number: AUTH_BYPASS
            ? nextLocalReference('invoice', new Date(issueDate).getFullYear(), invoices.map((invoice) => invoice.number))
            : '',
          ...(AUTH_BYPASS ? {} : { invoiceNumber: '' }),
          clientId: boundClient?.id ?? '',
          clientName: movingDeal.client,
          insurer: movingDeal.insurer,
          policyNo: movingDeal.id,
          issueDate,
          dueDate,
          status: 'Pending',
          items: [{ description: `Premium for ${movingDeal.product}`, qty: 1, unitPrice: movingDeal.value, vatRate: 0 }],
          installments: [{ id: `${invoiceId}-installment`, label: 'Single Payment', due: dueDate, amount: movingDeal.value, paid: false }],
          currency: movingDeal.currency,
          linkedDealId: movingDeal.id,
        }]);
      }
      if (renewalPipeline && renewalStage && policyExpiry && !deals.some((deal) => deal.id === renewalDealId)) {
        const renewalCloseDate = subtractDays(policyExpiry, 90);
        const renewalValue = boundClient?.premium && boundClient.premium > 0
          ? boundClient.premium
          : movingDeal.value;
        const linkedRenewal = linkDealToLead({
          id: renewalDealId,
          pipelineId: renewalPipeline.id,
          createdAt: now,
          stageChangedAt: now,
          renewalForClientId: boundClient?.id ?? movingDeal.clientId,
          renewalForDealId: movingDeal.id,
          renewalExpiry: policyExpiry,
          policyExpiry,
          clientId: boundClient?.id ?? movingDeal.clientId,
          client: movingDeal.client,
          product: movingDeal.product,
          productCode: movingDeal.productCode,
          value: renewalValue,
          weighted: Math.round(renewalValue * renewalStage.winProbabilityPct) / 100,
          currency: movingDeal.currency,
          ...(movingDeal.exchangeRate ? { exchangeRate: movingDeal.exchangeRate } : {}),
          stage: renewalStage.name,
          probability: renewalStage.winProbabilityPct,
          ownerId: movingDeal.ownerId,
          closeDate: renewalCloseDate,
          insurer: movingDeal.insurer,
        }, leads.find((lead) => lead.id === movingDeal.leadId || lead.dealId === movingDeal.id));
        setDeals((current) => current.some((deal) => deal.id === renewalDealId)
          ? current
          : [...current, linkedRenewal.deal]);
        setLeads((current) => current.some((lead) => lead.id === linkedRenewal.lead.id)
          ? current
          : [linkedRenewal.lead, ...current]);
      }
    }
    setStageHistory((current) => {
      const history = [...current];
      const openEntryIndex = history.findIndex((entry) => entry.dealId === dealId && entry.exitedAt === null);
      if (openEntryIndex >= 0) {
        const openEntry = history[openEntryIndex];
        const durationSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(openEntry.enteredAt)) / 1000));
        history[openEntryIndex] = { ...openEntry, exitedAt: now, durationSeconds };
      } else {
        history.push({
          id: makeId(),
          tenantId: TENANT_ID,
          dealId,
          fromStageId: null,
          toStageId: from.id,
          enteredAt: now,
          exitedAt: now,
          durationSeconds: 0,
        });
      }
      const audit: StageHistoryAudit = {
        id: makeId(),
        tenantId: TENANT_ID,
        dealId,
        userId: user.id,
        userName: user.name,
        fromStageId: from.id,
        toStageId: to.id,
        enteredAt: now,
        exitedAt: null,
        durationSeconds: null,
        ...(disposition ? { outcome: disposition } : {}),
        ...(isLostStage(to) ? { outcome: 'lost' as const } : {}),
        ...(lossReason ? { lossReason } : {}),
        ...(details ? { details } : {}),
      };
      return [...history, audit];
    });
    setDeals((current) => current.map((deal) => deal.id === dealId
      ? {
        ...deal,
        pipelineId: movingDeal.pipelineId ?? defaultPipelineId,
        stage: to.name,
        stageChangedAt: now,
        probability: disposition === 'lost' || isLostStage(to) ? 0 : disposition === 'won' ? 100 : to.winProbabilityPct,
        weighted: disposition === 'lost' || isLostStage(to) ? 0 : Math.round(deal.value * (disposition === 'won' ? 100 : to.winProbabilityPct)) / 100,
        disposition,
        ...(isLostStage(to) || disposition === 'lost' ? { lossReason } : {}),
        ...(!(isLostStage(to) || disposition === 'lost') ? { lossReason: undefined } : {}),
        ...(requiresCommunicationChannels(to.name) || to.name.toLowerCase().includes('proposal')
          ? { proposalSummary: details }
          : {}),
        ...(reachesPolicyBound && movingDeal ? {
          linkedInvoiceId: `invoice-for-${movingDeal.id}`,
          renewalDealId: policyExpiry && renewalPipeline && renewalStage ? renewalDealId : undefined,
          policyExpiry,
        } : {}),
      }
      : deal));
    setMoveModalOpen(false);
    setPendingMove(null);
    setMoveOutcome('');
    setActivityWarningOnly(false);
    if (pipelines.find((pipeline) => pipeline.id === (movingDeal.pipelineId ?? defaultPipelineId))?.code.toUpperCase() === 'COMMERCIAL'
      && to.name === 'Quotation / Underwriting'
      && !quotationRequests.some((request) => request.dealId === dealId)) {
      promptQuotationRequestForDeal(dealId);
    }
  };

  const submitGatedMove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingMove) return;
    const deal = deals.find((item) => item.id === pendingMove.dealId);
    if (!deal) return;
    const linkedLeadId = leads.find((lead) => lead.id === deal.leadId || lead.dealId === deal.id)?.id;
    if (company.requireNextActivityForStageChange && getNextActivity(activities, {
      dealId: deal.id,
      leadId: linkedLeadId ?? deal.leadId,
    }).state === 'none') return;
    const current = stageForDeal(deal);
    if (!current) return;
    const data = new FormData(event.currentTarget);
    const wonStage = isWonStage(pendingMove.stage);
    const lostStage = isLostStage(pendingMove.stage);
    const renewalWin = isRenewalPipeline(pipelines.find((pipeline) => pipeline.id === (deal.pipelineId ?? defaultPipelineId))) && wonStage;
    const disposition = wonStage || renewalWin ? 'won' : lostStage ? 'lost' : undefined;
    if ((wonStage || lostStage || renewalWin) && !moveOutcome) return;
    const isLost = disposition === 'lost';
    const lossReason = isLost ? String(data.get('lossReason') ?? '').trim() : undefined;
    if (isLost && !lossReason) return;
    const winReason = disposition === 'won' ? String(data.get('winReason') ?? '').trim() : undefined;
    if (disposition === 'won' && !winReason) return;
    const details = isLost
      ? String(data.get('notes') ?? '').trim()
      : disposition === 'won'
        ? `Win reason: ${winReason}`
        : String(data.get('proposalSummary') ?? '').trim();
    applyMove(deal.id, current, pendingMove.stage, details, lossReason, disposition || undefined);
  };

  const saveStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (fixedStageSequence && !editingStage) return;
    const name = fixedStageSequence && editingStage
      ? editingStage.name
      : String(data.get('name')).trim();
    const winProbabilityPct = Number(data.get('winProbabilityPct'));
    const stagnationDaysThreshold = Number(data.get('stagnationDaysThreshold'));
    if (editingStage) {
      const oldName = editingStage.name;
      setPipelineStages((current) => current.map((stage) => stage.id === editingStage.id
        ? { ...stage, name, winProbabilityPct, stagnationDaysThreshold }
        : stage));
      setDeals((current) => current.map((deal) => deal.pipelineId === pipelineId && deal.stage === oldName
        ? { ...deal, stage: name, probability: winProbabilityPct, weighted: Math.round(deal.value * winProbabilityPct) / 100 }
        : deal));
    } else {
      const stage: PipelineStage = {
        id: makeId(),
        pipelineId,
        name,
        stageOrder: stages.length + 1,
        winProbabilityPct,
        stagnationDaysThreshold,
      };
      setPipelineStages((current) => [...current, stage]);
    }
    setEditingStage(null);
    setStageModalOpen(false);
  };

  const savePipeline = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const template = PIPELINE_TEMPLATES[pipelineTemplateKey] ?? PIPELINE_TEMPLATES.commercialDefault;
    const name = pipelineName.trim();
    const code = pipelineCode.trim().toUpperCase();
    if (!name || !code) {
      setPipelineError('Enter a pipeline name and code.');
      return;
    }
    if (pipelines.some((pipeline) => pipeline.code.toLowerCase() === code.toLowerCase())) {
      setPipelineError('A pipeline with this code already exists. Choose a unique code.');
      return;
    }
    const pipeline: Pipeline = {
      id: makeId(),
      tenantId: TENANT_ID,
      name,
      code,
      isActive: true,
    };
    setPipelines((current) => [...current, pipeline]);
    const newStages: PipelineStage[] = template.stages.map((stage, index) => ({
      id: makeId(),
      pipelineId: pipeline.id,
      name: stage.name,
      shortLabel: stage.shortLabel,
      purpose: stage.purpose,
      stageOrder: index + 1,
      winProbabilityPct: stage.winProbabilityPct,
      stagnationDaysThreshold: stage.stagnationDaysThreshold,
      isClosedWon: stage.isClosedWon,
      isClosedLost: stage.isClosedLost,
      requiresApproval: stage.requiresApproval,
    }));
    setPipelineStages((current) => [...current, ...newStages]);
    setPipelineId(pipeline.id);
    setPipelineError('');
    setPipelineModalOpen(false);
  };

  const openPipelineModal = () => {
    const key = availableTemplateKey(pipelines);
    const template = PIPELINE_TEMPLATES[key];
    setPipelineTemplateKey(key);
    setPipelineName(template.name);
    setPipelineCode(template.code);
    setPipelineError('');
    setPipelineModalOpen(true);
  };

  const changePipelineTemplate = (key: string) => {
    const template = PIPELINE_TEMPLATES[key];
    if (!template) return;
    setPipelineTemplateKey(key);
    setPipelineName(template.name);
    setPipelineCode(template.code);
    setPipelineError('');
  };

  const reorderStage = (stage: PipelineStage, direction: -1 | 1) => {
    if (fixedStageSequence) return;
    const index = stages.findIndex((item) => item.id === stage.id);
    const other = stages[index + direction];
    if (!other) return;
    setPipelineStages((current) => current.map((item) => {
      if (item.id === stage.id) return { ...item, stageOrder: other.stageOrder };
      if (item.id === other.id) return { ...item, stageOrder: stage.stageOrder };
      return item;
    }));
  };

  const deleteStage = (stage: PipelineStage) => {
    if (fixedStageSequence) return;
    const isUsed = pipelineDeals.some((deal) => stageForDeal(deal)?.id === stage.id);
    const isAudited = stageHistory.some((entry) => entry.fromStageId === stage.id || entry.toStageId === stage.id);
    if (isUsed || isAudited) {
      window.alert(isUsed
        ? 'This stage has deals assigned to it. Move those deals before deleting the stage.'
        : 'This stage has audit history. It cannot be deleted so reporting remains intact.');
      return;
    }
    if (!window.confirm(`Delete the "${stage.name}" stage? Its audit history will remain for reporting.`)) return;
    setPipelineStages((current) => current
      .filter((item) => item.id !== stage.id)
      .map((item) => item.pipelineId === pipelineId && item.stageOrder > stage.stageOrder
        ? { ...item, stageOrder: item.stageOrder - 1 }
        : item));
  };

  const stageElapsedDays = (dealId: string, currentStage: PipelineStage) => {
    const currentEntry = historyForDeal(dealId).find((entry) => entry.toStageId === currentStage.id && !entry.exitedAt);
    const deal = deals.find((item) => item.id === dealId);
    if (deal && isTerminalDealStage(deal.stage, deal.disposition, stageForDeal(deal))) return null;
    const enteredAt = currentEntry?.enteredAt
      ?? deal?.stageChangedAt
      ?? deal?.createdAt;
    if (!enteredAt) return null;
    return getStageSlaElapsedDays(enteredAt, now);
  };

  const visibleDealsForStage = (stage: PipelineStage) => pipelineDeals
    .filter((deal) => stageForDeal(deal)?.name === stage.name)
    .filter((deal) => {
      const dealStage = stageForDeal(deal);
      const targetDays = isTerminalDealStage(deal.stage, deal.disposition, dealStage) ? 0 : dealStage?.stagnationDaysThreshold ?? stage.stagnationDaysThreshold;
      const health = dealHealth(dealStage ? stageElapsedDays(deal.id, dealStage) : null, targetDays);
      const intent = intentForDeal(deal);
      return (!healthFilter || health === healthFilter) && (!intentFilter || intent === intentFilter);
    });
  const canDragDeals = user.role === 'admin' || user.role === 'sales';

  const moveTitle = activityWarningOnly
    ? 'Confirm stage change'
    : pendingMove && (isWonStage(pendingMove.stage)
    || (pendingMovePipelineCode?.toLowerCase() === 'renewals' && isWonStage(pendingMove.stage)))
    ? 'Confirm deal outcome'
    : pendingMove && isLostStage(pendingMove.stage)
      ? 'Close deal as lost'
      : 'Proposal readiness';

  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-x-hidden lg:h-[calc(100dvh-3.5rem)] lg:min-h-0 lg:overflow-hidden lg:px-6 lg:pt-2 lg:pb-6">
      <PageToolbar name="pipelines">
          <select className="input !w-auto min-w-48 max-w-64 !py-1.5 !text-xs" value={pipelineId} onChange={(event) => setPipelineId(event.target.value)} aria-label="Select pipeline">
            {activePipelines.length === 0 && <option value="">No active pipelines</option>}
            {activePipelines.length > 0 && <option value="">All pipelines</option>}
            {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
          {user.role === 'admin' && <button className="btn-primary !py-1.5 !text-xs" onClick={openPipelineModal}><Plus size={14} /> New Pipeline</button>}
          {user.role === 'admin' && selectedPipeline && <button className="btn-ghost !py-1.5 !text-xs" onClick={() => setConfigOpen((open) => !open)}><Settings2 size={14} /> {configOpen ? 'Back to Board' : 'Configure Stages'}</button>}
          {activePipelines.length > 0 && !configOpen && <div role="group" className="flex flex-wrap items-center gap-1.5" aria-label="Deal health and intent filters">
            <span className="text-xs text-muted">Health</span>
            {(['Healthy', 'At Risk', 'Rotting'] as const).map((health) => (
              <button
                key={health}
                type="button"
                aria-pressed={healthFilter === health}
                onClick={() => setHealthFilter((current) => current === health ? '' : health)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${healthFilter === health ? healthFilterClasses[health] : 'border-ink-600 text-muted hover:bg-ink-700 hover:text-white'}`}
              >
                {health}
              </button>
            ))}
            <span className="ml-1 text-xs text-muted">Intent</span>
            {(['P1', 'P2', 'P3'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={intentFilter === tier}
                onClick={() => setIntentFilter((current) => current === tier ? '' : tier)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  intentFilter === tier
                    ? 'border-brand-400/50 bg-brand-400/15 text-brand-300'
                    : 'border-ink-600 text-muted hover:bg-ink-700 hover:text-white'
                }`}
              >
                {tier}
              </button>
            ))}
            {(healthFilter || intentFilter) && (
              <button
                type="button"
                className="px-2 py-1 text-[11px] text-muted hover:text-white"
                onClick={() => { setHealthFilter(''); setIntentFilter(''); }}
              >
                Clear
              </button>
            )}
          </div>}
      </PageToolbar>

      <div
        data-page-content="pipelines"
        className={`flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-1 ${configOpen ? 'lg:overflow-y-auto' : 'lg:overflow-hidden'}`}
      >
      {isRenewalPipeline(selectedPipeline) && (
        <div role="status" className="rounded-xl border border-brand-400/30 bg-brand-400/5 px-4 py-3 text-sm text-muted">
          <span className="font-medium text-white">Annual renewal workflow:</span>{' '}
          eligible active policies expiring within the next three months are staged automatically at “Identified”.
          {pipelineDeals.some((deal) => deal.renewalForClientId) && (
            <span> {pipelineDeals.filter((deal) => deal.renewalForClientId).length} renewal record(s) are tracked here.</span>
          )}
        </div>
      )}

      {activePipelines.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <h3 className="font-semibold text-white">No pipelines configured</h3>
          <p className="mt-1 text-sm text-muted">Create a pipeline to add stages and track deals.</p>
        </div>
      ) : selectedPipeline && configOpen && user.role === 'admin' ? (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div><h3 className="font-semibold text-white">Stage Configuration</h3><p className="text-xs text-muted mt-1">{fixedStageSequence ? 'The active pipeline stage names and order are fixed; adjust probability and SLA targets.' : 'Set order, win probability, and deal-rotting thresholds.'}</p></div>
            {!fixedStageSequence && <button className="btn-primary !py-1.5" onClick={() => { setEditingStage(null); setStageModalOpen(true); }}><Plus size={14} /> Add Stage</button>}
          </div>
          <div className="space-y-2">
            {stages.map((stage, index) => (
              <div key={stage.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 bg-ink-900/50 p-3">
                <span className="w-7 text-center text-xs text-muted">{index + 1}</span>
                <div className="min-w-48 flex-1">
                  <div className="text-sm font-medium text-white">{stage.name}</div>
                  <div className="text-xs text-muted">{stage.winProbabilityPct}% win probability · {stage.stagnationDaysThreshold ? `${stage.stagnationDaysThreshold}-day target SLA` : 'No target SLA'}</div>
                </div>
                <div className="flex items-center gap-1">
                  {!fixedStageSequence && <>
                    <button aria-label={`Move ${stage.name} up`} disabled={index === 0} onClick={() => reorderStage(stage, -1)} className="p-2 rounded hover:bg-ink-700 disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button aria-label={`Move ${stage.name} down`} disabled={index === stages.length - 1} onClick={() => reorderStage(stage, 1)} className="p-2 rounded hover:bg-ink-700 disabled:opacity-30"><ArrowDown size={14} /></button>
                  </>}
                  <button onClick={() => { setEditingStage(stage); setStageModalOpen(true); }} className="btn-ghost !px-2 !py-1">Edit</button>
                  {!fixedStageSequence && <button onClick={() => deleteStage(stage)} className="btn-ghost !px-2 !py-1 text-hot">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
        <KanbanBoard
          ariaLabel="Deals by pipeline stage"
          testId="pipelines-board"
          className="lg:min-h-0 lg:flex-1"
        >
          {boardStages.map((stage) => {
            const stageDeals = visibleDealsForStage(stage);
            const totalMvr = stageDeals.reduce((total, deal) =>
              total + toMvr(deal.value, deal.currency, deal.exchangeRate), 0);
            return <KanbanColumn
              key={stage.id}
              name={stage.name}
              count={stageDeals.length}
              emptyLabel="deals"
              summary={`${formatAmount(totalMvr, 'MVR')} - ${stageDeals.length} ${stageDeals.length === 1 ? 'deal' : 'deals'}`}
              testId="pipelines-board-column"
              headerTestId="pipelines-stage-header"
              bodyTestId="pipelines-column-body"
              onDragOver={(event) => {
                  if (canDragDeals) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }
                }}
              onDrop={(event) => {
                  if (!canDragDeals) return;
                  event.preventDefault();
                  const deal = pipelineDeals.find((item) => item.id === event.dataTransfer.getData('text/deal-id'));
                  const targetPipelineId = deal?.pipelineId ?? defaultPipelineId;
                  const target = deal && pipelineStages.find((item) =>
                    item.pipelineId === targetPipelineId && item.name === stage.name);
                  if (target) moveDeal(deal.id, target);
                }}
            >
              {stageDeals.map((deal) => {
                    const dealStage = stageForDeal(deal);
                    const pipelineName = pipelineShortLabel(pipelines.find((pipeline) =>
                      pipeline.id === (deal.pipelineId ?? defaultPipelineId)));
                    const displayDate = deal.renewalExpiry ?? deal.closeDate;
                    const formattedAmount = formatAmount(deal.value, deal.currency);
                    const canDragDeal = canDragDeals && !isTerminalDealStage(deal.stage, deal.disposition, dealStage);
                    const ownerName = users.find((person) => person.id === deal.ownerId)?.name
                      ?? formatStaffIdentifier(deal.ownerId);
                    const linkedLeadId = leads.find((lead) => lead.id === deal.leadId || lead.dealId === deal.id)?.id;
                    const activity = getNextActivity(activities, { dealId: deal.id, leadId: linkedLeadId ?? deal.leadId });
                    const terminal = isTerminalDealStage(deal.stage, deal.disposition, dealStage);
                    const status = !terminal ? 'OPEN'
                      : isWonStage(dealStage ?? deal.stage) ? 'WON'
                        : deal.disposition === 'lost' || isLostStage(dealStage ?? deal.stage) ? 'LOST' : 'CLOSED';
                    const productCode = deal.productCode ?? deal.product;
                    const dealTitle = leads.find((lead) => lead.id === deal.leadId || lead.dealId === deal.id)?.title
                      ?? deal.proposalSummary
                      ?? `${deal.product} placement`;
                    const statusTone = status === 'OPEN' ? 'blue' : status === 'WON' ? 'green' : 'red';
                    return <KanbanCard
                      key={deal.id}
                      testId="pipeline-deal-card"
                      titleTestId="pipeline-deal-card-title"
                      metaTestId="pipeline-deal-card-subtitle"
                      pillsTestId="pipeline-deal-card-badges"
                      footerTestId="pipeline-deal-card-value"
                      dataAttributes={{
                        'data-deal-id': deal.id,
                        'data-deal-value-mvr': toMvr(deal.value, deal.currency, deal.exchangeRate),
                      }}
                      ariaLabel={`Open deal ${dealTitle}`}
                      pills={[
                        <KanbanPill tone={statusTone}>{status}</KanbanPill>,
                        <KanbanPill tone="muted">{productCode}</KanbanPill>,
                      ]}
                      meta={deal.client}
                      metaTitle={`${deal.client} · ${pipelineName}`}
                      title={dealTitle}
                      titleTitle={dealTitle}
                      footerLeft={<span className="inline-flex min-w-0 items-center gap-1" title={formatDate(displayDate)}><CalendarDays size={13} aria-hidden="true" /><span className="truncate">{formatShortDate(displayDate)}</span></span>}
                      footerRight={<span title={formattedAmount}>{formattedAmount}</span>}
                      avatar={{ initials: avatarCode(ownerName), label: ownerName }}
                      activity={{ state: activity.state, label: activity.title ?? (activity.date ? formatDate(activity.date) : 'No activity scheduled') }}
                      draggable={canDragDeal}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/deal-id', deal.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onActivate={() => {
                        window.location.hash = dashboardHref('deals', { id: deal.id, view: 'inspection' });
                      }}
                    />;
                  })}
              </KanbanColumn>;
          })}
        </KanbanBoard>
        </>
      )}
      </div>

      <Modal open={stageModalOpen} onClose={() => { setStageModalOpen(false); setEditingStage(null); }} title={editingStage ? 'Edit Pipeline Stage' : 'Add Pipeline Stage'} subtitle={selectedPipeline?.name} size="sm" footer={<><button className="btn-ghost" onClick={() => { setStageModalOpen(false); setEditingStage(null); }}>Cancel</button><button type="submit" form="pipeline-stage-form" className="btn-primary"><Check size={14} /> Save Stage</button></>}>
        <form id="pipeline-stage-form" onSubmit={saveStage} className="space-y-3">
          <Field label="Stage name"><input className="input" name="name" defaultValue={editingStage?.name ?? ''} readOnly={fixedStageSequence} required /></Field>
          <Field label="Win probability (%)"><input className="input" name="winProbabilityPct" type="number" min="0" max="100" step="1" defaultValue={editingStage?.winProbabilityPct ?? ''} required /></Field>
          <Field label="Target stage duration / SLA (days)"><input className="input" name="stagnationDaysThreshold" type="number" min="0" step="1" defaultValue={editingStage?.stagnationDaysThreshold ?? ''} required /></Field>
        </form>
      </Modal>
      <Modal open={pipelineModalOpen} onClose={() => { setPipelineModalOpen(false); setPipelineError(''); }} title="Create Pipeline" subtitle="Choose a business-line template, then adjust its stage configuration." size="sm" footer={<><button type="button" className="btn-ghost" onClick={() => { setPipelineModalOpen(false); setPipelineError(''); }}>Cancel</button><button type="submit" form="new-pipeline-form" className="btn-primary"><Plus size={14} /> Create Pipeline</button></>}>
        <form id="new-pipeline-form" onSubmit={savePipeline} className="space-y-3">
          <Field label="Business line template">
            <select className="input" value={pipelineTemplateKey} onChange={(event) => changePipelineTemplate(event.target.value)}>
              {Object.entries(PIPELINE_TEMPLATES).map(([key, template]) => <option key={key} value={key}>{template.name}</option>)}
            </select>
          </Field>
          <Field label="Pipeline name"><input className="input" value={pipelineName} onChange={(event) => setPipelineName(event.target.value)} required /></Field>
          <Field label="Code"><input className="input" value={pipelineCode} onChange={(event) => setPipelineCode(event.target.value)} required /></Field>
          <div className="rounded-lg border border-ink-600 bg-ink-900/50 p-3">
            <div className="mb-2 text-xs font-medium text-muted">Stages created from this template</div>
            <ol className="space-y-1 text-xs text-muted">
              {PIPELINE_TEMPLATES[pipelineTemplateKey].stages.map((stage, index) => (
                <li key={stage.name}>{index + 1}. {stage.name} · {stage.winProbabilityPct}%</li>
              ))}
            </ol>
          </div>
          {pipelineError && <p role="alert" className="text-sm text-hot">{pipelineError}</p>}
        </form>
      </Modal>

      <Modal
        open={moveModalOpen}
        onClose={() => { setMoveModalOpen(false); setPendingMove(null); setMoveOutcome(''); setActivityWarningOnly(false); }}
        title={moveTitle}
        subtitle={pendingMove ? `${deals.find((deal) => deal.id === pendingMove.dealId)?.client} → ${pendingMove.stage.name}` : undefined}
        size="md"
        footer={<>
          <button type="button" className="btn-ghost" onClick={() => { setMoveModalOpen(false); setPendingMove(null); setMoveOutcome(''); setActivityWarningOnly(false); }}>Cancel</button>
          <button type="submit" form="stage-gate-form" className="btn-primary" disabled={Boolean(company.requireNextActivityForStageChange && pendingMoveDeal
            && getNextActivity(activities, {
              dealId: pendingMoveDeal.id,
              leadId: leads.find((lead) => lead.id === pendingMoveDeal.leadId || lead.dealId === pendingMoveDeal.id)?.id ?? pendingMoveDeal.leadId,
            }).state === 'none')}>
            <Check size={14} /> {activityWarningOnly && !company.requireNextActivityForStageChange
              ? 'Continue without activity'
              : moveOutcome === 'won' ? 'Confirm Won' : moveOutcome === 'lost' ? 'Confirm Lost' : 'Confirm Stage'}
          </button>
        </>}
      >
        <form id="stage-gate-form" onSubmit={submitGatedMove} className="space-y-3">
          {pendingMoveDeal && getNextActivity(activities, {
            dealId: pendingMoveDeal.id,
            leadId: leads.find((lead) => lead.id === pendingMoveDeal.leadId || lead.dealId === pendingMoveDeal.id)?.id ?? pendingMoveDeal.leadId,
          }).state === 'none' && <p role="status" className="rounded-lg border border-warm/30 bg-warm/5 p-3 text-xs text-warm">
            <Clock3 size={13} className="mr-1 inline" />No next activity is scheduled. {company.requireNextActivityForStageChange
              ? 'Settings require a scheduled activity before this change. Open the deal details to schedule one.'
              : 'You can schedule one now from the deal details or continue without one.'}
          </p>}
          {pendingMove && (isWonStage(pendingMove.stage)
            || (pendingMovePipelineCode?.toLowerCase() === 'renewals' && isWonStage(pendingMove.stage))) && <>
            <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">
              Confirm that the policy is bound. Proceed with invoicing and active-sales follow-up.
            </p>
            <Field label="Win reason (required)"><textarea className="input min-h-20" name="winReason" required maxLength={2000} placeholder="Record why the client selected this placement." /></Field>
          </>}
          {pendingMove && pendingMovePipelineCode?.toLowerCase() === 'renewals' && isWonStage(pendingMove.stage) && (
            <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">
              Confirm the policy renewal. It will remain in the Annual Renewals pipeline as Won; proceed with invoicing and active sales follow-up.
            </p>
          )}
          {!activityWarningOnly && pendingMove && isLostStage(pendingMove.stage) ? (
            <>
              <Field label="Loss reason (required)"><select className="input" name="lossReason" required defaultValue=""><option value="" disabled>Select a reason</option>{getPipelineLossReasons(pendingMovePipelineCode).map((reason) => <option key={reason}>{reason}</option>)}</select></Field>
              <Field label="Additional notes"><textarea className="input min-h-20" name="notes" /></Field>
            </>
          ) : !activityWarningOnly && pendingMove
            && !isWonStage(pendingMove.stage)
            && !(pendingMovePipelineCode?.toLowerCase() === 'renewals' && isWonStage(pendingMove.stage)) ? (
            <>
              <p className="text-sm text-muted">Capture the proposal details before moving this deal forward.</p>
              <Field label="Proposal summary (required)"><textarea className="input min-h-24" name="proposalSummary" required placeholder="Coverage, premium, and decision context" /></Field>
            </>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="mb-1.5 text-xs text-muted">{label}</div>{children}</label>;
}
