import { describe, expect, it } from 'vitest';
import { summarizeDurations, summarizeStageVisits } from '../stageDuration';

const day = 86400000;
const atDay = (value: number) => new Date(value * day).toISOString();

describe('stage duration analytics', () => {
  it('calculates average and median duration while ignoring invalid samples', () => {
    expect(summarizeDurations([1, 2, 10, Number.NaN, -1])).toEqual({
      sampleCount: 3,
      averageDays: 13 / 3,
      medianDays: 2,
    });
  });

  it('summarizes stage visits, inter-stage durations, and distinct stagnating records', () => {
    const summary = summarizeStageVisits([
      { recordId: 'deal-1', stageName: 'Intake', enteredAt: atDay(0), exitedAt: atDay(2), targetDays: 1 },
      { recordId: 'deal-1', stageName: 'Quote', enteredAt: atDay(2), exitedAt: atDay(5), targetDays: 2 },
      { recordId: 'deal-2', stageName: 'Intake', enteredAt: atDay(1), exitedAt: atDay(4), targetDays: 1 },
      { recordId: 'deal-3', stageName: 'Quote', enteredAt: atDay(1), targetDays: 2 },
    ], 4 * day);
    expect(summary.stages.find((stage) => stage.stageName === 'Intake')).toMatchObject({
      sampleCount: 2,
      averageDays: 2.5,
      medianDays: 2.5,
      stagnantCount: 0,
    });
    expect(summary.transitions).toEqual([{
      fromStage: 'Intake',
      toStage: 'Quote',
      sampleCount: 1,
      averageDays: 2,
      medianDays: 2,
    }]);
    expect(summary.stagnantCount).toBe(1);
  });
});