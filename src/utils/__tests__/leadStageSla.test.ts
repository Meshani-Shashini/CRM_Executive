import { describe, expect, it } from 'vitest';
import type { Lead } from '../../types';
import {
  DEFAULT_LEAD_STAGE_SLA_DAYS,
  getLeadStageEnteredAt,
  getLeadStageSla,
  resolveLeadStageSlaDays,
} from '../leadStageSla';

const now = new Date('2026-03-10T12:00:00.000Z').getTime();

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    client: 'Example Company',
    title: 'Example opportunity',
    contact: 'Example Contact',
    country: 'Maldives',
    insuranceClass: 'Property',
    productCode: 'PR',
    temperature: 'WARM',
    status: 'IN-PROGRESS',
    funnelStage: 'Contact Made',
    renewalDate: '',
    sumInsured: 0,
    premium: 0,
    ownerId: 'user-1',
    lastActivity: '',
    createdAt: '2026-03-01T12:00:00.000Z',
    stageChangedAt: '2026-03-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('lead stage SLAs', () => {
  it('resolves default targets and applies valid per-stage overrides', () => {
    expect(resolveLeadStageSlaDays()).toEqual(DEFAULT_LEAD_STAGE_SLA_DAYS);
    expect(resolveLeadStageSlaDays({ 'Contact Made': 8, 'Lead Identified': -1 })).toEqual({
      ...DEFAULT_LEAD_STAGE_SLA_DAYS,
      'Contact Made': 8,
    });
  });

  it('uses the stage-entered timestamp and reports elapsed and overdue days', () => {
    const record = lead();
    expect(getLeadStageEnteredAt(record, 'Contact Made')).toBe(record.stageChangedAt);
    expect(getLeadStageSla(record, 'Contact Made', undefined, now)).toMatchObject({
      enteredAt: record.stageChangedAt,
      elapsedDays: 6,
      targetDays: 5,
      overdue: true,
    });
    expect(getLeadStageSla(record, 'Contact Made', { 'Contact Made': 8 }, now)?.overdue).toBe(false);
    expect(getLeadStageSla(record, 'Lost', undefined, now)).toBeUndefined();
  });

  it('calculates stage SLA without a client link', () => {
    const record = lead({ clientId: undefined });

    expect(getLeadStageSla(record, 'Contact Made', undefined, now)).toMatchObject({
      enteredAt: record.stageChangedAt,
      elapsedDays: 6,
      targetDays: 5,
      overdue: true,
    });
  });
});
