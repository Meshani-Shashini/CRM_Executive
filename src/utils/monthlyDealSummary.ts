import type { Client, Deal, Lead, PipelineStage, StageHistoryAudit } from '../types';
import { toMvr } from './currency';
import { isLostPipelineStage, isWonPipelineStage } from './stageSla';

export type DealSummaryOutcome = 'won' | 'open' | 'lost';
export type DealSummaryFilter = 'won' | 'open' | 'all';
export type DealSummaryPeriod = 'month' | 'quarter';

export interface DealSummaryContext {
  leads: Lead[];
  clients: Client[];
  stageHistory: StageHistoryAudit[];
}

export interface DealSummaryEntry {
  deal: Deal;
  outcome: DealSummaryOutcome;
  valueMvr: number;
  weightedValueMvr: number;
  stageName: string;
  probabilityPct: number;
  validationErrors: string[];
}

export interface DealStageSummary {
  stageName: string;
  count: number;
  valueMvr: number;
  weightedValueMvr: number;
  probabilityPct: number;
}

export interface DealValueSummary {
  won: DealSummaryEntry[];
  open: DealStageSummary[];
  lost: DealSummaryEntry[];
  validationIssues: Array<{ dealId: string; errors: string[] }>;
  wonValueMvr: number;
  openValueMvr: number;
  openWeightedValueMvr: number;
  lostValueMvr: number;
}

export interface MonthlyDealSummary extends DealValueSummary {
  key: string;
  label: string;
}

