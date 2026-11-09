// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSeed } from '../../dev/demoSeed';
import { applyPipelineStagePresentation, getPipelineLossReasons } from '../../data/pipelineStageTemplates';
import StageStepper from './StageStepper';

const expectedLabels: Record<string, string[]> = {
  COMMERCIAL: ['Risk Survey', 'Market Tender', 'Quote Comparison', 'Negotiation', 'Bound', 'Lost'],
  SME_VELOCITY: ['Intake & Rating', 'Package Quoted', 'Confirmation', 'Paid & Covered', 'Lost'],
  RENEWALS: ['Audit (T-90)', 'Re-tender (T-60)', 'Terms (T-30)', 'Sign-Off (T-15)', 'Renewed', 'Lapsed'],
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

  it.each(Object.entries(expectedLabels))('%s renders closed-lost last with short labels', (code, labels) => {
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
    expect(container.querySelector('.deal-stage-stepper__step:last-child')?.classList.contains('is-lost-open')).toBe(true);
    expect(container.querySelector('.deal-stage-stepper__summary')?.textContent).toContain('Win ');
  });

  it('keeps the lost stage last even if it has an earlier configured order', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages
      .filter((stage) => stage.pipelineId === pipeline?.id)
      .map((stage) => stage.isClosedLost ? { ...stage, stageOrder: 1 } : stage);
    const currentStage = stages.find((stage) => !stage.isClosedLost);
    if (!currentStage) throw new Error('Commercial pipeline has no open stages.');

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={currentStage.id}
        dealStatus="open"
        canEdit
        onSelect={vi.fn()}
      />,
    ));

    expect(container.querySelector('.deal-stage-stepper__step:last-child .deal-stage-stepper__label')?.textContent)
      .toBe('Lost');
  });

  it('shows a disabled muted lost node after a deal is won', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const wonStage = stages.find((stage) => stage.isClosedWon);
    if (!wonStage) throw new Error('Commercial pipeline has no closed-won stage.');

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={wonStage.id}
        dealStatus="won"
        canEdit
        onSelect={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll('.deal-stage-stepper__step.is-complete')).toHaveLength(5);
    expect(container.querySelector<HTMLButtonElement>('.deal-stage-stepper__step.is-lost-won .deal-stage-stepper__button')
      ?.disabled).toBe(true);
  });

  it('shows the red lost node and reason banner for a lost deal', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const lostStage = stages.find((stage) => stage.isClosedLost);
    if (!lostStage) throw new Error('Commercial pipeline has no closed-lost stage.');

    act(() => root.render(
      <StageStepper
        pipelineStages={stages}
        currentStageId={lostStage.id}
        dealStatus="lost"
        lossReason="Self-Insured"
        canEdit
        onSelect={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll('.deal-stage-stepper__step.is-dimmed')).toHaveLength(5);
    expect(container.querySelector<HTMLButtonElement>('.deal-stage-stepper__step.is-lost-closed .deal-stage-stepper__button')
      ?.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Lost: Self-Insured');
    expect(container.querySelector('.deal-stage-stepper__summary')?.textContent).toBe('Win 0%');
  });

  it('routes clicks on the open deal lost node through the stage selection callback', () => {
    const seed = createDemoSeed();
    const pipeline = seed.pipelines.find((item) => item.code === 'COMMERCIAL');
    const stages = seed.pipelineStages.filter((stage) => stage.pipelineId === pipeline?.id);
    const lostStage = stages.find((stage) => stage.isClosedLost);
    if (!lostStage) throw new Error('Commercial pipeline has no closed-lost stage.');
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
    act(() => container.querySelector<HTMLButtonElement>('.is-lost-open .deal-stage-stepper__button')?.click());

    expect(onSelect).toHaveBeenCalledWith(lostStage);
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
    expect(migrated.shortLabel).toBe('Quote Comparison');
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
