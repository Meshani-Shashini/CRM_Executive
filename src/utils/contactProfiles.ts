import type { Client, CompanyContactProfile, Deal, Lead } from '../types';

function sameContact(left: CompanyContactProfile, right: CompanyContactProfile) {
  return left.id === right.id
    || Boolean(left.email.trim() && right.email.trim()
      && left.email.trim().toLowerCase() === right.email.trim().toLowerCase());
}

export function mergeContactProfiles(...groups: (CompanyContactProfile[] | undefined)[]) {
  return groups.flatMap((group) => group ?? []).reduce<CompanyContactProfile[]>((merged, contact) => {
    const index = merged.findIndex((existing) => sameContact(existing, contact));
    if (index < 0) return [...merged, contact];
    const existing = merged[index];
    const updated = [...merged];
    updated[index] = {
      ...existing,
      ...contact,
      id: existing.id,
      linkedLeadIds: [...new Set([...(existing.linkedLeadIds ?? []), ...(contact.linkedLeadIds ?? [])])],
      linkedDealIds: [...new Set([...(existing.linkedDealIds ?? []), ...(contact.linkedDealIds ?? [])])],
    };
    return updated;
  }, []);
}

export function linkContactProfile(
  contact: CompanyContactProfile,
  leadId?: string,
  dealId?: string,
): CompanyContactProfile {
  return {
    ...contact,
    linkedLeadIds: [...new Set([...(contact.linkedLeadIds ?? []), ...(leadId ? [leadId] : [])])],
    linkedDealIds: [...new Set([...(contact.linkedDealIds ?? []), ...(dealId ? [dealId] : [])])],
  };
}

function belongsToClient(record: { clientId?: string; client: string }, client: Client) {
  return record.clientId === client.id
    || record.client.trim().toLowerCase() === client.name.trim().toLowerCase();
}

export function reconcileContactAssociations(leads: Lead[], clients: Client[], deals: Deal[]) {
  const validDealIds = new Set(deals.map((deal) => deal.id));
  const normalizedLeads = leads.map((lead) => {
    const client = clients.find((candidate) => candidate.id === lead.clientId)
      ?? clients.find((candidate) => candidate.name.trim().toLowerCase() === lead.client.trim().toLowerCase());
    const relatedLeadIds = leads.filter((candidate) => candidate.id === lead.id
      || (client && belongsToClient(candidate, client))).map((candidate) => candidate.id);
    const relatedDealIds = deals.filter((deal) => (client && belongsToClient(deal, client))
      || relatedLeadIds.includes(deal.leadId ?? '')).map((deal) => deal.id);
    const relatedProfiles = client?.contacts?.filter((profile) => profile.linkedLeadIds?.includes(lead.id));
    const legacyPrimary: CompanyContactProfile[] = lead.contact?.trim() ? [{
      id: lead.contactProfileId || `contact-${lead.id}`,
      name: lead.contact,
      role: lead.contactRole ?? 'Decision Maker',
      email: lead.contactEmail ?? '',
      phone: lead.contactPhone ?? '',
      whatsapp: lead.whatsapp,
      telegram: lead.telegram,
    }] : [];
    const contacts = mergeContactProfiles(legacyPrimary, lead.contacts, relatedProfiles).map((profile) => ({
      ...profile,
      linkedLeadIds: [...new Set([
        ...(profile.linkedLeadIds ?? []).filter((id) => relatedLeadIds.includes(id)),
        lead.id,
      ])],
      linkedDealIds: [...new Set([
        ...(profile.linkedDealIds ?? []).filter((id) => relatedDealIds.includes(id)),
        ...(lead.dealId && relatedDealIds.includes(lead.dealId) ? [lead.dealId] : []),
      ])],
    }));
    const primary = contacts.find((profile) => profile.id === lead.contactProfileId)
      ?? contacts.find((profile) => profile.email && profile.email.toLowerCase() === lead.contactEmail?.toLowerCase())
      ?? contacts.find((profile) => profile.name.trim().toLowerCase() === lead.contact.trim().toLowerCase());
    return {
      ...lead,
      ...(client && !lead.clientId ? { clientId: client.id } : {}),
      contacts,
      ...(primary ? { contactProfileId: primary.id } : {}),
    };
  });

  const normalizedClients = clients.map((client) => {
    const relatedLeads = normalizedLeads.filter((lead) => belongsToClient(lead, client));
    const contacts = mergeContactProfiles(
      client.contacts,
      ...relatedLeads.map((lead) => lead.contacts),
    ).map((profile) => {
      const linkedLeads = relatedLeads
        .filter((lead) => lead.contacts?.some((candidate) => sameContact(candidate, profile)))
        .map((lead) => lead.id);
      const linkedDeals = deals
        .filter((deal) => belongsToClient(deal, client)
          && (profile.linkedDealIds?.includes(deal.id)
            || relatedLeads.some((lead) => lead.dealId === deal.id
              && lead.contacts?.some((candidate) => sameContact(candidate, profile)))))
        .map((deal) => deal.id);
      return {
        ...profile,
        linkedLeadIds: [...new Set([
          ...(profile.linkedLeadIds ?? []).filter((id) => relatedLeads.some((lead) => lead.id === id)),
          ...linkedLeads,
        ])],
        linkedDealIds: [...new Set([
          ...(profile.linkedDealIds ?? []).filter((id) => validDealIds.has(id)
            && deals.some((deal) => deal.id === id && belongsToClient(deal, client))),
          ...linkedDeals,
        ])],
      };
    });
    return { ...client, contacts };
  });
  return { leads: normalizedLeads, clients: normalizedClients };
}
