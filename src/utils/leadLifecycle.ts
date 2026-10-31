import type { Lead } from '../types';

export const LEAD_ACTIVE_STAGES = [
  'Lead Identified',
  'Contact Made',
  'Key Person Identified',
  'Intro Email Sent',
  'Meetings Ongoing',
] as const;

export const LEAD_TERMINAL_STAGES = ['Converted to deal', 'Lost'] as const;
export const LEAD_LIFECYCLE_STAGES = [...LEAD_ACTIVE_STAGES, ...LEAD_TERMINAL_STAGES] as const;

export type LeadLifecycleStage = (typeof LEAD_LIFECYCLE_STAGES)[number];

export function lifecycleStageForName(stageName: string): LeadLifecycleStage {
  const stage = stageName.trim().toLowerCase();
  if (stage.includes('lost') || stage.includes('declined')) return 'Lost';
  if (stage.includes('converted to deal')) return 'Converted to deal';
  if (stage.includes('qualified') || stage.includes('bound') || stage.includes('won')
    || stage.includes('meeting') || stage.includes('negotiat') || stage.includes('underwriter')) return 'Meetings Ongoing';
  if (stage.includes('intro') || stage.includes('email') || stage.includes('quoted')) return 'Intro Email Sent';
  if (stage.includes('key person') || stage.includes('comparative') || stage.includes('presentation')
    || stage.includes('quote comparison') || stage.includes('lob scoping') || stage.includes('l2:')) {
    return 'Key Person Identified';
  }
  if (stage.includes('contact') || stage.includes('market') || stage.includes('tender')
    || stage.includes('slip') || stage.includes('kyc') || stage.includes('l1:')) return 'Contact Made';
  return 'Lead Identified';
}

export function lifecycleStageForLead(
  lead: Pick<Lead, 'funnelStage' | 'disposition'>,
  hasLinkedDeal = false,
): LeadLifecycleStage {
  if (lead.disposition === 'lost') return 'Lost';
  if (lead.disposition === 'converted') return 'Converted to deal';
  const stage = lifecycleStageForName(lead.funnelStage);
  if (stage === 'Lost') return 'Lost';
  if (hasLinkedDeal) return 'Converted to deal';
  return stage;
}

export function isTerminalLeadStage(stage: LeadLifecycleStage) {
  return (LEAD_TERMINAL_STAGES as readonly string[]).includes(stage);
}
