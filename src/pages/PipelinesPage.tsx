import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, Settings2, Zap } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { TENANT_ID } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import type { Client, Deal, Pipeline, PipelineStage, StageHistoryAudit } from '../types';
import { formatAmount, toMvr } from '../utils/currency';

const LOSS_REASONS = [
  'Price / premium',
  'Competitor selected',
  'Coverage not suitable',
  'Client withdrew',
  'Underwriting declined',
  'Other',
];

const legacyStageNames: Record<string, string> = {
  'Lead Identified': 'Fact-Finding & Risk Survey',
  'Contact Made': 'Market Placement / Outender',
  'Key Person Identified': 'Market Placement / Outender',
  Quoted: 'Quote Comparison & Presentation',
  'Internal Slip': 'Underwriter Negotiation',
  'Closed-Won': 'Policy Bound / won',
  'Closed-Lost': 'Lost / Declined',
  'Policy Bound / won , Lost / Declined': 'Policy Bound / won',
  'Market Placement / Tender': 'Market Placement / Outender',
  'Qualified (Discovery)': 'Fact-Finding & Risk Survey',
  'Solution Alignment': 'Market Placement / Outender',
  'Solution Alignment (Demo/Quote Request)': 'Market Placement / Outender',
  'Proposal / Business Case': 'Quote Comparison & Presentation',
  'Quote Comparison Presented': 'Quote Comparison & Presentation',
  'Negotiation & Legal': 'Underwriter Negotiation',
  'Negotiation & Legal (MIRA Compliance)': 'Underwriter Negotiation',
};

interface PipelineTemplateStage {
  name: string;
  winProbabilityPct: number;
  stagnationDaysThreshold: number;
}

interface PipelineTemplate {
  code: string;
  name: string;
  stages: PipelineTemplateStage[];
}

const PIPELINE_TEMPLATES: Record<string, PipelineTemplate> = {
  commercialDefault: {
    code: 'COMMERCIAL',
    name: 'Commercial Brokerage',
    stages: [
      { name: 'Fact-Finding & Risk Survey', winProbabilityPct: 20, stagnationDaysThreshold: 30 },
      { name: 'Market Placement / Outender', winProbabilityPct: 40, stagnationDaysThreshold: 30 },
      { name: 'Quote Comparison & Presentation', winProbabilityPct: 60, stagnationDaysThreshold: 14 },
      { name: 'Underwriter Negotiation', winProbabilityPct: 80, stagnationDaysThreshold: 14 },
      { name: 'Policy Bound / won', winProbabilityPct: 100, stagnationDaysThreshold: 0 },
      { name: 'Lost / Declined', winProbabilityPct: 0, stagnationDaysThreshold: 0 },
    ],
  },
  commercialLargeAccounts: {
    code: 'COMMERCIAL-LARGE',
    name: 'Commercial Property & Marine (Large Accounts)',
    stages: [
      { name: 'Fact-Finding & Risk Survey', winProbabilityPct: 20, stagnationDaysThreshold: 30 },
      { name: 'Market Placement / Outender', winProbabilityPct: 40, stagnationDaysThreshold: 30 },
      { name: 'Quote Comparison & Presentation', winProbabilityPct: 60, stagnationDaysThreshold: 14 },
      { name: 'Underwriter Negotiation', winProbabilityPct: 80, stagnationDaysThreshold: 14 },
      { name: 'Policy Bound / won', winProbabilityPct: 100, stagnationDaysThreshold: 0 },
      { name: 'Lost / Declined', winProbabilityPct: 0, stagnationDaysThreshold: 0 },
    ],
  },
  retailPersonal: {
    code: 'RETAIL',
    name: 'Retail & Personal Lines',
    stages: [
      { name: 'Inbound Lead', winProbabilityPct: 20, stagnationDaysThreshold: 2 },
      { name: 'Automated Quote Issued', winProbabilityPct: 45, stagnationDaysThreshold: 2 },
      { name: 'Payment Collection', winProbabilityPct: 75, stagnationDaysThreshold: 7 },
      { name: 'Policy Issued', winProbabilityPct: 100, stagnationDaysThreshold: 0 },
    ],
  },
  annualRenewals: {
    code: 'RENEWALS',
    name: 'Annual Renewals',
    stages: [
      { name: 'Renewal Audit (90d out)', winProbabilityPct: 20, stagnationDaysThreshold: 14 },
      { name: 'Expiring Loss Run Review', winProbabilityPct: 40, stagnationDaysThreshold: 14 },
      { name: 'Market Re-tender', winProbabilityPct: 60, stagnationDaysThreshold: 30 },
      { name: 'Client Renewal Sign-off', winProbabilityPct: 80, stagnationDaysThreshold: 14 },
      { name: 'Renewed', winProbabilityPct: 100, stagnationDaysThreshold: 0 },
    ],
  },
  claims: {
    code: 'CLAIMS',
    name: 'Claims',
    stages: [
      { name: 'Claim Notified', winProbabilityPct: 20, stagnationDaysThreshold: 7 },
      { name: 'Surveyor Assigned', winProbabilityPct: 40, stagnationDaysThreshold: 14 },
      { name: 'Adjuster Assessment', winProbabilityPct: 60, stagnationDaysThreshold: 30 },
      { name: 'Underwriter Settlement', winProbabilityPct: 80, stagnationDaysThreshold: 30 },
      { name: 'Cheque Dispatched', winProbabilityPct: 100, stagnationDaysThreshold: 0 },
    ],
  },
};

