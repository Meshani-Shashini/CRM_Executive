import { describe, expect, it } from 'vitest';
import { createDemoSeed } from '../dev/demoSeed';
import { DEAL_PIPELINE_STAGES, PIPELINE_TEMPLATES } from './pipelineStageTemplates';

const expectedDealStages = [
  'Identified',
  'Contact Made',
  'Key Person Identified',
  'Intro Mail',
  'Meetings',
  'Requirements Identified',
  'Quotation / Underwriting',
  'Quoted / Proposed',
  'Review and Follow up',
];

describe('active deal pipeline stage configuration', () => {
  it('uses the exact nine stages in order for each active pipeline template', () => {
    expect(DEAL_PIPELINE_STAGES.map((stage) => stage.name)).toEqual(expectedDealStages);

    for (const template of Object.values(PIPELINE_TEMPLATES)) {
      expect(template.stages.map((stage) => stage.name)).toEqual(expectedDealStages);
      expect(template.stages).toHaveLength(9);
      expect(template.stages.every((stage) => !stage.isClosedWon && !stage.isClosedLost)).toBe(true);
    }
  });

  it('seeds each active demo pipeline with exactly the same ordered stages', () => {
    const seed = createDemoSeed(Date.UTC(2026, 0, 1));
    const activePipelines = seed.pipelines.filter((pipeline) => pipeline.isActive);

    for (const pipeline of activePipelines) {
      expect(seed.pipelineStages
        .filter((stage) => stage.pipelineId === pipeline.id)
        .sort((left, right) => left.stageOrder - right.stageOrder)
        .map((stage) => stage.name)).toEqual(expectedDealStages);
    }
  });
});
