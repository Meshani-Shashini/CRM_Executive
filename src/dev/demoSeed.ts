import type {
  Activity, Client, Deal, Invoice, Lead, Pipeline, PipelineStage,
  QuotationRequest, StageHistoryAudit, Vendor,
} from '../types';
import { DEAL_PIPELINE_STAGES, getPipelineStageTemplate } from '../data/pipelineStageTemplates.ts';

const TENANT_ID = 'demo-tenant';
const OWNER_ID = 'local-development-admin';

const PIPELINE_DEFINITIONS: Array<{
  id: string;
  code: string;
  name: string;
  stages: Array<Pick<PipelineStage, 'name' | 'shortLabel' | 'purpose' | 'winProbabilityPct' | 'stagnationDaysThreshold' | 'isClosedWon' | 'isClosedLost' | 'requiresApproval'>>;
}> = [
  {
    id: 'demo-pipeline-commercial',
    code: 'COMMERCIAL',
    name: 'Commercial Lines Brokerage',
    stages: DEAL_PIPELINE_STAGES,
  },
  {
    id: 'demo-pipeline-sme',
    code: 'SME_VELOCITY',
    name: 'Retail, SME & Velocity Packages',
    stages: DEAL_PIPELINE_STAGES,
  },
  {
    id: 'demo-pipeline-renewals',
    code: 'RENEWALS',
    name: 'Annual Policy Renewals',
    stages: DEAL_PIPELINE_STAGES,
  },
];

export interface DemoSeed {
  pipelines: Pipeline[];
  pipelineStages: PipelineStage[];
  vendors: Vendor[];
  clients: Client[];
  leads: Lead[];
  deals: Deal[];
  quotationRequests: QuotationRequest[];
  invoices: Invoice[];
  activities: Activity[];
  stageHistory: StageHistoryAudit[];
}

