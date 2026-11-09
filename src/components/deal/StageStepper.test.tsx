// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSeed } from '../../dev/demoSeed';
import { applyPipelineStagePresentation, getPipelineLossReasons } from '../../data/pipelineStageTemplates';
import StageStepper from './StageStepper';

const expectedLabels: Record<string, string[]> = {
  COMMERCIAL: [
    'Identified',
    'Contact Made',
    'Key Person Identified',
    'Intro Mail',
    'Meetings',
    'Requirements Identified',
    'Quotation / Underwriting',
    'Quoted / Proposed',
    'Review and Follow up',
  ],
  SME_VELOCITY: [
    'Identified',
    'Contact Made',
    'Key Person Identified',
    'Intro Mail',
    'Meetings',
    'Requirements Identified',
    'Quotation / Underwriting',
    'Quoted / Proposed',
    'Review and Follow up',
  ],
  RENEWALS: [
    'Identified',
    'Contact Made',
    'Key Person Identified',
    'Intro Mail',
    'Meetings',
    'Requirements Identified',
    'Quotation / Underwriting',
    'Quoted / Proposed',
    'Review and Follow up',
  ],
};

describe('Deal stage stepper', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(Object.entries(expectedLabels))('%s renders the exact nine active stages', (code, labels) => {
    const seed = createDemoSeed(Date.parse('2026-01-01T00:00:00.000Z'));
    const pipeline = seed.pipelines.find((item) => item.code === code);
    expect(pipeline).toBeDefined();
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const currentStage = stages[0];
    if (!currentStage) throw new Error(`Pipeline ${code} has no stages.`);
    const onSelect = vi.fn();

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={currentStage.id}
        dealStatus="open"
        stageEnteredAt="2026-01-01T00:00:00.000Z"
        now={Date.parse('2026-01-02T00:00:00.000Z')}
        canEdit
        onSelect={onSelect}
      />,
    ));

    const stepLabels = [...container.querySelectorAll('.deal-stage-stepper__label')]
      .map((label) => label.textContent);
    expect(stepLabels).toEqual(labels);
    expect(container.querySelectorAll('.deal-stage-stepper__button')).toHaveLength(labels.length);
    expect(container.querySelector('.deal-stage-stepper__step:last-child .deal-stage-stepper__label')?.textContent)
      .toBe(labels[labels.length - 1]);
    expect(container.querySelector('.deal-stage-stepper__step:last-child')?.classList.contains('is-current')).toBe(false);
    expect(container.querySelector('.deal-stage-stepper__step.is-lost-open')).toBeNull();
    expect(container.querySelector('.deal-stage-stepper__summary')?.textContent).toContain('Win ');
  });

  it('shows every configured stage complete after a deal is won', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const finalStage = stages.find((stage) => stage.stageOrder === 9);
    if (!finalStage) throw new Error('Commercial pipeline has no final active stage.');

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={finalStage.id}
        dealStatus="won"
        canEdit
        onSelect={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll('.deal-stage-stepper__step.is-complete')).toHaveLength(9);
    expect(container.querySelector('.deal-stage-stepper__step.is-lost-won')).toBeNull();
  });

  it('shows the loss reason without adding a terminal pipeline stage', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const finalStage = stages.find((stage) => stage.stageOrder === 9);
    if (!finalStage) throw new Error('Commercial pipeline has no final active stage.');

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={finalStage.id}
        dealStatus="lost"
        lossReason="Self-Insured"
        canEdit
        onSelect={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll('.deal-stage-stepper__step.is-dimmed')).toHaveLength(9);
    expect(container.querySelector('.deal-stage-stepper__step.is-lost-closed')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Lost: Self-Insured');
    expect(container.querySelector('.deal-stage-stepper__summary')?.textContent).toBe('Win 0%');
  });

  it('routes clicks on active stages through the stage selection callback', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const nextStage = stages.find((stage) => stage.stageOrder === 2);
    if (!nextStage) throw new Error('Commercial pipeline has no second active stage.');
    const onSelect = vi.fn();

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={stages[0].id}
        dealStatus="open"
        canEdit
        onSelect={onSelect}
      />,
    ));
    act(() => container.querySelectorAll<HTMLButtonElement>('.deal-stage-stepper__button')[1]?.click());

    expect(onSelect).toHaveBeenCalledWith(nextStage);
  });

  it('migrates existing stage presentation by pipeline order, not display name', () => {
    const migrated = applyPipelineStagePresentation({
      id: 'existing-stage',
      pipelineId: 'pipeline-1',
      name: 'Existing translated stage',
      stageOrder: 3,
      winProbabilityPct: 60,
      stagnationDaysThreshold: 7,
    }, 'COMMERCIAL');

    expect(migrated.name).toBe('Existing translated stage');
    expect(migrated.shortLabel).toBe('Key Person Identified');
    expect(migrated.purpose).toBeTruthy();
  });

  it('provides pipeline-specific loss reasons', () => {
    expect(getPipelineLossReasons('SME_VELOCITY')).toEqual([
      'Cheaper Direct Carrier',
      'Lead Declined',
      'Other',
    ]);
  });
});
