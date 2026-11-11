import type {
  Activity, Client, Deal, Invoice, Lead, Payment, Pipeline, PipelineStage,
  ProductCode, QuotationRequest, StageHistoryAudit, TaxRate, User, Vendor,
} from '../types';
import { COMPANY, PRODUCT_CODES } from '../data/catalogs.ts';
import { DEAL_PIPELINE_STAGES, getPipelineStageTemplate } from '../data/pipelineStageTemplates.ts';
import { createDefaultCustomerLookups, type CustomerLookups } from '../data/customerLookups.ts';
import { appendLeadStageTransition, type LeadLifecycleStage } from '../utils/leadLifecycle.ts';
import { createLeadOrganization } from '../utils/customerProfile.ts';
import { isValidEmail, isValidPhoneNumber } from '../utils/communication.ts';
import { DEFAULT_USD_TO_MVR_RATE } from '../utils/currency.ts';

const TENANT_ID = 'demo-tenant';
const DEMO_EMAIL_TEMPLATES = Object.fromEntries([
  'Renewal Reminder (30/60/90)', 'Quotation Sent', 'Invoice Issued', 'Payment Receipt', 'Payment Overdue',
].map((name) => [name, '']));

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

const DEMO_LEAD_SCENARIOS: Array<{
  organization: string;
  title: string;
  contact: string;
  email: string;
  phone: string;
  productCode: string;
  amount: number;
  currency: 'MVR' | 'USD';
  stagePath: LeadLifecycleStage[];
  transitionDays: number[];
  lossReason?: string;
}> = [
  {
    organization: 'North Channel Transport Co.',
    title: 'Inter-island ferry hull renewal',
    contact: 'Aminath Shareef',
    email: 'aminath.shareef@northchannel.example',
    phone: '+9607771001',
    productCode: 'HR',
    amount: 12500000,
    currency: 'MVR',
    stagePath: [],
    transitionDays: [],
  },
  {
    organization: 'Lagoon Crest Resorts Pvt Ltd',
    title: 'Resort property all-risks placement',
    contact: 'Ibrahim Waheed',
    email: 'ibrahim.waheed@lagooncrest.example',
    phone: '+9607771002',
    productCode: 'PR',
    amount: 38500000,
    currency: 'MVR',
    stagePath: ['Contact Made'],
    transitionDays: [8],
  },
  {
    organization: 'Atoll Health Services Pvt Ltd',
    title: 'Group medical cover for resort staff',
    contact: 'Fathimath Nisha',
    email: 'fathimath.nisha@atollhealth.example',
    phone: '+9607771003',
    productCode: 'SI',
    amount: 4750000,
    currency: 'MVR',
    stagePath: ['Contact Made', 'Key Person Identified'],
    transitionDays: [5, 14],
  },
  {
    organization: 'Capital Island Logistics Pvt Ltd',
    title: 'Commercial motor fleet renewal',
    contact: 'Mohamed Rasheed',
    email: 'mohamed.rasheed@capitalisland.example',
    phone: '+9607771004',
    productCode: 'MV',
    amount: 6200000,
    currency: 'MVR',
    stagePath: ['Contact Made', 'Key Person Identified', 'Intro Email Sent'],
    transitionDays: [4, 11, 18],
  },
  {
    organization: 'South Reef Construction Pvt Ltd',
    title: 'Harbour extension contractors all risks',
    contact: 'Hassan Jaleel',
    email: 'hassan.jaleel@southreef.example',
    phone: '+9607771005',
    productCode: 'NC',
    amount: 24000000,
    currency: 'MVR',
    stagePath: ['Contact Made', 'Key Person Identified', 'Intro Email Sent', 'Meetings Ongoing'],
    transitionDays: [3, 10, 17, 26],
  },
  {
    organization: 'Coral Route Excursions Pvt Ltd',
    title: 'Public liability for marine excursions',
    contact: 'Zahra Latheef',
    email: 'zahra.latheef@coralroute.example',
    phone: '+9607771006',
    productCode: 'TL',
    amount: 2800000,
    currency: 'MVR',
    stagePath: ['Contact Made', 'Lost'],
    transitionDays: [6, 21],
    lossReason: 'Client renewed directly with the incumbent insurer.',
  },
];

export interface DemoSeed {
  company: typeof COMPANY;
  users: User[];
  products: ProductCode[];
  taxRates: TaxRate[];
  emailTemplates: Record<string, string>;
  pipelines: Pipeline[];
  pipelineStages: PipelineStage[];
  vendors: Vendor[];
  customerLookups: CustomerLookups;
  clients: Client[];
  leads: Lead[];
  deals: Deal[];
  quotationRequests: QuotationRequest[];
  invoices: Invoice[];
  payments: Payment[];
  activities: Activity[];
  stageHistory: StageHistoryAudit[];
}