function availableTemplateKey(pipelines: Pipeline[]) {
  return Object.entries(PIPELINE_TEMPLATES)
    .find(([, template]) => !pipelines.some((pipeline) => pipeline.code.toLowerCase() === template.code.toLowerCase()))?.[0]
    ?? 'commercialDefault';
}

function isLostStage(name: string) {
  const normalized = name.toLowerCase();
  return normalized.includes('lost') || normalized.includes('declined');
}

function isWonStage(name: string) {
  const normalized = name.toLowerCase();
  return normalized.includes('policy bound') || normalized === 'closed-won';
}

function isRenewalPipeline(pipeline?: Pipeline) {
  return pipeline?.code.toLowerCase() === 'renewals';
}

function renewalHorizonDate(from: Date) {
  const targetMonth = new Date(from.getFullYear(), from.getMonth() + 3, 1);
  const targetLastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(from.getDate(), targetLastDay));
  return targetMonth;
}

function buildRenewalDeal(client: Client, pipeline: Pipeline, firstStage: PipelineStage, today: Date): Deal {
  const expiry = client.expiry;
  const value = client.premium;
  return {
    id: `renewal-${crypto.randomUUID()}`,
    pipelineId: pipeline.id,
    createdAt: today.toISOString(),
    renewalForClientId: client.id,
    renewalExpiry: expiry,
    client: client.name,
    product: client.productCode || client.class || 'Insurance renewal',
    value,
    weighted: Math.round(value * firstStage.winProbabilityPct) / 100,
    currency: 'MVR',
    stage: firstStage.name,
    probability: firstStage.winProbabilityPct,
    ownerId: client.ownerId,
    closeDate: expiry,
    insurer: client.insurer || 'Not assigned',
  };
}

type HealthState = 'Healthy' | 'At Risk' | 'Rotting';
type MomentumState = 'Surging' | 'Steady' | 'Stalling' | 'Rotting';
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

function dealMomentum(elapsed: number | null, threshold: number): MomentumState {
  if (elapsed === null) return 'Steady';
  if (threshold <= 0) return elapsed <= 1 ? 'Surging' : 'Steady';
  if (elapsed >= threshold) return 'Rotting';
  if (elapsed >= threshold * 0.7) return 'Stalling';
  if (elapsed >= threshold * 0.4) return 'Steady';
  return 'Surging';
}

