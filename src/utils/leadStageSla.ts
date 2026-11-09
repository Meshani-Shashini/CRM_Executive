import type { Lead } from '../types';
import { buildLeadStageHistoryRecords, LEAD_ACTIVE_STAGES, type LeadLifecycleStage } from './leadLifecycle';

export type LeadActiveStage = (typeof LEAD_ACTIVE_STAGES)[number];
export type LeadStageSlaDays = Record<LeadActiveStage, number>;

export const DEFAULT_LEAD_STAGE_SLA_DAYS: LeadStageSlaDays = {
  'Lead Identified': 3,
  'Contact Made': 5,
  'Key Person Identified': 5,
  'Intro Email Sent': 7,
  'Meetings Ongoing': 10,
};

export function resolveLeadStageSlaDays(config?: Partial<Record<LeadLifecycleStage, number>>): LeadStageSlaDays {
  return Object.fromEntries(LEAD_ACTIVE_STAGES.map((stage) => {
    const configured = config?.[stage];
    return [stage, typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_LEAD_STAGE_SLA_DAYS[stage]];
  })) as LeadStageSlaDays;
}

export function getLeadStageEnteredAt(lead: Lead, stage: LeadLifecycleStage) {
  const currentRecord = buildLeadStageHistoryRecords([lead]).find((record) =>
    record.is_current && record.stage === stage);
  const candidates = [
    currentRecord?.entered_at,
    lead.stage_changed_at,
    lead.stageChangedAt,
    lead.routedAt,
    lead.createdAt,
    lead.created_at,
    lead.startDate,
    lead.start_date,
  ];
  return candidates.find((candidate): candidate is string =>
    Boolean(candidate && Number.isFinite(Date.parse(candidate))));
}

export function getLeadStageSla(
  lead: Lead,
  stage: LeadLifecycleStage,
  targets?: Partial<Record<LeadLifecycleStage, number>>,
  now = Date.now(),
) {
  if (!(LEAD_ACTIVE_STAGES as readonly string[]).includes(stage)) return undefined;
  const enteredAt = getLeadStageEnteredAt(lead, stage);
  const targetDays = resolveLeadStageSlaDays(targets)[stage as LeadActiveStage];
  const enteredAtMilliseconds = enteredAt ? Date.parse(enteredAt) : Number.NaN;
  if (!enteredAt || !Number.isFinite(enteredAtMilliseconds)) return undefined;
  const elapsedDays = Math.max(0, (now - enteredAtMilliseconds) / 86400000);
  return {
    enteredAt,
    elapsedDays,
    targetDays,
    overdue: targetDays > 0 && elapsedDays > targetDays,
  };
}
