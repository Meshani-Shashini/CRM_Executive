import type { Client, Deal, Lead, Pipeline, PipelineStage, User } from '../types';
import { normalizeDateInput } from './date';

const DAY_MS = 86400000;

export type RenewalBucket = 'T-90' | 'T-60' | 'T-30' | 'T-15' | 'Overdue';

export interface RenewalRow {
  id: string;
  client: string;
  clientId?: string;
  insurer: string;
  premium?: number;
  currency: 'MVR' | 'USD';
  renewalDate: string;
  daysUntil: number;
  bucket: RenewalBucket;
  ownerId: string;
  stage: string;
  dealId?: string;
  leadId?: string;
}

const BUCKETS: RenewalBucket[] = ['Overdue', 'T-15', 'T-30', 'T-60', 'T-90'];

function dateOnly(value?: string) {
  return value ? normalizeDateInput(value.slice(0, 10)) : '';
}

function dayDifference(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

function bucketFor(days: number): RenewalBucket {
  if (days < 0) return 'Overdue';
  if (days <= 15) return 'T-15';
  if (days <= 30) return 'T-30';
  if (days <= 60) return 'T-60';
  return 'T-90';
}

export function buildRenewalRows({
  clients,
  deals,
  leads,
  pipelines,
  pipelineStages,
  users,
  today = new Date().toISOString().slice(0, 10),
  horizonDays = 120,
}: {
  clients: Client[];
  deals: Deal[];
  leads: Lead[];
  pipelines: Pipeline[];
  pipelineStages: PipelineStage[];
  users: User[];
  today?: string;
  horizonDays?: number;
}): RenewalRow[] {
  const renewalPipelineIds = new Set(pipelines
    .filter((pipeline) => pipeline.code.toLowerCase() === 'renewals' || pipeline.name.toLowerCase().includes('renewal'))
    .map((pipeline) => pipeline.id));
  const candidates: Array<{ row: RenewalRow; priority: number }> = [];
  const addCandidate = (input: {
    id: string;
    client: string;
    clientId?: string;
    date?: string;
    insurer?: string;
    premium?: number;
    currency?: 'MVR' | 'USD';
    ownerId: string;
    stage: string;
    dealId?: string;
    leadId?: string;
    priority: number;
  }) => {
    const date = dateOnly(input.date);
    if (!date) return;
    const daysUntil = dayDifference(date, today);
    if (daysUntil > horizonDays) return;
    candidates.push({
      priority: input.priority,
      row: {
        id: input.id,
        client: input.client,
        clientId: input.clientId,
        insurer: input.insurer ?? '',
        premium: input.premium,
        currency: input.currency ?? 'MVR',
        renewalDate: date,
        daysUntil,
        bucket: bucketFor(daysUntil),
        ownerId: input.ownerId,
        stage: input.stage,
        dealId: input.dealId,
        leadId: input.leadId,
      },
    });
  };
  const matchingDeals = (clientId?: string, clientName?: string) => deals
    .filter((deal) => (clientId && deal.clientId === clientId) || deal.client === clientName)
    .sort((left, right) =>
      Number(renewalPipelineIds.has(right.pipelineId ?? '')) - Number(renewalPipelineIds.has(left.pipelineId ?? '')));
  const matchingLead = (clientId?: string, clientName?: string) => leads.find((lead) =>
    (clientId && lead.clientId === clientId) || lead.client === clientName);
  const renewalDealDate = (deal: Deal) => {
    const client = clients.find((item) => item.id === deal.clientId || item.name === deal.client);
    const lead = matchingLead(deal.clientId, deal.client);
    return deal.renewalExpiry ?? deal.policyExpiry ?? client?.expiry ?? lead?.renewalDate;
  };

  for (const deal of deals) {
    const isRenewalDeal = renewalPipelineIds.has(deal.pipelineId ?? '');
    if (!isRenewalDeal && !deal.renewalExpiry && !deal.policyExpiry) continue;
    const client = clients.find((item) => item.id === deal.clientId || item.name === deal.client);
    const lead = matchingLead(deal.clientId, deal.client);
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage)?.name ?? deal.stage;
    addCandidate({
      id: `deal:${deal.id}`,
      client: client?.name ?? deal.client,
      clientId: deal.clientId ?? client?.id,
      date: renewalDealDate(deal),
      insurer: deal.insurer || client?.insurer || '',
      premium: client?.premium ?? lead?.premium,
      currency: client ? 'MVR' : lead?.currency ?? deal.currency,
      ownerId: deal.ownerId || client?.ownerId || lead?.ownerId || '',
      stage,
      dealId: deal.id,
      leadId: lead?.id,
      priority: isRenewalDeal ? 4 : 3,
    });
  }

  for (const lead of leads) {
    if (!lead.renewalDate) continue;
    const deal = matchingDeals(lead.clientId, lead.client).find((item) =>
      item.leadId === lead.id || item.id === lead.dealId || item.renewalExpiry === lead.renewalDate)
      ?? matchingDeals(lead.clientId, lead.client)[0];
    const client = clients.find((item) => item.id === lead.clientId || item.name === lead.client);
    addCandidate({
      id: `lead:${lead.id}`,
      client: lead.client,
      clientId: lead.clientId,
      date: lead.renewalDate,
      insurer: deal?.insurer ?? client?.insurer ?? '',
      premium: client?.premium ?? lead.premium,
      currency: client ? 'MVR' : lead.currency ?? 'MVR',
      ownerId: lead.ownerId,
      stage: deal?.stage ?? lead.funnelStage,
      dealId: deal?.id,
      leadId: lead.id,
      priority: 2,
    });
  }

  for (const client of clients) {
    const relatedDeals = matchingDeals(client.id, client.name);
    const deal = relatedDeals.find((item) => dateOnly(renewalDealDate(item)) === dateOnly(client.expiry))
      ?? relatedDeals[0];
    const lead = matchingLead(client.id, client.name);
    const stage = deal?.stage
      ?? (lead ? lead.funnelStage : 'Policy expiry');
    addCandidate({
      id: `client:${client.id}`,
      client: client.name,
      clientId: client.id,
      date: client.expiry,
      insurer: deal?.insurer || client.insurer,
      premium: client.premium,
      currency: 'MVR',
      ownerId: deal?.ownerId || lead?.ownerId || client.ownerId,
      stage,
      dealId: deal?.id,
      leadId: lead?.id,
      priority: 1,
    });
  }

  const unique = new Map<string, { row: RenewalRow; priority: number }>();
  for (const candidate of candidates) {
    const key = `${candidate.row.clientId ?? candidate.row.client.toLowerCase()}|${candidate.row.renewalDate}`;
    const existing = unique.get(key);
    if (!existing || candidate.priority > existing.priority) unique.set(key, candidate);
  }

  const ownerOrder = new Map(users.map((user, index) => [user.id, index]));
  return [...unique.values()].map(({ row }) => row).sort((left, right) =>
    BUCKETS.indexOf(left.bucket) - BUCKETS.indexOf(right.bucket)
    || left.renewalDate.localeCompare(right.renewalDate)
    || (ownerOrder.get(left.ownerId) ?? Number.MAX_SAFE_INTEGER) - (ownerOrder.get(right.ownerId) ?? Number.MAX_SAFE_INTEGER));
}