function dealHealthScore(elapsed: number | null, threshold: number, probability: number) {
  const probabilityScore = Math.min(100, Math.max(0, probability));
  const freshnessScore = threshold <= 0
    ? 100
    : elapsed === null
      ? 50
      : Math.min(100, Math.max(0, 100 * (1 - elapsed / threshold)));
  return Math.round(probabilityScore * 0.65 + freshnessScore * 0.35);
}

const momentumVariants: Record<MomentumState, 'win' | 'muted' | 'warm' | 'hot'> = {
  Surging: 'win',
  Steady: 'muted',
  Stalling: 'warm',
  Rotting: 'hot',
};

const healthVariants: Record<HealthState, 'win' | 'warm' | 'hot'> = {
  Healthy: 'win',
  'At Risk': 'warm',
  Rotting: 'hot',
};

const healthFilterClasses: Record<HealthState, string> = {
  Healthy: 'bg-win/15 text-win border-win/40',
  'At Risk': 'bg-warm/15 text-warm border-warm/40',
  Rotting: 'bg-hot/15 text-hot border-hot/40',
};

const intentLabels: Record<IntentTier, string> = {
  P1: 'Ready to Buy',
  P2: 'Evaluating',
  P3: 'Nurture',
};

const intentVariants: Record<IntentTier, 'win' | 'brand' | 'muted'> = {
  P1: 'win',
  P2: 'brand',
  P3: 'muted',
};

function makeId() {
  return crypto.randomUUID();
}

