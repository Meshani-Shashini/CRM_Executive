import type { Lead, LeadTemperature, ActivityStatus } from '../types';
import { supabase, TENANT_ID } from './supabase';

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

function dateFromToday(days: number, today = new Date()): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
  return date.toISOString().slice(0, 10);
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

  return {
    id: input.id,
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
    country: 'Maldives',
    insuranceClass: input.insuranceClass,
    productCode: input.productCode,
    temperature: input.temperature,
    status: input.status,
    funnelStage: input.stage,
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
      stage: 'Quoted',
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
      status: 'BACKLOG',
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
      stage: 'Quoted',
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
      status: 'TO-DO',
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
