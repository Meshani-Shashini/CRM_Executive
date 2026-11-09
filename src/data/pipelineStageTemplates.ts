import type { PipelineStage } from '../types';

export type PipelineStageTemplate = Pick<
  PipelineStage,
  | 'name'
  | 'shortLabel'
  | 'purpose'
  | 'winProbabilityPct'
  | 'stagnationDaysThreshold'
  | 'isClosedWon'
  | 'isClosedLost'
  | 'requiresApproval'
>;

export interface PipelineTemplate {
  code: string;
  name: string;
  stages: PipelineStageTemplate[];
}

export const DEAL_PIPELINE_STAGES: PipelineStageTemplate[] = [
  { name: 'Identified', shortLabel: 'Identified', purpose: 'Record a qualified opportunity for follow-up.', winProbabilityPct: 10, stagnationDaysThreshold: 3, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Contact Made', shortLabel: 'Contact Made', purpose: 'Make initial contact with the prospective client.', winProbabilityPct: 20, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Key Person Identified', shortLabel: 'Key Person Identified', purpose: 'Identify the decision-maker or key stakeholder.', winProbabilityPct: 30, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Intro Mail', shortLabel: 'Intro Mail', purpose: 'Send introductory information and establish engagement.', winProbabilityPct: 40, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Meetings', shortLabel: 'Meetings', purpose: 'Meet with stakeholders to understand the opportunity.', winProbabilityPct: 50, stagnationDaysThreshold: 7, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Requirements Identified', shortLabel: 'Requirements Identified', purpose: 'Confirm the client’s insurance and underwriting requirements.', winProbabilityPct: 60, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Quotation / Underwriting', shortLabel: 'Quotation / Underwriting', purpose: 'Obtain insurer terms and complete underwriting review.', winProbabilityPct: 70, stagnationDaysThreshold: 7, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Quoted / Proposed', shortLabel: 'Quoted / Proposed', purpose: 'Present the quotation or proposal to the client.', winProbabilityPct: 80, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: false },
  { name: 'Review and Follow up', shortLabel: 'Review and Follow up', purpose: 'Review the proposal with the client and follow up on next steps.', winProbabilityPct: 90, stagnationDaysThreshold: 3, isClosedWon: false, isClosedLost: false, requiresApproval: false },
];

export const PIPELINE_TEMPLATES: Record<string, PipelineTemplate> = {
  commercialDefault: {
    code: 'COMMERCIAL',
    name: 'Commercial Lines Brokerage',
    stages: DEAL_PIPELINE_STAGES,
  },
  smeRetailFastTrack: {
    code: 'SME_VELOCITY',
    name: 'Retail, SME & Velocity Packages',
    stages: DEAL_PIPELINE_STAGES,
  },
  annualRenewals: {
    code: 'RENEWALS',
    name: 'Annual Policy Renewals',
    stages: DEAL_PIPELINE_STAGES,
  },
  claims: {
    code: 'CLAIMS',
    name: 'Claims Management',
    stages: DEAL_PIPELINE_STAGES,
  },
};

export const PIPELINE_STAGE_SEEDS = Object.fromEntries(
  Object.values(PIPELINE_TEMPLATES).map(({ code, stages }) => [code, stages]),
) as Record<string, PipelineStageTemplate[]>;

export const PIPELINE_LOSS_REASONS: Record<string, string[]> = {
  COMMERCIAL: [
    'Incumbent Retained',
    'Market Capacity Declined',
    'Uncompetitive Deductibles',
    'Self-Insured',
  ],
  SME_VELOCITY: ['Cheaper Direct Carrier', 'Lead Declined', 'Other'],
  RENEWALS: [
    'Competitor Under-Cut Rate',
    'Direct Carrier Approach',
    'Insured Ceased Operations',
  ],
};

export function getPipelineStageTemplate(pipelineCode: string | undefined, stageOrder: number) {
  return pipelineCode
    ? PIPELINE_STAGE_SEEDS[pipelineCode.toUpperCase()]?.[stageOrder - 1]
    : undefined;
}

export function applyPipelineStagePresentation(stage: PipelineStage, pipelineCode: string | undefined): PipelineStage {
  const template = getPipelineStageTemplate(pipelineCode, stage.stageOrder);
  return template ? {
    ...stage,
    shortLabel: template.shortLabel ?? stage.shortLabel,
    purpose: template.purpose ?? stage.purpose,
  } : stage;
}

export function getPipelineLossReasons(pipelineCode: string | undefined) {
  return pipelineCode
    ? PIPELINE_LOSS_REASONS[pipelineCode.toUpperCase()] ?? ['Other']
    : ['Other'];
}
