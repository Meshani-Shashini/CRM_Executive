import type { Activity, CompanyContactProfile, Lead, LeadTemperature, ActivityStatus } from '../types';
import { supabase, TENANT_ID } from './supabase';
import { LEAD_ACTIVE_STAGES } from '../utils/leadLifecycle';

export const SAMPLE_LEAD_IDS = [
  'sample-lead-atoll-resort',
  'sample-lead-oceanic-logistics',
  'sample-lead-coral-construction',
  'sample-lead-island-retail',
  'sample-lead-maldives-air-charter',
  'sample-lead-hulhumale-medical',
  'sample-lead-seafood-export',
  'sample-lead-capital-holdings',
] as const;

const USD_TO_MVR = 15.42;
const DAY_MS = 86400000;

function dateFromToday(days: number, today = new Date()): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
  return date.toISOString().slice(0, 10);
}

function sampleContacts(leadId: string, primaryName: string): CompanyContactProfile[] {
  const slug = leadId.replace(/^sample-lead-/, '').replace(/[^a-z0-9]/gi, '');
  const suffix = 1000 + [...leadId].reduce((total, character) => total + character.charCodeAt(0), 0) % 8000;
  const names = [
    { name: primaryName, role: 'Decision Maker', suffix: 0 },
    { name: `${primaryName.split(/\s+/)[0]} Finance Contact`, role: 'Finance Contact', suffix: 1 },
    { name: `${primaryName.split(/\s+/)[0]} Technical Lead`, role: 'Technical Lead', suffix: 2 },
  ];
  return names.map((contact, index) => {
    const phone = `+960 777 ${String(suffix + index).slice(-4)}`;
    return {
      id: `${leadId}-contact-${String(index + 1).padStart(2, '0')}`,
      name: contact.name,
      role: contact.role,
      email: `${slug}.${index === 0 ? 'primary' : index === 1 ? 'finance' : 'technical'}@example.test`,
      phone,
      whatsapp: phone,
      telegram: `@${slug}${index + 1}`,
      linkedLeadIds: [leadId],
    };
  });
}

function lead(input: {
  id: (typeof SAMPLE_LEAD_IDS)[number];
  person: string;
  client: string;
  title: string;
  value: number;
  currency: 'MVR' | 'USD';
  insuranceClass: string;
  productCode: string;
  ownerId: string;
  closeInDays: number;
  temperature: LeadTemperature;
  status: ActivityStatus;
  stage: string;
  today?: Date;
}): Lead {
  const valueMvr = input.currency === 'USD'
    ? Math.round(input.value * USD_TO_MVR)
    : input.value;
  const closeDate = dateFromToday(input.closeInDays, input.today);
  const now = input.today ?? new Date();
  const sampleIndex = SAMPLE_LEAD_IDS.indexOf(input.id);
  const stageIndex = Math.max(0, LEAD_ACTIVE_STAGES.indexOf(input.stage as (typeof LEAD_ACTIVE_STAGES)[number]));
  const currentStageAgeDays = 1 + (sampleIndex % 4);
  const priorStageDurationDays = Array.from({ length: stageIndex }, (_, priorIndex) => 1 + ((sampleIndex + priorIndex) % 3));
  const createdAt = new Date(now.getTime() - (currentStageAgeDays + priorStageDurationDays.reduce((sum, days) => sum + days, 0)) * DAY_MS).toISOString();
  const stageChangedAt = new Date(now.getTime() - currentStageAgeDays * DAY_MS).toISOString();
  const contacts = sampleContacts(input.id, input.person);
  const primaryContact = contacts[0];

  return {
    id: input.id,
    createdAt,
    updatedAt: now.toISOString(),
    stageChangedAt,
    person: input.person,
    client: input.client,
    title: input.title,
    value: input.value,
    valueMvr,
    currency: input.currency,
    ...(input.currency === 'USD' ? { exchangeRate: USD_TO_MVR } : {}),
    closeDate,
    visibility: 'individual',
    contact: input.person,
    contactProfileId: primaryContact.id,
    contactRole: primaryContact.role,
    contactEmail: primaryContact.email,
    contactPhone: primaryContact.phone,
    whatsapp: primaryContact.whatsapp,
    telegram: primaryContact.telegram,
    contacts,
    country: 'Maldives',
    insuranceClass: input.insuranceClass,
    productCode: input.productCode,
    temperature: input.temperature,
    status: input.status,
    funnelStage: input.stage,
    ...(input.stage === 'Converted to deal' ? { disposition: 'converted' as const } : {}),
    ...(input.stage === 'Lost' ? { disposition: 'lost' as const, lossReason: 'Competitor selected' } : {}),
    renewalDate: closeDate,
    sumInsured: valueMvr,
    premium: Math.round(valueMvr * 0.035),
    ownerId: input.ownerId,
    lastActivity: 'Sample record',
  };
}

