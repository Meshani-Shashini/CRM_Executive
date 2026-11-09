import { describe, expect, it } from 'vitest';
import type { Activity } from '../../types';
import { getNextActivity, nextActivityState } from '../nextActivity';

const now = new Date(2026, 10, 9, 12).getTime();

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    clientId: 'client-1',
    leadId: 'lead-1',
    type: 'task',
    title: 'Follow up',
    description: '',
    date: new Date(2026, 10, 10, 12).toISOString(),
    dueDate: new Date(2026, 10, 10, 12).toISOString(),
    userId: 'user-1',
    ...overrides,
  };
}

describe('next activity', () => {
  it('classifies overdue, today, and future dates by local day', () => {
    expect(nextActivityState(new Date(2026, 10, 8, 23).toISOString(), now)).toBe('overdue');
    expect(nextActivityState(new Date(2026, 10, 9, 0).toISOString(), now)).toBe('today');
    expect(nextActivityState(new Date(2026, 10, 10, 0).toISOString(), now)).toBe('future');
    expect(nextActivityState(undefined, now)).toBe('none');
  });

  it('selects the earliest pending activity associated by lead or deal id only', () => {
    const later = activity({ id: 'later', dueDate: new Date(2026, 10, 12).toISOString() });
    const earlier = activity({ id: 'earlier', dealId: 'deal-1', dueDate: new Date(2026, 10, 10).toISOString() });
    const unrelated = activity({ id: 'unrelated', leadId: 'other-lead', dueDate: new Date(2026, 10, 9).toISOString() });
    const done = activity({ id: 'done', done: true, dueDate: new Date(2026, 10, 9).toISOString() });
    expect(getNextActivity([later, earlier, unrelated, done], { leadId: 'lead-1', dealId: 'deal-1' }, now).activity?.id)
      .toBe('earlier');
  });

  it('supports legacy task dates and deal-level next-activity fields', () => {
    const legacyTask = activity({ dueDate: undefined, date: new Date(2026, 10, 8).toISOString() });
    expect(getNextActivity([legacyTask], { leadId: 'lead-1' }, now).state).toBe('overdue');
    expect(getNextActivity([], {
      dealId: 'deal-1',
      legacyDueDate: new Date(2026, 10, 12).toISOString(),
      legacyTitle: 'Renewal review',
    }, now)).toMatchObject({ title: 'Renewal review', state: 'future' });
  });
});