import type { Activity, Client, Deal, Lead, Pipeline, PipelineStage, StageHistoryAudit, User } from '../types';
import { PRODUCT_CODES } from '../data/catalogs';
import { TENANT_ID } from './supabase';

const DEMO_PIPELINES: Pipeline[] = [
  { id: 'ui-test-pipeline-commercial', tenantId: TENANT_ID, name: 'Commercial Property', code: 'COMMERCIAL_ENG', isActive: true },
  { id: 'ui-test-pipeline-marine', tenantId: TENANT_ID, name: 'Marine Cargo', code: 'MARINE_CARGO', isActive: true },
  { id: 'ui-test-pipeline-liability', tenantId: TENANT_ID, name: 'Casualty Liability', code: 'CASUALTY_LIABILITY', isActive: true },
];

const STAGE_NAMES = [
  'Fact-Finding & Risk Survey',
  'Market Placement / Outender',
  'Quote Comparison & Presentation',
  'Underwriter Negotiation',
  'Policy Bound / won',
  'Lost / Declined',
] as const;

function daysAgo(days: number, hours = 0) {
  return new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export function createSampleWorkspace(owner: User): {
  leads: Lead[];
  deals: Deal[];
  clients: Client[];
  activities: Activity[];
  pipelines: Pipeline[];
  pipelineStages: PipelineStage[];
  stageHistory: StageHistoryAudit[];
} {
  const stages = DEMO_PIPELINES.flatMap((pipeline) => STAGE_NAMES.map((name, index) => ({
    id: `${pipeline.id}-stage-${index + 1}`,
    pipelineId: pipeline.id,
    name,
    stageOrder: index + 1,
    winProbabilityPct: [20, 40, 60, 80, 100, 0][index],
    stagnationDaysThreshold: index === 5 ? 0 : 14,
  })));
  const contactProfiles = (
    prefix: string,
    linkedLeadId: string,
    linkedDealId: string,
    primaryContact: { name: string; email: string; phone: string; telegram: string },
  ) => [
    { id: `${prefix}-contact-01`, ...primaryContact, role: 'Decision Maker', whatsapp: primaryContact.phone, linkedLeadIds: [linkedLeadId], linkedDealIds: [linkedDealId] },
    ...Array.from({ length: 11 }, (_, index) => ({
      id: `${prefix}-contact-${String(index + 2).padStart(2, '0')}`,
      name: `Key Person ${index + 2}`,
      role: ['Finance Director', 'Operations Manager', 'Risk Manager'][index % 3],
      email: `contact${index + 2}@${prefix}.example.test`,
      phone: `+960 777 ${String(1100 + index).slice(-4)}`,
      whatsapp: `+960 777 ${String(1100 + index).slice(-4)}`,
      telegram: `@${prefix}contact${index + 2}`,
      linkedLeadIds: [linkedLeadId],
      linkedDealIds: [linkedDealId],
    })),
  ];

  const clients: Client[] = [
    {
      id: 'ui-test-client-cf',
      name: 'Lagoon View Resort',
      tin: 'TST-CF-001',
      country: 'Maldives',
      phone: '+960 777 0101',
      email: 'office@lagoonview.example.test',
      address: 'Hulhumale, Maldives',
      contactPerson: 'Aishath Mariyam',
      contacts: contactProfiles('lagoon', 'ui-test-lead-cf', 'ui-test-deal-cf', { name: 'Aishath Mariyam', email: 'aishath.mariyam@example.test', phone: '+960 777 0101', telegram: '@aishathm' }),
      sumInsured: 25000000,
      premium: 375000,
      expiry: inDays(90).slice(0, 10),
      insurer: 'Island Assurance',
      productCode: 'CF',
      class: 'Fire',
      ownerId: owner.id,
      tags: ['HOT', 'UI TEST'],
      accountStatus: 'active',
    },
    {
      id: 'ui-test-client-sh',
      name: 'Oceanic Vessel Services',
      tin: 'TST-SH-002',
      country: 'Maldives',
      phone: '+960 777 0202',
      email: 'marine@oceanic.example.test',
      address: 'Male, Maldives',
      contactPerson: 'Ibrahim Rasheed',
      contacts: contactProfiles('oceanic', 'ui-test-lead-sh', 'ui-test-deal-sh', { name: 'Ibrahim Rasheed', email: 'ibrahim.rasheed@example.test', phone: '+960 777 0202', telegram: '@ibrahimr' }),
      sumInsured: 12500000,
      premium: 312500,
      expiry: inDays(120).slice(0, 10),
      insurer: 'Atoll Marine Underwriters',
      productCode: 'SH',
      class: 'Marine',
      ownerId: owner.id,
      tags: ['WARM', 'UI TEST'],
      accountStatus: 'active',
    },
    {
      id: 'ui-test-client-tl',
      name: 'Coral Bay Hospitality',
      tin: 'TST-TL-003',
      country: 'Maldives',
      phone: '+960 777 0303',
      email: 'admin@coralbay.example.test',
      address: 'Addu City, Maldives',
      contactPerson: 'Fathimath Shifa',
      contacts: contactProfiles('coralbay', 'ui-test-lead-tl', 'ui-test-deal-tl', { name: 'Fathimath Shifa', email: 'fathimath.shifa@example.test', phone: '+960 777 0303', telegram: '@fathimaths' }),
      sumInsured: 8000000,
      premium: 160000,
      expiry: inDays(150).slice(0, 10),
      insurer: 'Southern Cross Insurance',
      productCode: 'TL',
      class: 'Miscellaneous',
      ownerId: owner.id,
      tags: ['COLD', 'UI TEST'],
      accountStatus: 'active',
    },
  ];

  const leadDefinitions = [
    { id: 'ui-test-lead-cf', clientId: 'ui-test-client-cf', client: 'Lagoon View Resort', title: 'Commercial property and fire renewal', contact: 'Aishath Mariyam', productCode: 'CF', insuranceClass: 'Fire', temperature: 'HOT' as const, stage: 'Meetings Ongoing', amount: 25000000 },
    { id: 'ui-test-lead-sh', clientId: 'ui-test-client-sh', client: 'Oceanic Vessel Services', title: 'Hull insurance placement', contact: 'Ibrahim Rasheed', productCode: 'SH', insuranceClass: 'Marine', temperature: 'WARM' as const, stage: 'Contact Made', amount: 12500000 },
    { id: 'ui-test-lead-tl', clientId: 'ui-test-client-tl', client: 'Coral Bay Hospitality', title: 'Third-party liability programme', contact: 'Fathimath Shifa', productCode: 'TL', insuranceClass: 'Miscellaneous', temperature: 'COLD' as const, stage: 'Lead Identified', amount: 8000000 },
  ];

  const leads: Lead[] = leadDefinitions.map((definition, index) => {
    const client = clients[index];
    const { stage, amount, ...leadFields } = definition;
    return {
      ...leadFields,
      person: leadFields.contact,
      clientId: client.id,
      value: amount,
      valueMvr: amount,
      createdAt: daysAgo(index + 3),
      currency: 'MVR',
      pipelineId: DEMO_PIPELINES[index].id,
      closeDate: inDays(20 + index * 10).slice(0, 10),
      visibility: 'individual',
      contactEmail: client.contacts?.[0].email,
      contactPhone: client.phone,
      whatsapp: client.contacts?.[0].whatsapp,
      telegram: client.contacts?.[0].telegram,
      contactProfileId: client.contacts?.[0].id,
      contactRole: client.contacts?.[0].role,
      contact: leadFields.contact,
      funnelStage: stage,
      country: client.country,
      source: 'UI test fixture',
      notes: 'Sample lead for detail layout and stage tracking.',
      renewalDate: client.expiry,
      sumInsured: client.sumInsured,
      premium: client.premium,
      ownerId: owner.id,
      status: index === 0 ? 'IN-PROGRESS' : 'TO-DO',
      lastActivity: 'Sample activity',
      routedAt: daysAgo(index, 2),
      stageChangedAt: daysAgo(index, 2),
      ...(index === 0 ? { dealId: 'ui-test-deal-cf' } : {}),
    };
  });

  const deals: Deal[] = leadDefinitions.map((definition, index) => {
    const stage = stages.find((item) => item.pipelineId === DEMO_PIPELINES[index].id && item.stageOrder === index + 1);
    const product = PRODUCT_CODES.find((item) => item.code === definition.productCode);
    if (!stage || !product) {
      throw new Error(`Could not create sample deal for ${definition.productCode}: configured stage or product is missing.`);
    }
    return {
      id: `ui-test-deal-${['cf', 'sh', 'tl'][index]}`,
      ...(index === 0 ? { leadId: definition.id } : {}),
      pipelineId: DEMO_PIPELINES[index].id,
      createdAt: daysAgo(index + 1),
      stageChangedAt: daysAgo(index, index + 1),
      client: definition.client,
      clientId: definition.clientId,
      product: product.name,
      productCode: definition.productCode,
      value: definition.amount,
      weighted: Math.round(definition.amount * stage.winProbabilityPct / 100),
      currency: 'MVR',
      stage: stage.name,
      probability: stage.winProbabilityPct,
      ownerId: owner.id,
      closeDate: inDays(20 + index * 10).slice(0, 10),
      insurer: clients[index].insurer,
      contactName: definition.contact,
      contactProfileId: clients[index].contacts?.[0].id,
      contactRole: clients[index].contacts?.[0].role,
      contactEmail: clients[index].contacts?.[0].email,
      contactPhone: clients[index].phone,
      whatsapp: clients[index].contacts?.[0].whatsapp,
      telegram: clients[index].contacts?.[0].telegram,
      source: 'UI test fixture',
      notes: 'Sample deal for detail layout and stage tracking.',
    };
  });

  const stageHistory: StageHistoryAudit[] = deals.map((deal, index) => {
    const stage = stages.find((item) => item.pipelineId === deal.pipelineId && item.name === deal.stage);
    if (!stage) {
      throw new Error(`Could not create stage history for sample deal ${deal.id}: its current stage is missing.`);
    }
    const enteredAt = daysAgo(index, index + 1);
    return {
      id: `ui-test-stage-history-${deal.id}`,
      tenantId: TENANT_ID,
      dealId: deal.id,
      fromStageId: null,
      toStageId: stage.id,
      enteredAt,
      exitedAt: null,
      durationSeconds: null,
    };
  });

  const activityFixtures: Activity[] = [
    { id: 'ui-test-activity-cf-meeting-old', clientId: clients[0].id, leadId: leads[0].id, dealId: deals[0].id, type: 'meeting', title: 'Initial placement meeting', description: 'Reviewed locations, asset values and renewal requirements.', date: daysAgo(5, 2), userId: owner.id, meetingMode: 'Physical Meeting', venue: 'Male office', personsMet: 'Aishath Mariyam, Key Person 2', outcome: 'Risk schedule requested', followUpAction: 'Collect updated asset list', durationMinutes: 45 },
    { id: 'ui-test-activity-cf-note', clientId: clients[0].id, leadId: leads[0].id, dealId: deals[0].id, type: 'note', title: 'Risk schedule received', description: 'Client supplied the updated property schedule.', date: daysAgo(3, 4), userId: owner.id },
    { id: 'ui-test-activity-cf-proposal', clientId: clients[0].id, leadId: leads[0].id, dealId: deals[0].id, insurer: clients[0].insurer, type: 'quote', title: 'Commercial fire proposal', description: 'Property and business interruption terms.', date: daysAgo(2, 1), userId: owner.id, quoteAmount: 375000, quoteCurrency: 'MVR' },
    { id: 'ui-test-activity-cf-meeting-upcoming', clientId: clients[0].id, leadId: leads[0].id, dealId: deals[0].id, type: 'meeting', title: 'Renewal terms review', description: 'Compare terms and confirm cover requirements.', date: inDays(1), userId: owner.id, meetingMode: 'Online', venue: 'Video call', personsMet: 'Aishath Mariyam, Finance Director', outcome: 'Scheduled', followUpAction: 'Prepare comparison', durationMinutes: 30 },
    { id: 'ui-test-activity-sh-meeting', clientId: clients[1].id, leadId: leads[1].id, dealId: deals[1].id, type: 'meeting', title: 'Vessel inspection appointment', description: 'Review vessel information and survey requirements.', date: daysAgo(1, 3), userId: owner.id, meetingMode: 'Site Visit', venue: 'Male harbour', personsMet: 'Ibrahim Rasheed', outcome: 'Survey requested', followUpAction: 'Arrange survey', durationMinutes: 60 },
    { id: 'ui-test-activity-sh-task', clientId: clients[1].id, leadId: leads[1].id, dealId: deals[1].id, type: 'task', title: 'Arrange vessel survey', description: 'Confirm surveyor availability with the client.', date: inDays(2), userId: owner.id },
    { id: 'ui-test-activity-tl-note', clientId: clients[2].id, leadId: leads[2].id, dealId: deals[2].id, type: 'note', title: 'Initial client research', description: 'Prepare liability exposure questions for first contact.', date: daysAgo(0, 6), userId: owner.id },
  ];
  const activities = activityFixtures.map((activity) => ({
    ...activity,
    createdAt: activity.createdAt ?? activity.date,
  }));

  return { leads, deals, clients, activities, pipelines: DEMO_PIPELINES, pipelineStages: stages, stageHistory };
}