/**
 * Builds realistic, deterministic Leads for local or Supabase integration testing.
 * Pass one or more real authenticated staff profile IDs so the Owner column resolves
 * to users in the current tenant.
 */
export function createSampleLeads(ownerIds: string[], today = new Date()): Lead[] {
  if (ownerIds.length === 0) {
    throw new Error('At least one authenticated staff owner ID is required to create sample leads.');
  }

  const definitions: Omit<Parameters<typeof lead>[0], 'ownerId' | 'today'>[] = [
    {
      id: 'sample-lead-atoll-resort',
      person: 'Aishath Mariyam',
      client: 'Atoll Horizons Resort',
      title: 'Island resort property and business interruption renewal',
      value: 185000,
      currency: 'USD',
      insuranceClass: 'Fire',
      productCode: 'HC',
      closeInDays: 18,
      temperature: 'HOT',
      status: 'IN-PROGRESS',
      stage: 'Intro Email Sent',
    },
    {
      id: 'sample-lead-oceanic-logistics',
      person: 'Ibrahim Rasheed',
      client: 'Oceanic Logistics Maldives',
      title: 'Imported cargo and marine transit programme',
      value: 4200000,
      currency: 'MVR',
      insuranceClass: 'Marine',
      productCode: 'IP',
      closeInDays: 31,
      temperature: 'WARM',
      status: 'TO-DO',
      stage: 'Contact Made',
    },
    {
      id: 'sample-lead-coral-construction',
      person: 'Hassan Najeeb',
      client: 'Coral Point Construction',
      title: 'Contract works and contractors plant cover',
      value: 95000,
      currency: 'USD',
      insuranceClass: 'Engineering',
      productCode: 'NC',
      closeInDays: 45,
      temperature: 'HOT',
      status: 'IN-PROGRESS',
      stage: 'Key Person Identified',
    },
    {
      id: 'sample-lead-island-retail',
      person: 'Fathimath Shifa',
      client: 'Island Mart Holdings',
      title: 'Multi-location retail property package',
      value: 6800000,
      currency: 'MVR',
      insuranceClass: 'Fire',
      productCode: 'PR',
      closeInDays: 52,
      temperature: 'WARM',
      status: 'TO-DO',
      stage: 'Lead Identified',
    },
    {
      id: 'sample-lead-maldives-air-charter',
      person: 'Ahmed Zameer',
      client: 'Maldives Air Charter',
      title: 'Airport liability and aviation support services',
      value: 72000,
      currency: 'USD',
      insuranceClass: 'Miscellaneous',
      productCode: 'AL',
      closeInDays: 67,
      temperature: 'COLD',
      status: 'COMPLETED',
      stage: 'Lead Identified',
    },
    {
      id: 'sample-lead-hulhumale-medical',
      person: 'Dr. Mariyam Saeed',
      client: 'Hulhumale Medical Centre',
      title: 'Professional indemnity for clinical operations',
      value: 36000,
      currency: 'USD',
      insuranceClass: 'Miscellaneous',
      productCode: 'PN',
      closeInDays: 24,
      temperature: 'HOT',
      status: 'IN-PROGRESS',
      stage: 'Intro Email Sent',
    },
    {
      id: 'sample-lead-seafood-export',
      person: 'Mohamed Fikry',
      client: 'Blue Current Seafood Exporters',
      title: 'Export cargo stock and transit protection',
      value: 2750000,
      currency: 'MVR',
      insuranceClass: 'Marine',
      productCode: 'EP',
      closeInDays: 76,
      temperature: 'WARM',
      status: 'COMPLETED',
      stage: 'Contact Made',
    },
    {
      id: 'sample-lead-capital-holdings',
      person: 'Nadheem Ali',
      client: 'Capital Holdings Maldives',
      title: 'Performance bond facility for public works',
      value: 12500000,
      currency: 'MVR',
      insuranceClass: 'Bonds',
      productCode: 'CB',
      closeInDays: 90,
      temperature: 'COLD',
      status: 'BACKLOG',
      stage: 'Lead Identified',
    },
  ];

  return definitions.map((definition, index) => lead({
    ...definition,
    ownerId: ownerIds[index % ownerIds.length],
    today,
  }));
}

