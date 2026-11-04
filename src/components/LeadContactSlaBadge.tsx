import Badge from './ui/Badge';
import type { Lead, PipelineStage } from '../types';
import { calculateLeadContactSla, getContactMadeSlaTargetDays } from '../utils/leadSla';
import { formatDate } from '../utils/date';
import { isTerminalLeadStage, lifecycleStageForLead } from '../utils/leadLifecycle';

export default function LeadContactSlaBadge({
  lead,
  pipelineStages,
  now,
  compact = false,
}: {
  lead: Lead;
  pipelineStages: PipelineStage[];
  now?: number;
  compact?: boolean;
}) {
  const terminal = lead.disposition === 'converted' || lead.disposition === 'lost'
    || ['COMPLETED', 'CONVERTED', 'WON', 'LOST'].includes(lead.status.toUpperCase())
    || isTerminalLeadStage(lifecycleStageForLead(lead, Boolean(lead.dealId)));
  if (terminal) return null;

  const targetDays = getContactMadeSlaTargetDays(lead, pipelineStages);
  const sla = calculateLeadContactSla(lead, targetDays, now);
  if (!sla || (!sla.hasReachedContactMade && sla.elapsedDays === 0)) return null;

  const variant = sla.overdue ? 'hot' : 'win';
  const status = sla.overdue ? 'Overdue' : 'On Track';
  const timing = `${sla.elapsedDays}d elapsed`;
  const title = [
    `First-contact SLA: ${status}`,
    `${sla.elapsedDays} days elapsed`,
    `Created ${formatDate(sla.createdAt)}`,
    sla.contactedAt ? `Contacted ${formatDate(sla.contactedAt)}` : 'Awaiting first contact',
  ].join(' · ');

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${compact ? 'flex-nowrap' : 'flex-wrap'}`} title={title} aria-label={`${status}, ${sla.elapsedDays} days elapsed`}>
      <Badge variant={variant}>{status}</Badge>
      <span className={`shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] leading-none ${sla.overdue ? 'text-hot' : 'text-emerald-300'}`}>{timing}</span>
    </span>
  );
}