export function createDemoSeed(now = Date.now()): DemoSeed {
  const timestamp = new Date(now).toISOString();
  const day = (offset: number) => new Date(now + offset * 86400000).toISOString().slice(0, 10);
  const enteredDaysAgo = (days: number) => new Date(now - days * 86400000).toISOString();
  const pipelines: Pipeline[] = PIPELINE_DEFINITIONS.map(({ id, code, name }) => ({
    id, code, name, tenantId: TENANT_ID, isActive: true,
  }));
  const pipelineStages: PipelineStage[] = PIPELINE_DEFINITIONS.flatMap((pipeline) =>
    pipeline.stages.map((stage, index) => {
      const presentation = getPipelineStageTemplate(pipeline.code, index + 1);
      return {
        ...stage,
        shortLabel: presentation?.shortLabel,
        purpose: presentation?.purpose,
        id: `${pipeline.id}-stage-${index + 1}`,
        pipelineId: pipeline.id,
        stageOrder: index + 1,
      };
    }),
  );
  const vendors: Vendor[] = [
    { id: 'demo-vendor-allied', name: 'Allied Insurance', vendorType: 'Insurer', country: 'Maldives', currency: 'MVR', address: 'Male', email: 'allied@example.test', phone: '+960 7770001', status: 'active', createdAt: timestamp, contacts: [] },
    { id: 'demo-vendor-dhivehi', name: 'Dhivehi Insurance', vendorType: 'Insurer', country: 'Sri Lanka', currency: 'USD', address: 'Colombo', email: 'dhivehi@example.test', phone: '+960 7770002', status: 'active', createdAt: timestamp, contacts: [] },
    { id: 'demo-vendor-reinsure', name: 'Island Reinsurance', vendorType: 'Reinsurer', country: 'Singapore', currency: 'USD', address: 'Singapore', email: 'island-re@example.test', phone: '+960 7770003', status: 'active', createdAt: timestamp, contacts: [] },
    { id: 'demo-vendor-inactive', name: 'Inactive Carrier', vendorType: 'Insurer', country: 'United Arab Emirates', currency: 'USD', address: 'Dubai', email: 'inactive@example.test', phone: '+960 7770004', status: 'inactive', createdAt: timestamp, contacts: [] },
  ];
  const clients: Client[] = Array.from({ length: 4 }, (_, index) => {
    const number = index + 1;
    return {
      id: `demo-client-${number}`,
      name: ['Bonavista Maldives', 'Atoll Trading', 'Lagoon Resorts', 'Coral Construction'][index],
      tin: `TIN-DEMO-${number}`,
      country: ['Maldives', 'Sri Lanka', 'Singapore', 'Maldives'][index],
      phone: `+960 77700${number}1`,
      email: `client${number}@example.test`,
      address: `Demo address ${number}, Male`,
      contactPerson: `Contact ${number}`,
      contacts: [{
        id: `demo-contact-${number}`,
        name: `Contact ${number}`,
        role: 'Decision Maker',
        email: `client${number}@example.test`,
        phone: `+960 77700${number}1`,
        whatsapp: `+960 77700${number}1`,
        telegram: `@demoContact${number}`,
        linkedLeadIds: [],
        linkedDealIds: [],
      }],
      sumInsured: 250000 + number * 50000,
      premium: 12500 + number * 2500,
      expiry: day(120 + number),
      insurer: vendors[number % 3].name,
      productCode: ['NC', 'PR', 'DF', 'CM'][index],
      class: ['Engineering', 'Fire', 'Fire', 'Engineering'][index],
      ownerId: OWNER_ID,
      tags: ['demo'],
      accountStatus: 'active',
    };
  });
  const leadTitles = [
    'Bonavista Maldives - Contractors All Risks',
    'Atoll Trading Property Renewal',
    'Lagoon Resort Fire Cover',
    'Coral Construction Machinery Cover',
    'Male Retail Package',
    'North Harbour Cargo Cover',
    'South Atoll Liability Review',
    'Island Engineering Survey',
  ];
  const clientForLead = [0, 0, 1, 1, 2, 2, 3, 3];
  const pipelineForLead = [0, 0, 1, 1, 1, 2, 2, 0];
  const leads: Lead[] = leadTitles.map((title, index) => {
    const client = clients[clientForLead[index]];
    const contact = client.contacts?.[0];
    return {
      id: `demo-lead-${index + 1}`,
      createdAt: enteredDaysAgo(30 - index),
      client: client.name,
      clientId: client.id,
      title,
      value: 250000 + index * 35000,
      ...(index !== 7 ? { currency: index % 2 ? 'USD' as const : 'MVR' as const } : {}),
      ...(index % 2 ? { exchangeRate: 15.42 } : {}),
      pipelineId: pipelines[pipelineForLead[index]].id,
      closeDate: day(45 + index),
      contact: contact?.name ?? '',
      contactProfileId: contact?.id,
      contactRole: contact?.role,
      contactEmail: contact?.email,
      contactPhone: contact?.phone,
      whatsapp: contact?.whatsapp,
      telegram: contact?.telegram,
      contacts: [],
      source: 'Demo seed',
      notes: 'Seeded only for local UI verification.',
      country: client.country,
      insuranceClass: client.class,
      productCode: client.productCode,
      temperature: index === 0 ? 'HOT' : index < 4 ? 'WARM' : 'COLD',
      status: 'IN-PROGRESS',
      funnelStage: 'L3: Qualified Opportunity',
      renewalDate: day(120 + index),
      sumInsured: client.sumInsured,
      premium: client.premium,
      ownerId: OWNER_ID,
      lastActivity: enteredDaysAgo(index),
    };
  });
  const deals: Deal[] = [
    {
      id: 'demo-deal-1', pipelineId: pipelines[0].id, createdAt: enteredDaysAgo(50),
      stageChangedAt: enteredDaysAgo(25), client: clients[0].name, clientId: clients[0].id,
      product: 'Contractors All Risks', productCode: 'NC', value: 500000, weighted: 200000,
      currency: 'MVR', stage: 'Quotation / Underwriting', probability: 70,
      ownerId: OWNER_ID, closeDate: day(30), insurer: vendors[0].name, vendorId: vendors[0].id,
      leadId: leads[0].id, contactName: leads[0].contact, contactEmail: leads[0].contactEmail,
      contactPhone: leads[0].contactPhone, whatsapp: leads[0].whatsapp, telegram: leads[0].telegram,
      proposalSummary: leads[0].title, source: 'Demo seed', notes: 'Stagnating deal for SLA checks.',
    },
    {
      id: 'demo-deal-2', pipelineId: pipelines[0].id, createdAt: enteredDaysAgo(9),
      stageChangedAt: enteredDaysAgo(3), client: clients[1].name, clientId: clients[1].id,
      product: 'Property All Risk', productCode: 'PR', value: 320000, weighted: 192000,
      currency: 'USD', exchangeRate: 15.42, stage: 'Quoted / Proposed', probability: 80,
      ownerId: OWNER_ID, closeDate: day(40), insurer: vendors[1].name, vendorId: vendors[1].id,
      leadId: leads[1].id, contactName: leads[1].contact, contactEmail: leads[1].contactEmail,
      contactPhone: leads[1].contactPhone, whatsapp: leads[1].whatsapp, telegram: leads[1].telegram,
      proposalSummary: leads[1].title, source: 'Demo seed',
    },
    {
      id: 'demo-deal-3', pipelineId: pipelines[1].id, createdAt: enteredDaysAgo(60),
      stageChangedAt: enteredDaysAgo(18), client: clients[2].name, clientId: clients[2].id,
      product: 'Dwelling Fire', productCode: 'DF', value: 280000, weighted: 280000,
      currency: 'MVR', stage: 'Review and Follow up', probability: 100,
      ownerId: OWNER_ID, closeDate: day(-5), insurer: vendors[0].name, vendorId: vendors[0].id,
      leadId: leads[2].id, disposition: 'won', proposalSummary: leads[2].title, source: 'Demo seed',
    },
    {
      id: 'demo-deal-4', pipelineId: pipelines[2].id, createdAt: enteredDaysAgo(55),
      stageChangedAt: enteredDaysAgo(35), client: clients[3].name, clientId: clients[3].id,
      product: 'Comprehensive Machinery', productCode: 'CM', value: 175000, weighted: 0,
      currency: 'USD', exchangeRate: 15.42, stage: 'Review and Follow up', probability: 0,
      ownerId: OWNER_ID, closeDate: day(-12), insurer: vendors[2].name, vendorId: vendors[2].id,
      leadId: leads[3].id, disposition: 'lost', lossReason: 'Demo loss reason',
      proposalSummary: leads[3].title, source: 'Demo seed',
    },
    {
      id: 'demo-deal-5', pipelineId: pipelines[1].id, createdAt: enteredDaysAgo(5),
      stageChangedAt: enteredDaysAgo(1), client: clients[2].name, clientId: clients[2].id,
      product: 'Dwelling Fire', productCode: 'DF', value: 90000, weighted: 45000,
      currency: 'MVR', stage: 'Quoted / Proposed', probability: 80,
      ownerId: OWNER_ID, closeDate: day(20), insurer: vendors[2].name, vendorId: vendors[2].id,
      leadId: leads[4].id, contactName: leads[4].contact, contactEmail: leads[4].contactEmail,
      contactPhone: leads[4].contactPhone, whatsapp: leads[4].whatsapp, telegram: leads[4].telegram,
      proposalSummary: leads[4].title, source: 'Demo seed',
    },
  ];
  for (const deal of deals) {
    const lead = leads.find((item) => item.id === deal.leadId);
    if (lead) {
      lead.dealId = deal.id;
      lead.pipelineId = deal.pipelineId;
      lead.disposition = deal.disposition === 'won' ? 'converted' : lead.disposition;
      if (deal.disposition === 'won') lead.funnelStage = 'Converted to deal';
    }
  }
  const quotationRequests: QuotationRequest[] = [
    { id: 'demo-qr-1', ref: 'QR-2026-0001', dealId: deals[0].id, leadId: leads[0].id, clientId: clients[0].id, vendorIds: [vendors[0].id], productCode: deals[0].productCode ?? 'NC', sumInsured: deals[0].value, currency: deals[0].currency, requiredBy: day(14), notes: 'Draft request.', status: 'Draft', createdBy: OWNER_ID, createdAt: timestamp, updatedAt: timestamp },
    { id: 'demo-qr-2', ref: 'QR-2026-0002', dealId: deals[1].id, leadId: leads[1].id, clientId: clients[1].id, vendorIds: [vendors[1].id], productCode: deals[1].productCode ?? 'PR', sumInsured: deals[1].value, currency: deals[1].currency, requiredBy: day(10), notes: 'Sent request.', status: 'Sent', createdBy: OWNER_ID, createdAt: timestamp, updatedAt: timestamp },
    { id: 'demo-qr-3', ref: 'QR-2026-0003', dealId: deals[4].id, leadId: leads[4].id, clientId: clients[2].id, vendorIds: [vendors[2].id], productCode: deals[4].productCode ?? 'DF', sumInsured: deals[4].value, currency: deals[4].currency, requiredBy: day(7), notes: 'Responses received.', status: 'Responses received', createdBy: OWNER_ID, createdAt: timestamp, updatedAt: timestamp },
  ];
  const invoices: Invoice[] = [
    { id: 'demo-invoice-1', number: 'INV-DEMO-001', clientId: clients[0].id, clientName: clients[0].name, insurer: vendors[0].name, policyNo: 'NC-DEMO-1', issueDate: day(-20), dueDate: day(10), status: 'Pending', items: [{ description: 'Commercial premium', qty: 1, unitPrice: 125000, vatRate: 8 }], installments: [], currency: 'MVR', linkedDealId: deals[0].id },
    { id: 'demo-invoice-2', number: 'INV-DEMO-002', clientId: clients[1].id, clientName: clients[1].name, insurer: vendors[1].name, policyNo: 'PR-DEMO-2', issueDate: day(-10), dueDate: day(20), status: 'Paid', items: [{ description: 'Property premium', qty: 1, unitPrice: 2500, vatRate: 8 }], installments: [], currency: 'USD', linkedDealId: deals[1].id },
  ];
  const stageHistory: StageHistoryAudit[] = deals.map((deal) => {
    const stage = pipelineStages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    return {
      id: `demo-history-${deal.id}`,
      tenantId: TENANT_ID,
      dealId: deal.id,
      userId: OWNER_ID,
      userName: 'Demo Administrator',
      fromStageId: null,
      toStageId: stage?.id ?? '',
      enteredAt: deal.stageChangedAt ?? timestamp,
      exitedAt: deal.disposition ? deal.stageChangedAt ?? timestamp : null,
      durationSeconds: deal.disposition ? 86400 : null,
      ...(deal.disposition === 'won' ? { outcome: 'won' as const } : {}),
      ...(deal.disposition === 'lost' ? { outcome: 'lost' as const, lossReason: deal.lossReason } : {}),
    };
  });
  const activities: Activity[] = [{
    id: 'demo-activity-seed',
    clientId: clients[0].id,
    dealId: deals[0].id,
    leadId: leads[0].id,
    type: 'note',
    title: 'Demo seed',
    description: 'Local-only data for browser QA.',
    date: timestamp,
    createdAt: timestamp,
    userId: OWNER_ID,
    actorName: 'Demo Administrator',
  }];
  return { pipelines, pipelineStages, vendors, clients, leads, deals, quotationRequests, invoices, activities, stageHistory };
}