export function createSampleLeadActivities(leads: Lead[], today = new Date()): Activity[] {
  return leads.flatMap((lead) => {
    const stageIndex = Math.max(0, LEAD_ACTIVE_STAGES.indexOf(lead.funnelStage as (typeof LEAD_ACTIVE_STAGES)[number]));
    const createdAt = Date.parse(lead.createdAt ?? '');
    const stageChangedAt = Date.parse(lead.stageChangedAt ?? '');
    if (!Number.isFinite(createdAt) || !Number.isFinite(stageChangedAt) || stageChangedAt < createdAt) {
      throw new Error(`Sample lead ${lead.id} has invalid lifecycle timestamps.`);
    }

    const stageTransitions: Activity[] = [];
    let transitionAt = createdAt;
    for (let index = 1; index <= stageIndex; index += 1) {
      transitionAt += (1 + ((SAMPLE_LEAD_IDS.indexOf(lead.id as (typeof SAMPLE_LEAD_IDS)[number]) + index - 1) % 3)) * DAY_MS;
      stageTransitions.push({
        id: `sample-activity-${lead.id}-stage-${index}`,
        clientId: lead.clientId ?? '',
        leadId: lead.id,
        type: 'note',
        title: `Lead stage changed: ${LEAD_ACTIVE_STAGES[index - 1]} → ${LEAD_ACTIVE_STAGES[index]}`,
        description: `Sample progression to ${LEAD_ACTIVE_STAGES[index]}.`,
        date: new Date(transitionAt).toISOString(),
        createdAt: new Date(transitionAt).toISOString(),
        userId: lead.ownerId,
      });
    }
    if (transitionAt !== stageChangedAt) {
      throw new Error(`Sample lead ${lead.id} stage history does not end at its current stage timestamp.`);
    }

    const firstStageDuration = stageIndex ? Date.parse(stageTransitions[0].date) - createdAt : stageChangedAt - createdAt;
    const touchpointAt = createdAt + Math.floor(firstStageDuration / 2);
    const taskAt = stageChangedAt + Math.floor((today.getTime() - stageChangedAt) / 2);
    const touchpoint: Activity = {
      id: `sample-activity-${lead.id}-touchpoint`,
      clientId: lead.clientId ?? '',
      leadId: lead.id,
      type: 'call',
      title: 'Introductory client call',
      description: 'Discussed the client’s insurance needs and agreed on a follow-up.',
      date: new Date(touchpointAt).toISOString(),
      createdAt: new Date(touchpointAt).toISOString(),
      userId: lead.ownerId,
    };
    const taskUpdate: Activity = {
      id: `sample-activity-${lead.id}-task`,
      clientId: lead.clientId ?? '',
      leadId: lead.id,
      type: 'task',
      title: 'Follow-up task updated',
      description: 'Updated the next action after reviewing the client discussion.',
      date: new Date(taskAt).toISOString(),
      createdAt: new Date(taskAt).toISOString(),
      userId: lead.ownerId,
    };
    return [...stageTransitions, touchpoint, taskUpdate];
  });
}

/**
 * Adds or refreshes only the sample Leads, preserving all other Leads in the tenant.
 * The caller must be signed in as a System Admin or Sales user.
 */
export async function initializeSampleLeads(ownerIds: string[], today = new Date()): Promise<Lead[]> {
  const samples = createSampleLeads(ownerIds, today);
  const { data, error: readError } = await supabase
    .from('tenant_records')
    .select('data')
    .eq('tenant_id', TENANT_ID)
    .eq('resource', 'leads');

  if (readError) throw new Error(`Could not read existing Leads: ${readError.message}`);

  const sampleIdSet = new Set<string>(SAMPLE_LEAD_IDS);
  const existing = (data ?? [])
    .map((record) => record.data as unknown as Lead)
    .filter((record): record is Lead => Boolean(record && typeof record.id === 'string' && record.id.trim() && !sampleIdSet.has(record.id)));
  const merged = [...existing, ...samples]
    .filter((record): record is Lead => Boolean(record && typeof record.id === 'string' && record.id.trim()))
    .map((record) => ({ ...record, id: record.id.trim() }));
  const { error: writeError } = await supabase.rpc('sync_tenant_records', {
    p_resource: 'leads',
    p_records: merged,
  });

  if (writeError) throw new Error(`Could not seed sample Leads: ${writeError.message}`);
  return samples;
}
