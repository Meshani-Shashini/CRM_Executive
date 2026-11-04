import type { Lead, PipelineStage } from '../types';
import { lifecycleStageForLead } from './leadLifecycle';

export const DEFAULT_CONTACT_MADE_SLA_DAYS = 10;

function validTimestamp(value: string | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function getLeadContactedAt(lead: Lead) {
  const explicitContactDate = validTimestamp(lead.contactedAt) ?? validTimestamp(lead.contacted_at);
  if (explicitContactDate) return explicitContactDate;

  const firstContactTransition = lead.stageHistory?.find((transition) =>
    transition.toStage === 'Contact Made' && validTimestamp(
      transition.enteredAt ?? transition.entered_at ?? transition.timestamp ?? transition.created_at ?? transition.date,
    ));
  const historicalContactDate = firstContactTransition
    ? firstContactTransition.enteredAt
      ?? firstContactTransition.entered_at
      ?? firstContactTransition.timestamp
      ?? firstContactTransition.created_at
      ?? firstContactTransition.date
    : undefined;
  if (historicalContactDate) return historicalContactDate;

  return lifecycleStageForLead(lead, Boolean(lead.dealId)) === 'Contact Made'
    ? validTimestamp(lead.stage_changed_at) ?? validTimestamp(lead.stageChangedAt) ?? validTimestamp(lead.routedAt)
    : undefined;
}

export function getContactMadeSlaTargetDays(lead: Lead, pipelineStages: PipelineStage[]) {
  const configuredTarget = pipelineStages.find((stage) =>
    stage.pipelineId === lead.pipelineId
    && stage.name.trim().toLowerCase() === 'contact made'
    && Number.isFinite(stage.stagnationDaysThreshold)
    && stage.stagnationDaysThreshold > 0)?.stagnationDaysThreshold;
  return configuredTarget ?? DEFAULT_CONTACT_MADE_SLA_DAYS;
}

export function calculateLeadContactSla(
  lead: Lead,
  targetDays: number,
  now = Date.now(),
) {
  const createdAt = validTimestamp(lead.createdAt)
    ?? validTimestamp(lead.created_at)
    ?? validTimestamp(lead.startDate)
    ?? validTimestamp(lead.start_date);
  if (!createdAt || !Number.isFinite(targetDays) || targetDays <= 0) return undefined;

  const contactedAt = getLeadContactedAt(lead);
  const endTime = contactedAt ? Date.parse(contactedAt) : now;
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(endTime) || !Number.isFinite(createdTime)) return undefined;

  const elapsedDays = Math.max(0, Math.floor((endTime - createdTime) / 86400000));
  const remainingDays = targetDays - elapsedDays;
  const overdue = remainingDays < 0;
  const stageHistory = lead.stageHistory ?? [];
  const hasReachedContactMade = Boolean(contactedAt)
    || stageHistory.some((transition) => transition.toStage === 'Contact Made')
    || lifecycleStageForLead(lead, Boolean(lead.dealId)) !== 'Lead Identified';
  return {
    createdAt,
    contactedAt,
    hasReachedContactMade,
    elapsedDays,
    remainingDays,
    overdueDays: Math.max(0, -remainingDays),
    targetDays,
    overdue,
  };
}