export function isValidDealCloseDate(value?: string) {
  const date = value?.slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateDealBaseForProgression(deal: Deal, context: Pick<DealSummaryContext, 'leads' | 'clients'>) {
  const errors: string[] = [];
  if (!isValidDealCloseDate(deal.closeDate)) {
    errors.push('Expected close date is required and must be valid.');
  }
  if (!Number.isFinite(deal.value) || deal.value <= 0) {
    errors.push('Deal value must be positive.');
  }
  const lead = context.leads.find((candidate) => candidate.id === deal.leadId);
  if (!lead) {
    errors.push('Deal must be linked to its lead.');
  }
  const client = context.clients.find((candidate) => candidate.id === deal.clientId);
  if (!client || (lead && lead.clientId !== client.id)) {
    errors.push('Deal and lead must be linked to a client.');
  }
  return errors;
}

export function classifyDealOutcome(
  deal: Deal,
  stage?: PipelineStage,
  stageHistory: StageHistoryAudit[] = [],
): DealSummaryOutcome {
  if (deal.disposition) return deal.disposition;
  const auditedOutcome = stageHistory
    .filter((entry) => entry.dealId === deal.id && entry.outcome)
    .sort((left, right) => Date.parse(right.enteredAt) - Date.parse(left.enteredAt))[0]?.outcome;
  if (stage?.isClosedWon === true && stage.isClosedLost === true) {
    return auditedOutcome ?? (deal.lossReason ? 'lost' : 'won');
  }
  if (stage?.isClosedLost === true) return 'lost';
  if (stage?.isClosedWon === true) return 'won';
  const stageName = stage?.name ?? deal.stage;
  if (isLostPipelineStage(stageName) && !isWonPipelineStage(stageName)) return 'lost';
  if (isWonPipelineStage(stageName) && !isLostPipelineStage(stageName)) return 'won';
  if (isLostPipelineStage(stageName) && isWonPipelineStage(stageName)) {
    return auditedOutcome ?? (deal.lossReason ? 'lost' : 'won');
  }
  return 'open';
}

export function validateDealForMonthlySummary(
  deal: Deal,
  outcome: DealSummaryOutcome,
  context: DealSummaryContext,
): string[] {
  const errors = validateDealBaseForProgression(deal, context);

  const audit = context.stageHistory
    .filter((entry) => entry.dealId === deal.id)
    .sort((left, right) => Date.parse(right.enteredAt) - Date.parse(left.enteredAt))
    .find((entry) => entry.outcome === outcome);
  if (outcome === 'won' && !audit?.details?.split('\n').some((line) => /^Win reason:\s*\S/.test(line))) {
    errors.push('A win reason is required.');
  }
  if (outcome === 'lost' && !(deal.lossReason?.trim() || audit?.lossReason?.trim())) {
    errors.push('A loss reason is required.');
  }
  return errors;
}

export function summarizeDealValues(
  deals: Deal[],
  pipelineStages: PipelineStage[],
  context: DealSummaryContext,
): DealValueSummary {
  const allEntries = deals.map((deal): DealSummaryEntry => {
    const stage = pipelineStages.find((candidate) =>
      candidate.pipelineId === deal.pipelineId && candidate.name === deal.stage);
    const outcome = classifyDealOutcome(deal, stage, context.stageHistory);
    const rawProbabilityPct = stage?.winProbabilityPct ?? deal.probability;
    const probabilityPct = Number.isFinite(rawProbabilityPct)
      ? Math.max(0, Math.min(100, rawProbabilityPct))
      : 0;
    const valueMvr = toMvr(deal.value, deal.currency, deal.exchangeRate);
    return {
      deal,
      outcome,
      valueMvr,
      weightedValueMvr: outcome === 'open' ? valueMvr * probabilityPct / 100 : 0,
      stageName: stage?.name ?? deal.stage,
      probabilityPct,
      validationErrors: validateDealForMonthlySummary(deal, outcome, context),
    };
  });
  const entries = allEntries.filter((entry) => entry.validationErrors.length === 0);
  const openByStage = new Map<string, DealStageSummary>();
  for (const entry of entries.filter((item) => item.outcome === 'open')) {
    const summary = openByStage.get(entry.stageName) ?? {
      stageName: entry.stageName,
      count: 0,
      valueMvr: 0,
      weightedValueMvr: 0,
      probabilityPct: entry.probabilityPct,
    };
    summary.count += 1;
    summary.valueMvr += entry.valueMvr;
    summary.weightedValueMvr += entry.weightedValueMvr;
    openByStage.set(entry.stageName, summary);
  }
  const won = entries.filter((entry) => entry.outcome === 'won');
  const lost = entries.filter((entry) => entry.outcome === 'lost');
  const stageOrder = new Map(pipelineStages.map((stage) => [stage.name, stage.stageOrder]));
  const open = [...openByStage.values()]
    .map((stage) => ({
      ...stage,
      probabilityPct: stage.valueMvr > 0 ? stage.weightedValueMvr / stage.valueMvr * 100 : 0,
    }))
    .sort((left, right) =>
      (stageOrder.get(left.stageName) ?? Number.MAX_SAFE_INTEGER)
      - (stageOrder.get(right.stageName) ?? Number.MAX_SAFE_INTEGER));
  const validationIssues = allEntries
    .filter((entry) => entry.validationErrors.length > 0)
    .map((entry) => ({ dealId: entry.deal.id, errors: entry.validationErrors }));
  return {
    won,
    open,
    lost,
    validationIssues,
    wonValueMvr: won.reduce((total, entry) => total + entry.valueMvr, 0),
    openValueMvr: open.reduce((total, entry) => total + entry.valueMvr, 0),
    openWeightedValueMvr: open.reduce((total, entry) => total + entry.weightedValueMvr, 0),
    lostValueMvr: lost.reduce((total, entry) => total + entry.valueMvr, 0),
  };
}

export function summarizeDealsByPeriod(
  deals: Deal[],
  pipelineStages: PipelineStage[],
  context: DealSummaryContext,
  period: DealSummaryPeriod = 'month',
): MonthlyDealSummary[] {
  const groups = new Map<string, { label: string; deals: Deal[] }>();
  for (const deal of deals) {
    const datePart = deal.closeDate?.slice(0, 10) ?? '';
    if (!isValidDealCloseDate(datePart)) continue;
    const [year, month] = datePart.split('-').map(Number);
    if (!year || month < 1 || month > 12) continue;
    const startMonth = period === 'month' ? month : Math.floor((month - 1) / 3) * 3 + 1;
    const key = `${year}-${String(startMonth).padStart(2, '0')}`;
    const start = new Date(year, startMonth - 1, 1);
    const label = period === 'month'
      ? start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `Q${Math.floor((startMonth - 1) / 3) + 1} ${year}`;
    const group = groups.get(key) ?? { label, deals: [] };
    group.deals.push(deal);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const summary = summarizeDealValues(group.deals, pipelineStages, context);
      return {
        key,
        label: group.label,
        ...summary,
      };
    });
}

export function filterDealSummaryEntries(summary: DealValueSummary, filter: DealSummaryFilter) {
  return {
    won: filter === 'open' ? [] : summary.won,
    open: filter === 'won' ? [] : summary.open,
    lost: filter === 'open' || filter === 'won' ? [] : summary.lost,
  };
}
