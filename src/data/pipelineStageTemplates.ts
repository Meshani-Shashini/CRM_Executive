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

export const PIPELINE_TEMPLATES: Record<string, PipelineTemplate> = {
  commercialDefault: {
    code: 'COMMERCIAL',
    name: 'Commercial Lines Brokerage',
    stages: [
      { name: 'Fact-Finding & Risk Survey', shortLabel: 'Risk Survey', purpose: 'Assess client risks and confirm underwriting requirements.', winProbabilityPct: 20, stagnationDaysThreshold: 10, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Market Tender & Placing Slip Submission', shortLabel: 'Market Tender', purpose: 'Prepare the submission and approach suitable insurers.', winProbabilityPct: 40, stagnationDaysThreshold: 14, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Comparative Analysis & Presentation', shortLabel: 'Quote Comparison', purpose: 'Compare insurer terms and present options to the client.', winProbabilityPct: 60, stagnationDaysThreshold: 7, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Underwriter Negotiation & Structuring', shortLabel: 'Negotiation', purpose: 'Refine coverage, pricing, and terms with underwriters.', winProbabilityPct: 80, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: true },
      { name: 'Policy Bound / Won', shortLabel: 'Bound', purpose: 'Confirm policy placement and issue binding documentation.', winProbabilityPct: 100, stagnationDaysThreshold: 0, isClosedWon: true, isClosedLost: false, requiresApproval: false },
      { name: 'Lost / Market Declined', shortLabel: 'Lost', purpose: 'Record why the placement did not proceed.', winProbabilityPct: 0, stagnationDaysThreshold: 0, isClosedWon: false, isClosedLost: true, requiresApproval: false },
    ],
  },
  smeRetailFastTrack: {
    code: 'SME_VELOCITY',
    name: 'Retail, SME & Velocity Packages',
    stages: [
      { name: 'Intake & Automated Rating', shortLabel: 'Intake & Rating', purpose: 'Capture risk details and calculate package pricing.', winProbabilityPct: 25, stagnationDaysThreshold: 2, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Standard Package Quoted', shortLabel: 'Package Quoted', purpose: 'Present package terms and premium to the client.', winProbabilityPct: 50, stagnationDaysThreshold: 3, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Client Confirmation', shortLabel: 'Confirmation', purpose: 'Confirm client acceptance and prepare payment.', winProbabilityPct: 80, stagnationDaysThreshold: 2, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Payment & Immediate Cover', shortLabel: 'Paid & Covered', purpose: 'Verify payment and confirm immediate cover.', winProbabilityPct: 100, stagnationDaysThreshold: 0, isClosedWon: true, isClosedLost: false, requiresApproval: false },
      { name: 'Closed-Lost', shortLabel: 'Lost', purpose: 'Record why the package sale did not proceed.', winProbabilityPct: 0, stagnationDaysThreshold: 0, isClosedWon: false, isClosedLost: true, requiresApproval: false },
    ],
  },
  annualRenewals: {
    code: 'RENEWALS',
    name: 'Annual Policy Renewals',
    stages: [
      { name: 'Renewal Audit & Loss Review (T-90d)', shortLabel: 'Audit (T-90)', purpose: 'Review the current policy, claims, exposure, and renewal needs.', winProbabilityPct: 30, stagnationDaysThreshold: 10, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Expiring Carrier Terms / Market Re-tender (T-60d)', shortLabel: 'Re-tender (T-60)', purpose: 'Approach the market for competitive renewal terms.', winProbabilityPct: 50, stagnationDaysThreshold: 14, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Renewal Terms Presentation (T-30d)', shortLabel: 'Terms (T-30)', purpose: 'Present renewal terms and changes to the insured.', winProbabilityPct: 70, stagnationDaysThreshold: 7, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Client Renewal Sign-Off (T-15d)', shortLabel: 'Sign-Off (T-15)', purpose: 'Obtain client approval and complete renewal documentation.', winProbabilityPct: 90, stagnationDaysThreshold: 5, isClosedWon: false, isClosedLost: false, requiresApproval: false },
      { name: 'Policy Renewed & Re-Invoiced', shortLabel: 'Renewed', purpose: 'Confirm renewal and issue updated policy documentation.', winProbabilityPct: 100, stagnationDaysThreshold: 0, isClosedWon: true, isClosedLost: false, requiresApproval: false },
      { name: 'Lapsed / Lost to Competitor', shortLabel: 'Lapsed', purpose: 'Record why the policy was not renewed.', winProbabilityPct: 0, stagnationDaysThreshold: 0, isClosedWon: false, isClosedLost: true, requiresApproval: false },
    ],
  },
  claims: {
    code: 'CLAIMS',
    name: 'Claims Management',
    stages: [
      { name: 'Claim Notified', winProbabilityPct: 20, stagnationDaysThreshold: 7 },
      { name: 'Surveyor Assigned', winProbabilityPct: 40, stagnationDaysThreshold: 14 },
      { name: 'Adjuster Assessment', winProbabilityPct: 60, stagnationDaysThreshold: 30 },
      { name: 'Underwriter Settlement', winProbabilityPct: 80, stagnationDaysThreshold: 30 },
      { name: 'Cheque Dispatched', winProbabilityPct: 100, stagnationDaysThreshold: 0 },
    ],
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
