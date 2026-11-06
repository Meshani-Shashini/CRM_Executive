import type { Client, Deal, Lead } from '../types';

type DealDraft = Omit<Deal, 'leadId'> & { leadId?: string };

export function linkDealToLead(
  deal: DealDraft,
  existingLead?: Lead,
  options: { source?: string; client?: Client } = {},
): { deal: Deal; lead: Lead } {
  const now = deal.createdAt ?? new Date().toISOString();
  const lead = existingLead
    ? { ...existingLead, dealId: deal.id }
    : {
      id: deal.leadId || `lead-${deal.id}`,
      clientId: deal.clientId ?? options.client?.id,
      client: deal.client,
      title: options.source ?? 'Legacy import',
      value: deal.value,
      sumInsured: deal.value,
      premium: options.client?.premium ?? 0,
      currency: deal.currency,
      pipelineId: deal.pipelineId,
      funnelStage: 'Converted to deal',
      disposition: 'converted' as const,
      source: options.source ?? 'Legacy import',
      notes: deal.notes ?? '',
      productCode: deal.productCode ?? deal.product,
      insuranceClass: options.client?.class ?? deal.product,
      country: options.client?.country ?? '',
      contact: deal.contactName ?? options.client?.contactPerson ?? '',
      contactEmail: deal.contactEmail,
      contactPhone: deal.contactPhone,
      whatsapp: deal.whatsapp,
      telegram: deal.telegram,
      temperature: 'WARM' as const,
      status: 'IN-PROGRESS' as const,
      ownerId: deal.ownerId,
      renewalDate: deal.policyExpiry ?? deal.renewalExpiry ?? deal.closeDate,
      closeDate: deal.closeDate,
      lastActivity: options.source ?? 'Legacy import',
      dealId: deal.id,
      stageHistory: [{
        fromStage: 'Lead Identified',
        toStage: 'Converted to deal',
        enteredAt: now,
        durationDays: 0,
      }],
      createdAt: now,
      updatedAt: now,
      routedAt: now,
    };

  return {
    deal: { ...deal, leadId: lead.id },
    lead,
  };
}

export function migrateDealLeadLinks(deals: Deal[], leads: Lead[], clients: Client[]) {
  const linkedLeads = [...leads];
  const linkedDeals = deals.map((deal) => {
    const existingLead = linkedLeads.find((lead) =>
      lead.id === deal.leadId || lead.dealId === deal.id,
    );
    const client = clients.find((item) => item.id === deal.clientId)
      ?? clients.find((item) => item.name.trim().toLowerCase() === deal.client.trim().toLowerCase());
    const linked = linkDealToLead(deal, existingLead, { source: 'Legacy import', client });
    const existingIndex = linkedLeads.findIndex((lead) => lead.id === linked.lead.id);
    if (existingIndex < 0) linkedLeads.push(linked.lead);
    else linkedLeads[existingIndex] = linked.lead;
    return linked.deal;
  });

  return { deals: linkedDeals, leads: linkedLeads };
}
