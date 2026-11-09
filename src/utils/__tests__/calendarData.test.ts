import { describe, expect, it } from 'vitest';
import type { Activity, Client, Deal, Lead, PipelineStage } from '../../types';
import { buildCalendarEvents } from '../calendarData';

const userId = 'owner-1';

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    pipelineId: 'pipeline-1',
    createdAt: '2025-12-30T00:00:00.000Z',
    client: 'Acme',
    clientId: 'client-1',
    product: 'Property cover',
    value: 1000,
    weighted: 500,
    currency: 'MVR',
    stage: 'Review',
    probability: 50,
    ownerId: userId,
    closeDate: '2026-01-03',
    insurer: 'Carrier',
    leadId: 'lead-1',
    ...overrides,
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    createdAt: '2025-12-29T00:00:00.000Z',
    client: 'Acme',
    clientId: 'client-1',
    title: 'Acme renewal',
    closeDate: '2026-01-05',
    contact: 'Pat',
    country: 'Maldives',
    insuranceClass: 'Property',
    productCode: 'PR',
    temperature: 'WARM',
    status: 'IN-PROGRESS',
    funnelStage: 'Lead Identified',
    renewalDate: '2026-01-06',
    sumInsured: 1000,
    premium: 50,
    ownerId: userId,
    lastActivity: '',
    ...overrides,
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Acme',
    tin: '',
    country: 'Maldives',
    phone: '',
    email: '',
    address: '',
    sumInsured: 1000,
    premium: 50,
    expiry: '2026-01-07',
    insurer: 'Carrier',
    productCode: 'PR',
    class: 'Property',
    ownerId: userId,
    tags: [],
    ...overrides,
  };
}

describe('buildCalendarEvents', () => {
  it('derives scheduled activities, close dates, renewal dates, and lead/deal SLA deadlines', () => {
    const activity: Activity = {
      id: 'activity-1',
      clientId: 'client-1',
      dealId: 'deal-1',
      type: 'meeting',
      title: 'Risk review',
      description: '',
      date: '2025-12-30',
      dueDate: '2026-01-02',
      userId,
    };
    const stage: PipelineStage = {
      id: 'stage-1',
      pipelineId: 'pipeline-1',
      name: 'Review',
      stageOrder: 1,
      winProbabilityPct: 50,
      stagnationDaysThreshold: 5,
    };
    const events = buildCalendarEvents({
      activities: [activity],
      clients: [makeClient()],
      deals: [makeDeal({ policyExpiry: '2026-01-10' })],
      leads: [makeLead()],
      pipelineStages: [stage],
      stageHistory: [],
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'activity:activity-1', date: '2026-01-02', kind: 'meeting', target: { route: 'deals', id: 'deal-1' } }),
      expect.objectContaining({ id: 'deal-close:deal-1', date: '2026-01-03', category: 'deal' }),
      expect.objectContaining({ id: 'deal-renewal:deal-1:0', date: '2026-01-10', category: 'renewal' }),
      expect.objectContaining({ id: 'deal-sla:deal-1', date: '2026-01-04', category: 'sla' }),
      expect.objectContaining({ id: 'lead-close:lead-1', date: '2026-01-05', target: { route: 'leads', id: 'lead-1' } }),
      expect.objectContaining({ id: 'lead-renewal:lead-1', date: '2026-01-06', category: 'renewal' }),
      expect.objectContaining({ id: 'lead-sla:lead-1', date: '2026-01-01', category: 'sla' }),
      expect.objectContaining({ id: 'client-renewal:client-1', date: '2026-01-07', target: { route: 'deals', id: 'deal-1' } }),
    ]));
  });

  it('ignores completed and undated activities and invalid stored dates', () => {
    const base: Activity = {
      id: 'activity-1',
      clientId: 'client-1',
      type: 'task',
      title: 'Follow up',
      description: '',
      date: '2026-01-01',
      dueDate: 'not-a-date',
      userId,
    };
    const events = buildCalendarEvents({
      activities: [
        { ...base, id: 'invalid' },
        { ...base, id: 'done', dueDate: '2026-01-02', done: true },
      ],
      clients: [],
      deals: [],
      leads: [],
      pipelineStages: [],
      stageHistory: [],
    });
    expect(events).toEqual([]);
  });
});
