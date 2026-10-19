import type { Pipeline, PipelineStage } from '../types';

export const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';

export const DEFAULT_PIPELINES: Pipeline[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    tenantId: DEMO_TENANT_ID,
    name: 'Commercial Lines Pipeline',
    code: 'COMMERCIAL',
    isActive: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    tenantId: DEMO_TENANT_ID,
    name: 'Policy Renewal Pipeline',
    code: 'RENEWAL',
    isActive: true,
  },
];

const COMMERCIAL_ID = DEFAULT_PIPELINES[0].id;
const RENEWAL_ID = DEFAULT_PIPELINES[1].id;

function stages(
  pipelineId: string,
  defs: [string, number, number][],
  uuidPrefix: string,
): PipelineStage[] {
  return defs.map(([name, winProbabilityPct, stagnationDaysThreshold], index) => ({
    id: `${uuidPrefix}${String(index + 1).padStart(12, '0')}`,
    pipelineId,
    name,
    stageOrder: index + 1,
    winProbabilityPct,
    stagnationDaysThreshold,
  }));
}

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  ...stages(COMMERCIAL_ID, [
    ['Qualified (Discovery)', 20, 7],
    ['Solution Alignment (Demo/Quote Request)', 40, 10],
    ['Proposal / Business Case', 60, 10],
    ['Negotiation & Legal (MIRA Compliance)', 80, 14],
    ['Closed-Won', 100, 0],
    ['Closed-Lost', 0, 0],
  ], '20000000-0000-4000-8000-'),
  ...stages(RENEWAL_ID, [
    ['Renewal Identification (90 Days)', 20, 14],
    ['Health Check & Scope Review', 40, 14],
    ['Renewal Quote Sent', 70, 10],
    ['Payment & Policy Issued', 100, 0],
  ], '30000000-0000-4000-8000-'),
];
