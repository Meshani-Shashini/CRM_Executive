import type { Deal, Lead } from '../types';

type DealDraft = Omit<Deal, 'leadId'> & { leadId?: string };

export function linkDealToLead(
  deal: DealDraft,
  existingLead?: Lead,
): { deal: Deal; lead: Lead } {
  if (!existingLead) {
    throw new Error('Deal conversion requires a valid lead record.');
  }

  const lead = {
    ...existingLead,
    funnelStage: 'Converted to deal',
    disposition: 'converted' as const,
    dealId: deal.id,
  };

  return {
    deal: { ...deal, leadId: lead.id },
    lead,
  };
}

export function convertedDealsOnly(deals: Deal[], leads: Lead[]) {
  return deals.filter((deal) => leads.some((lead) =>
    lead.id === deal.leadId
    && lead.dealId === deal.id,
  ));
}