export default function PipelinesPage() {
  const {
    user, deals, setDeals, clients, pipelines, setPipelines, pipelineStages, setPipelineStages,
    stageHistory, setStageHistory,
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
  const [now, setNow] = useState(Date.now());
  const [healthFilter, setHealthFilter] = useState<HealthState | ''>('');
  const [intentFilter, setIntentFilter] = useState<IntentTier | ''>('');
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === pipelineId);
  const stages = useMemo(
    () => pipelineStages.filter((stage) => stage.pipelineId === pipelineId).sort((a, b) => a.stageOrder - b.stageOrder),
    [pipelineStages, pipelineId],
  );
  const pipelineDeals = deals.filter((deal) => deal.pipelineId
    ? deal.pipelineId === pipelineId
    : pipelineId === pipelines.find((pipeline) => pipeline.isActive)?.id);
  useEffect(() => {
    if (!pipelines.some((pipeline) => pipeline.id === pipelineId && pipeline.isActive)) {
      setPipelineId(pipelines.find((pipeline) => pipeline.isActive)?.id ?? '');
    }
  }, [pipelines, pipelineId]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const renewalPipeline = pipelines.find((pipeline) => pipeline.isActive && isRenewalPipeline(pipeline));
    const firstStage = renewalPipeline
      && pipelineStages.filter((stage) => stage.pipelineId === renewalPipeline.id).sort((a, b) => a.stageOrder - b.stageOrder)[0];
    if (!renewalPipeline || !firstStage) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = renewalHorizonDate(today);
    const upcomingRenewals = clients.filter((client) => {
      if (!client.expiry || client.accountStatus === 'draft') return false;
      const expiry = new Date(client.expiry.length === 10 ? `${client.expiry}T00:00:00` : client.expiry);
      return Number.isFinite(expiry.getTime())
        && expiry >= today
        && expiry <= horizon
        && !deals.some((deal) => deal.renewalForClientId === client.id && deal.renewalExpiry === client.expiry);
    });
    if (upcomingRenewals.length) {
      setDeals((current) => {
        const knownRenewals = new Set(current
          .filter((deal) => deal.renewalForClientId)
          .map((deal) => `${deal.renewalForClientId}:${deal.renewalExpiry}`));
        const additions = upcomingRenewals
          .filter((client) => !knownRenewals.has(`${client.id}:${client.expiry}`))
          .map((client) => buildRenewalDeal(client, renewalPipeline, firstStage, today));
        return additions.length ? [...additions, ...current] : current;
      });
    }
  }, [clients, deals, pipelines, pipelineStages, setDeals]);

  const stageForDeal = (deal: typeof deals[number]) =>
    stages.find((stage) => stage.name === deal.stage)
    ?? (deal.stage === 'Policy Bound / won , Lost / Declined' && deal.disposition === 'lost'
      ? stages.find((stage) => isLostStage(stage.name))
      : undefined)
    ?? stages.find((stage) => stage.name === legacyStageNames[deal.stage])
    ?? stages[0];

  const historyForDeal = (dealId: string) =>
    stageHistory.filter((entry) => entry.dealId === dealId).sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));

  const moveDeal = (dealId: string, target: PipelineStage) => {
    const deal = deals.find((item) => item.id === dealId);
    if (!deal) return;
    const current = stageForDeal(deal);
    if (!current || current.id === target.id) return;
    const renewalWin = isRenewalPipeline(selectedPipeline) && target.name.toLowerCase().includes('renewed');
    if (target.name.toLowerCase().includes('proposal')
      || target.name === 'Quote Comparison & Presentation'
      || isLostStage(target.name)
      || isWonStage(target.name)
      || renewalWin) {
      setPendingMove({ dealId, stage: target });
      setMoveOutcome(isWonStage(target.name) || renewalWin ? 'won' : isLostStage(target.name) ? 'lost' : '');
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
        fromStageId: from.id,
        toStageId: to.id,
        enteredAt: now,
        exitedAt: null,
        durationSeconds: null,
        ...(disposition ? { outcome: disposition } : {}),
        ...(isLostStage(to.name) ? { outcome: 'lost' as const } : {}),
        ...(lossReason ? { lossReason } : {}),
        ...(details ? { details } : {}),
      };
      return [...history, audit];
    });
    setDeals((current) => current.map((deal) => deal.id === dealId
      ? {
        ...deal,
        pipelineId,
        stage: to.name,
        probability: disposition === 'lost' || isLostStage(to.name) ? 0 : disposition === 'won' ? 100 : to.winProbabilityPct,
        weighted: disposition === 'lost' || isLostStage(to.name) ? 0 : Math.round(deal.value * (disposition === 'won' ? 100 : to.winProbabilityPct)) / 100,
        disposition,
        ...(isLostStage(to.name) || disposition === 'lost' ? { lossReason } : {}),
        ...(!(isLostStage(to.name) || disposition === 'lost') ? { lossReason: undefined } : {}),
        ...(to.name.toLowerCase().includes('proposal') || to.name === 'Quote Comparison & Presentation'
          ? { proposalSummary: details }
          : {}),
      }
      : deal));
    setMoveModalOpen(false);
    setPendingMove(null);
    setMoveOutcome('');
  };

  const submitGatedMove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingMove) return;
    const deal = deals.find((item) => item.id === pendingMove.dealId);
    if (!deal) return;
    const current = stageForDeal(deal);
    if (!current) return;
    const data = new FormData(event.currentTarget);
    const wonStage = isWonStage(pendingMove.stage.name);
    const lostStage = isLostStage(pendingMove.stage.name);
    const renewalWin = isRenewalPipeline(selectedPipeline) && pendingMove.stage.name.toLowerCase().includes('renewed');
    const disposition = wonStage || renewalWin ? 'won' : lostStage ? 'lost' : undefined;
    if ((wonStage || lostStage || renewalWin) && !moveOutcome) return;
    const isLost = disposition === 'lost';
    const lossReason = isLost ? String(data.get('lossReason') ?? '').trim() : undefined;
    if (isLost && !lossReason) return;
    const details = isLost
      ? String(data.get('notes') ?? '').trim()
      : String(data.get('proposalSummary') ?? '').trim();
    applyMove(deal.id, current, pendingMove.stage, details, lossReason, disposition || undefined);
  };

  const saveStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
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
      stageOrder: index + 1,
      winProbabilityPct: stage.winProbabilityPct,
      stagnationDaysThreshold: stage.stagnationDaysThreshold,
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
    const enteredAt = currentEntry?.enteredAt
      ?? deals.find((deal) => deal.id === dealId)?.createdAt;
    if (!enteredAt) return null;
    const enteredAtTime = Date.parse(enteredAt);
    if (!Number.isFinite(enteredAtTime)) return null;
    return Math.max(0, Math.floor((now - enteredAtTime) / 86400000));
  };

  const visibleDealsForStage = (stage: PipelineStage) => pipelineDeals
    .filter((deal) => stageForDeal(deal)?.id === stage.id)
    .filter((deal) => {
      const health = dealHealth(stageElapsedDays(deal.id, stage), stage.stagnationDaysThreshold);
      const intent = intentForDeal(deal);
      return (!healthFilter || health === healthFilter) && (!intentFilter || intent === intentFilter);
    });

  const moveTitle = pendingMove && (isWonStage(pendingMove.stage.name)
    || (isRenewalPipeline(selectedPipeline) && pendingMove.stage.name.toLowerCase().includes('renewed')))
    ? 'Confirm deal outcome'
    : pendingMove && isLostStage(pendingMove.stage.name)
      ? 'Close deal as lost'
      : 'Proposal readiness';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Insurance Pipelines</h2>
          <p className="text-sm text-muted mt-1">Move opportunities through configured insurance stages.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto min-w-64" value={pipelineId} onChange={(event) => setPipelineId(event.target.value)} aria-label="Select pipeline">
            {pipelines.filter((pipeline) => pipeline.isActive).length === 0 && <option value="">No active pipelines</option>}
            {pipelines.filter((pipeline) => pipeline.isActive).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
          {user.role === 'admin' && <button className="btn-primary" onClick={openPipelineModal}><Plus size={15} /> New Pipeline</button>}
          {user.role === 'admin' && <button className="btn-ghost" onClick={() => setConfigOpen((open) => !open)}><Settings2 size={15} /> {configOpen ? 'Back to Board' : 'Configure Stages'}</button>}
        </div>
      </div>

      {isRenewalPipeline(selectedPipeline) && (
        <div role="status" className="rounded-xl border border-brand-400/30 bg-brand-400/5 px-4 py-3 text-sm text-muted">
          <span className="font-medium text-white">Annual renewal workflow:</span>{' '}
          eligible active policies expiring within the next three months are staged automatically at “Renewal Audit (90d out)”.
          {pipelineDeals.some((deal) => deal.renewalForClientId) && (
            <span> {pipelineDeals.filter((deal) => deal.renewalForClientId).length} renewal record(s) are tracked here.</span>
          )}
        </div>
      )}

      {!selectedPipeline ? (
        <div className="glass rounded-2xl p-8 text-center">
          <h3 className="font-semibold text-white">No pipelines configured</h3>
          <p className="mt-1 text-sm text-muted">Create a pipeline to add stages and track deals.</p>
        </div>
      ) : configOpen && user.role === 'admin' ? (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div><h3 className="font-semibold text-white">Stage Configuration</h3><p className="text-xs text-muted mt-1">Set order, win probability, and deal-rotting thresholds.</p></div>
            <button className="btn-primary !py-1.5" onClick={() => { setEditingStage(null); setStageModalOpen(true); }}><Plus size={14} /> Add Stage</button>
          </div>
          <div className="space-y-2">
            {stages.map((stage, index) => (
              <div key={stage.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 bg-ink-900/50 p-3">
                <span className="w-7 text-center text-xs text-muted">{index + 1}</span>
                <div className="min-w-48 flex-1">
                  <div className="text-sm font-medium text-white">{stage.name}</div>
                  <div className="text-xs text-muted">{stage.winProbabilityPct}% win probability · {stage.stagnationDaysThreshold ? `${stage.stagnationDaysThreshold} day rotting alert` : 'No rotting alert'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button aria-label={`Move ${stage.name} up`} disabled={index === 0} onClick={() => reorderStage(stage, -1)} className="p-2 rounded hover:bg-ink-700 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button aria-label={`Move ${stage.name} down`} disabled={index === stages.length - 1} onClick={() => reorderStage(stage, 1)} className="p-2 rounded hover:bg-ink-700 disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button onClick={() => { setEditingStage(stage); setStageModalOpen(true); }} className="btn-ghost !px-2 !py-1">Edit</button>
                  <button onClick={() => deleteStage(stage)} className="btn-ghost !px-2 !py-1 text-hot">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          <div role="group" className="flex flex-wrap items-center gap-2" aria-label="Deal health and intent filters">
            <span className="text-xs text-muted">Health</span>
            {(['Healthy', 'At Risk', 'Rotting'] as const).map((health) => (
              <button
                key={health}
                type="button"
                aria-pressed={healthFilter === health}
                onClick={() => setHealthFilter((current) => current === health ? '' : health)}
                className={`rounded-full border px-3 py-1 text-xs transition ${healthFilter === health ? healthFilterClasses[health] : 'border-ink-600 text-muted hover:bg-ink-700 hover:text-white'}`}
              >
                {health}
              </button>
            ))}
            <span className="ml-2 text-xs text-muted">Intent</span>
            {(['P1', 'P2', 'P3'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={intentFilter === tier}
                onClick={() => setIntentFilter((current) => current === tier ? '' : tier)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
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
                className="px-2 py-1 text-xs text-muted hover:text-white"
                onClick={() => { setHealthFilter(''); setIntentFilter(''); }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3">
          {stages.map((stage) => {
            const stageDeals = visibleDealsForStage(stage);
            return (
              <section key={stage.id} className="w-72 shrink-0 rounded-xl bg-ink-900/50 p-2">
                <div className="flex items-start justify-between gap-2 px-2 py-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{stage.name}</h3>
                    <div className="text-[11px] text-muted">{stage.winProbabilityPct}% win · {stageDeals.length} deal{stageDeals.length === 1 ? '' : 's'}</div>
                  </div>
                  <Badge variant="muted">{stageDeals.length}</Badge>
                </div>
                <div className="space-y-2 min-h-32">
                  {stageDeals.map((deal) => {
                    const elapsed = stageElapsedDays(deal.id, stage);
                    const health = dealHealth(elapsed, stage.stagnationDaysThreshold);
                    const momentum = dealMomentum(elapsed, stage.stagnationDaysThreshold);
                    const intent = intentForDeal(deal);
                    const score = dealHealthScore(elapsed, stage.stagnationDaysThreshold, deal.probability);
                    const recentHistory = historyForDeal(deal.id)[0];
                    return (
                      <article key={deal.id} className={`rounded-xl border bg-ink-800/80 p-3 ${health === 'Rotting' ? 'border-hot/70 shadow-[0_0_0_1px_rgba(255,70,70,0.15)]' : health === 'At Risk' ? 'border-warm/60' : 'border-ink-600'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 text-sm font-semibold text-white">{deal.client}</div>
                          <div
                            className={`shrink-0 flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              score >= 75 ? 'border-win/40 bg-win/10 text-win' : score >= 45 ? 'border-warm/40 bg-warm/10 text-warm' : 'border-hot/40 bg-hot/10 text-hot'
                            }`}
                            title="Rule-based health estimate from win probability and stage-age threshold; not an AI-generated prediction."
                            aria-label={`Estimated deal health score ${score} out of 100`}
                          >
                            <Zap size={11} /> {score}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted">{deal.product} · {deal.insurer}</div>
                        {deal.renewalExpiry && <div className="mt-1 text-[11px] text-warm">Renewal due {new Date(`${deal.renewalExpiry}T00:00:00`).toLocaleDateString('en-US')}</div>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant={momentumVariants[momentum]} dot>{momentum}</Badge>
                          <Badge variant={intentVariants[intent]}>{intent}: {intentLabels[intent]}</Badge>
                          <Badge variant={healthVariants[health]}>{health === 'At Risk' ? 'At Risk' : health}</Badge>
                        </div>
                        <div className="mt-3 flex justify-between text-xs">
                          <span className="text-white">{formatAmount(deal.value, deal.currency)}</span>
                          {deal.currency === 'USD' && <span className="text-muted">{formatAmount(toMvr(deal.value, deal.currency, deal.exchangeRate), 'MVR')}</span>}
                          <span className="text-brand-400">{deal.probability}%</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                          <span>{elapsed === null ? 'Stage age unavailable' : `${elapsed} day${elapsed === 1 ? '' : 's'} in stage`}</span>
                          {recentHistory?.lossReason && <span className="text-hot">{recentHistory.lossReason}</span>}
                        </div>
                        <label className="block mt-3">
                          <span className="sr-only">Move {deal.client} to stage</span>
                          <select className="input !py-1.5 !text-xs" value={stage.id} onChange={(event) => {
                            const target = stages.find((item) => item.id === event.target.value);
                            if (target) moveDeal(deal.id, target);
                          }}>
                            {stages.map((item) => <option key={item.id} value={item.id}>Move to: {item.name}</option>)}
                          </select>
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
          </div>
        </div>
        </>
      )}

      <Modal open={stageModalOpen} onClose={() => { setStageModalOpen(false); setEditingStage(null); }} title={editingStage ? 'Edit Pipeline Stage' : 'Add Pipeline Stage'} subtitle={selectedPipeline?.name} size="sm" footer={<><button className="btn-ghost" onClick={() => { setStageModalOpen(false); setEditingStage(null); }}>Cancel</button><button type="submit" form="pipeline-stage-form" className="btn-primary"><Check size={14} /> Save Stage</button></>}>
        <form id="pipeline-stage-form" onSubmit={saveStage} className="space-y-3">
          <Field label="Stage name"><input className="input" name="name" defaultValue={editingStage?.name ?? ''} required /></Field>
          <Field label="Win probability (%)"><input className="input" name="winProbabilityPct" type="number" min="0" max="100" step="1" defaultValue={editingStage?.winProbabilityPct ?? ''} required /></Field>
          <Field label="Stagnation threshold (days)"><input className="input" name="stagnationDaysThreshold" type="number" min="0" step="1" defaultValue={editingStage?.stagnationDaysThreshold ?? ''} required /></Field>
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
        onClose={() => { setMoveModalOpen(false); setPendingMove(null); setMoveOutcome(''); }}
        title={moveTitle}
        subtitle={pendingMove ? `${deals.find((deal) => deal.id === pendingMove.dealId)?.client} → ${pendingMove.stage.name}` : undefined}
        size="md"
        footer={<>
          <button type="button" className="btn-ghost" onClick={() => { setMoveModalOpen(false); setPendingMove(null); setMoveOutcome(''); }}>Cancel</button>
          <button type="submit" form="stage-gate-form" className="btn-primary">
            <Check size={14} /> {moveOutcome === 'won' ? 'Confirm Won' : moveOutcome === 'lost' ? 'Confirm Lost' : 'Confirm Stage'}
          </button>
        </>}
      >
        <form id="stage-gate-form" onSubmit={submitGatedMove} className="space-y-3">
          {pendingMove && isWonStage(pendingMove.stage.name) && (
            <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">
              Confirm that the policy is bound. Proceed with invoicing and active-sales follow-up.
            </p>
          )}
          {pendingMove && isRenewalPipeline(selectedPipeline) && pendingMove.stage.name.toLowerCase().includes('renewed') && (
            <p className="rounded-lg border border-win/30 bg-win/5 p-3 text-sm text-muted">
              Confirm the policy renewal. It will remain in the Annual Renewals pipeline as Won; proceed with invoicing and active sales follow-up.
            </p>
          )}
          {pendingMove && isLostStage(pendingMove.stage.name) ? (
            <>
              <Field label="Loss reason (required)"><select className="input" name="lossReason" required defaultValue=""><option value="" disabled>Select a reason</option>{LOSS_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></Field>
              <Field label="Additional notes"><textarea className="input min-h-20" name="notes" /></Field>
            </>
          ) : pendingMove
            && !isWonStage(pendingMove.stage.name)
            && !(isRenewalPipeline(selectedPipeline) && pendingMove.stage.name.toLowerCase().includes('renewed')) ? (
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