export function createDemoSeed(now = Date.now(), includeLeads = false): DemoSeed {
  const timestamp = new Date(now).toISOString();
  const company = {
    ...COMPANY,
    name: 'CRM Executive Demo',
    legalName: 'CRM Executive Demo Limited',
    address: 'Male, Republic of Maldives',
    email: 'hello@crm-executive.demo',
    phone: '+960 300 0000',
    registration: 'DEM-0001',
    requireNextActivityForStageChange: true,
    leadStageSlaDays: { ...COMPANY.leadStageSlaDays },
  };
  const users: User[] = [
    { id: 'demo-admin', name: 'Demo Administrator', email: 'admin@crm-executive.demo', role: 'admin', title: 'System Administrator' },
    { id: 'demo-sales', name: 'Demo Sales Lead', email: 'sales@crm-executive.demo', role: 'sales', title: 'Sales Manager' },
    { id: 'demo-finance', name: 'Demo Finance Lead', email: 'finance@crm-executive.demo', role: 'finance', title: 'Finance Manager' },
  ];
  const products: ProductCode[] = PRODUCT_CODES.map((product) => ({ ...product, id: product.code }));
  const taxRates: TaxRate[] = [
    { id: 'demo-tax-standard-gst', name: 'GST 8%', rate: 8, category: 'Standard', active: true },
  ];
  const emailTemplates = { ...DEMO_EMAIL_TEMPLATES };
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
  const customerLookups = createDefaultCustomerLookups();
  const salesOwner = users.find((user) => user.role === 'sales');
  if (!salesOwner) throw new Error('Demo seed must include a sales owner.');
  const { clients, leads } = includeLeads
    ? createDemoLeads(now, products, salesOwner)
    : { clients: [] as Client[], leads: [] as Lead[] };
  const deals: Deal[] = [];
  const quotationRequests: QuotationRequest[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const activities: Activity[] = [];
  const stageHistory: StageHistoryAudit[] = [];

  return {
    company,
    users,
    products,
    taxRates,
    emailTemplates,
    pipelines,
    pipelineStages,
    vendors,
    customerLookups,
    clients,
    leads,
    deals,
    quotationRequests,
    invoices,
    payments,
    activities,
    stageHistory,
  };
}

function createDemoLeads(now: number, products: ProductCode[], owner: User) {
  if (owner.role !== 'sales') throw new Error('Demo lead owner must have the sales role.');
  const createdAt = new Date(now - 60 * 86400000).toISOString();
  const expectedCloseDate = new Date(now + 90 * 86400000).toISOString().slice(0, 10);
  const records = DEMO_LEAD_SCENARIOS.map((scenario, index) => {
    const product = products.find((candidate) => candidate.code === scenario.productCode);
    if (!product) throw new Error(`Demo lead product ${scenario.productCode} is missing from the catalog.`);
    if (!isValidEmail(scenario.email) || !isValidPhoneNumber(scenario.phone)) {
      throw new Error(`Demo lead contact details are invalid for ${scenario.organization}.`);
    }

    const leadId = `demo-lead-${index + 1}`;
    const contactProfileId = `demo-contact-${index + 1}`;
    const contactProfile = {
      id: contactProfileId,
      name: scenario.contact,
      role: 'Decision Maker',
      email: scenario.email,
      phone: scenario.phone,
      whatsapp: scenario.phone,
      linkedLeadIds: [leadId],
      linkedDealIds: [],
    };
    const client = createLeadOrganization(
      scenario.organization,
      owner.id,
      {
        tin: `DEMO-${10001 + index}`,
        country: 'Maldives',
        phone: scenario.phone,
        email: scenario.email,
        address: `Boduthakurufaanu Magu, Male, Maldives`,
        contactPerson: scenario.contact,
        contacts: [contactProfile],
        productCode: product.code,
        class: product.category,
        tags: [],
        accountStatus: 'active',
      },
      `demo-client-${index + 1}`,
    );
    const valueMvr = scenario.currency === 'USD'
      ? scenario.amount * DEFAULT_USD_TO_MVR_RATE
      : scenario.amount;
    let lead: Lead = {
      id: leadId,
      createdAt,
      updatedAt: new Date(now).toISOString(),
      stageChangedAt: createdAt,
      stageHistory: [],
      person: owner.name,
      personId: owner.id,
      contactProfileId,
      contactRole: contactProfile.role,
      clientId: client.id,
      client: client.name,
      title: scenario.title,
      value: scenario.amount,
      valueMvr,
      currency: scenario.currency,
      ...(scenario.currency === 'USD' ? { exchangeRate: DEFAULT_USD_TO_MVR_RATE } : {}),
      pipelineId: 'demo-pipeline-commercial',
      closeDate: expectedCloseDate,
      visibility: 'individual',
      contact: scenario.contact,
      contactEmail: scenario.email,
      contactPhone: scenario.phone,
      whatsapp: scenario.phone,
      telegram: '',
      contacts: [contactProfile],
      source: 'Referral',
      notes: `${scenario.title} - initial scoping discussion.`,
      country: client.country,
      insuranceClass: product.category,
      productCode: product.code,
      temperature: 'WARM',
      status: 'TO-DO',
      funnelStage: 'Lead Identified',
      ...(scenario.lossReason ? { lossReason: scenario.lossReason } : {}),
      renewalDate: expectedCloseDate,
      sumInsured: valueMvr,
      premium: valueMvr,
      ownerId: owner.id,
      lastActivity: 'Seeded demo lead',
      routedAt: createdAt,
    };

    for (const [transitionIndex, toStage] of scenario.stagePath.entries()) {
      const enteredAt = new Date(
        Date.parse(createdAt) + scenario.transitionDays[transitionIndex] * 86400000,
      ).toISOString();
      const stageHistory = appendLeadStageTransition(lead, toStage, enteredAt);
      lead = { ...lead, funnelStage: toStage, stageChangedAt: enteredAt, stageHistory };
    }
    if (scenario.lossReason) lead = { ...lead, disposition: 'lost' };

    return { client, lead };
  });

  return {
    clients: records.map(({ client }) => client),
    leads: records.map(({ lead }) => lead),
  };
}
