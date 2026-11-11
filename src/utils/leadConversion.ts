import type { Client, CompanyContactProfile, Deal, Lead, Pipeline, PipelineStage, ProductCode } from '../types';
import { TENANT_ID } from '../lib/supabase';
import { calculateBrokerageCommission } from './insurance';
import { appendLeadStageTransition } from './leadLifecycle';
import { linkDealToLead } from './dealFactory';
import { isValidDealCloseDate } from './monthlyDealSummary';

export interface LeadConversionInput {
  lead: Lead;
  client?: Client;
  product?: ProductCode;
  pipeline?: Pipeline;
  firstStage?: PipelineStage;
  contactChannels: {
    contactPhone?: string;
    whatsapp?: string;
    telegram?: string;
  };
  primaryContact?: CompanyContactProfile;
}

export function buildLeadConversion(input: LeadConversionInput) {
  const { lead, client, product, pipeline, firstStage, contactChannels, primaryContact } = input;
  if (lead.disposition === 'lost' || lead.dealId) {
    return null;
  }
  if (!client || !hasCompleteClientProfile(client)) {
    return null;
  }
  if (!product || !pipeline || !firstStage) {
    return null;
  }
  if (!hasCompleteCommunicationChannels(contactChannels)) {
    return null;
  }

  const value = lead.value ?? lead.sumInsured ?? lead.premium ?? 0;
  const closeDate = lead.closeDate ?? lead.renewalDate;
  if (!Number.isFinite(value) || value <= 0 || !isValidDealCloseDate(closeDate) || lead.clientId !== client.id) {
    return null;
  }

  const enteredAt = new Date().toISOString();
  const stageHistory = appendLeadStageTransition(lead, 'Converted to deal', enteredAt);
  const dealDraft: Deal = {
    id: `deal-${crypto.randomUUID()}`,
    leadId: lead.id,
    pipelineId: pipeline.id,
    createdAt: enteredAt,
    stageChangedAt: enteredAt,
    client: lead.client,
    clientId: lead.clientId,
    contactName: lead.contact,
    contactProfileId: lead.contactProfileId ?? primaryContact?.id,
    contactRole: lead.contactRole,
    contactEmail: lead.contactEmail || primaryContact?.email || '',
    contactPhone: contactChannels.contactPhone || lead.contactPhone || '',
    whatsapp: contactChannels.whatsapp || lead.whatsapp || '',
    telegram: contactChannels.telegram || lead.telegram || '',
    product: product.name,
    productCode: product.code,
    value,
    weighted: Math.round(value * firstStage.winProbabilityPct) / 100,
    brokerageRatePct: product.standardBrokerageRatePct,
    brokerageCommission: calculateBrokerageCommission(value, product),
    currency: lead.currency ?? 'MVR',
    ...(lead.exchangeRate ? { exchangeRate: lead.exchangeRate } : {}),
    stage: firstStage.name,
    probability: firstStage.winProbabilityPct,
    ownerId: lead.ownerId,
    closeDate,
    insurer: 'Not assigned',
    source: lead.source,
    notes: lead.notes,
  };
  const linked = linkDealToLead(dealDraft, {
    ...lead,
    funnelStage: 'Converted to deal',
    disposition: 'converted',
    stageHistory,
    stageChangedAt: enteredAt,
  });

  return {
    deal: linked.deal,
    enteredAt,
    stageHistory,
    leadUpdate: {
      ...linked.lead,
      pipelineId: pipeline.id,
      contactProfileId: lead.contactProfileId ?? primaryContact?.id,
      contactEmail: lead.contactEmail || primaryContact?.email || '',
      contactPhone: contactChannels.contactPhone || lead.contactPhone || '',
      whatsapp: contactChannels.whatsapp || lead.whatsapp || '',
      telegram: contactChannels.telegram || lead.telegram || '',
    },
    stageHistoryEntry: {
      id: `stage-${crypto.randomUUID()}`,
      tenantId: TENANT_ID,
      dealId: linked.deal.id,
      fromStageId: null,
      toStageId: firstStage.id,
      enteredAt,
      exitedAt: null,
      durationSeconds: null,
    },
  };
}

function hasCompleteCommunicationChannels(channels: { contactPhone?: string; whatsapp?: string; telegram?: string }) {
  return Boolean(channels.contactPhone && channels.whatsapp && channels.telegram)
    && /^\+?[0-9()\-\s]{7,}$/.test((channels.contactPhone ?? '').trim())
    && /^\+?[0-9()\-\s]{7,}$/.test((channels.whatsapp ?? '').trim())
    && (channels.telegram ?? '').trim().length > 0;
}

function hasCompleteClientProfile(client: Client) {
  return Boolean(
    client.name?.trim()
    && client.country?.trim()
    && client.address?.trim()
    && client.email?.trim()
    && client.phone?.trim()
    && client.productCode?.trim()
    && client.class?.trim(),
  );
}
