import { describe, expect, it } from 'vitest';
import type { Client, Deal, Lead, PipelineStage, StageHistoryAudit } from '../../types';
import {
  classifyDealOutcome,
  summarizeClosedDealsForLastSixMonths,
  summarizeDealValues,
  summarizeDealsByPeriod,
  validateDealBaseForProgression,
} from '../monthlyDealSummary';

const client: Client = {
  id: 'client-1',
  name: 'Atoll Trading',
  tin: 'TIN-1',
  country: 'Maldives',
  phone: '+9607771000',
  email: 'office@atoll.example',
  address: 'Male',
  sumInsured: 0,
  premium: 0,
  expiry: '',
  insurer: '',
  productCode: 'PR',
  class: 'Fire',
  ownerId: 'sales-1',
  tags: [],
};

const stages: PipelineStage[] = [
  { id: 'stage-open', pipelineId: 'pipeline-1', name: 'Prospecting', stageOrder: 1, winProbabilityPct: 25, stagnationDaysThreshold: 10 },
  { id: 'stage-review', pipelineId: 'pipeline-1', name: 'Review', stageOrder: 2, winProbabilityPct: 60, stagnationDaysThreshold: 10 },
  { id: 'stage-won', pipelineId: 'pipeline-1', name: 'Policy Bound / Won', stageOrder: 3, winProbabilityPct: 100, stagnationDaysThreshold: 0, isClosedWon: true },
  { id: 'stage-lost', pipelineId: 'pipeline-1', name: 'Lost', stageOrder: 4, winProbabilityPct: 0, stagnationDaysThreshold: 0, isClosedLost: true },
];

function makeDeal(id: string, values: Partial<Deal> = {}): Deal {
  return {
    id,
    leadId: `lead-${id}`,
    pipelineId: 'pipeline-1',
    clientId: client.id,
    client: client.name,
    product: 'Property All Risk',
    productCode: 'PR',
    value: 1000,
    weighted: 990,
    currency: 'MVR',
    stage: 'Prospecting',
    probability: 99,
    ownerId: 'sales-1',
    closeDate: '2026-02-15',
    insurer: 'Not assigned',
    ...values,
  };
}

function makeLead(deal: Deal): Lead {
  return {
    id: deal.leadId,
    clientId: client.id,
    client: client.name,
    contact: 'Aminath Shareef',
    country: 'Maldives',
    insuranceClass: 'Fire',
    productCode: 'PR',
    temperature: 'WARM',
    status: 'TO-DO',
    funnelStage: 'Converted to deal',
    disposition: 'converted',
    dealId: deal.id,
    renewalDate: deal.closeDate,
    sumInsured: deal.value,
    premium: deal.value,
    ownerId: 'sales-1',
    lastActivity: 'Just now',
  };
}

function audit(dealId: string, outcome: 'won' | 'lost', details?: string): StageHistoryAudit {
  return {
    id: `audit-${dealId}`,
    tenantId: 'tenant-1',
    dealId,
    fromStageId: 'stage-open',
    toStageId: outcome === 'won' ? 'stage-won' : 'stage-lost',
    enteredAt: '2026-02-10T00:00:00.000Z',
    exitedAt: null,
    durationSeconds: null,
    outcome,
    ...(outcome === 'lost' ? { lossReason: 'Incumbent retained account' } : {}),
    ...(details ? { details } : {}),
  };
}

describe('monthly deal summaries', () => {
  it('counts valid won and lost deals in the rolling six-month window', () => {
    const now = new Date(2026, 8, 4);
    const won = makeDeal('won-current', {
      closeDate: '2026-09-02',
      stage: 'Policy Bound / Won',
      disposition: 'won',
    });
    const lost = makeDeal('lost-first-month', {
      closeDate: '2026-04-30',
      stage: 'Lost',
      disposition: 'lost',
      lossReason: 'Competitor selected',
    });
    const open = makeDeal('open-current', { closeDate: '2026-09-03' });
    const outsideWindow = makeDeal('won-outside-window', {
      closeDate: '2026-03-31',
      stage: 'Policy Bound / Won',
      disposition: 'won',
    });
    const invalidDate = makeDeal('won-invalid-date', {
      closeDate: '2026-09-31',
      stage: 'Policy Bound / Won',
      disposition: 'won',
    });

    expect(summarizeClosedDealsForLastSixMonths(
      [won, lost, open, outsideWindow, invalidDate],
      stages,
      [],
      now,
    )).toEqual([
      { key: '2026-04', label: 'Apr', won: 0, lost: 1 },
      { key: '2026-05', label: 'May', won: 0, lost: 0 },
      { key: '2026-06', label: 'Jun', won: 0, lost: 0 },
      { key: '2026-07', label: 'Jul', won: 0, lost: 0 },
      { key: '2026-08', label: 'Aug', won: 0, lost: 0 },
      { key: '2026-09', label: 'Sep', won: 1, lost: 0 },
    ]);
  });

  it('splits closed-won value, open stage groups, and weighted open value using stage probability', () => {
    const open = makeDeal('open-1', { value: 1000 });
    const review = makeDeal('open-2', { stage: 'Review', value: 2000, probability: 5 });
    const won = makeDeal('won-1', { stage: 'Policy Bound / Won', value: 3000, disposition: 'won' });
    const lost = makeDeal('lost-1', { stage: 'Lost', value: 4000, disposition: 'lost', lossReason: 'Incumbent retained account' });
    const deals = [open, review, won, lost];
    const leads = deals.map(makeLead);
    const summary = summarizeDealValues(deals, stages, {
      leads,
      clients: [client],
      stageHistory: [audit(won.id, 'won', 'Win reason: Strong claims support'), audit(lost.id, 'lost')],
    });

    expect(summary.wonValueMvr).toBe(3000);
    expect(summary.openValueMvr).toBe(3000);
    expect(summary.openWeightedValueMvr).toBe(1450);
    expect(summary.open).toEqual([
      { stageName: 'Prospecting', count: 1, valueMvr: 1000, weightedValueMvr: 250, probabilityPct: 25 },
      { stageName: 'Review', count: 1, valueMvr: 2000, weightedValueMvr: 1200, probabilityPct: 60 },
    ]);
    expect(summary.lostValueMvr).toBe(4000);
    expect(summary.validationIssues).toEqual([]);
  });

  it('requires valid close date, positive value, and linked lead/client for open deals', () => {
    const deal = makeDeal('invalid-open', {
      closeDate: '2026-02-31',
      value: 0,
      clientId: 'missing-client',
    });
    expect(validateDealBaseForProgression(deal, { leads: [makeLead(deal)], clients: [] })).toEqual([
      'Expected close date is required and must be valid.',
      'Deal value must be positive.',
      'Deal and lead must be linked to a client.',
    ]);
    const summary = summarizeDealValues([deal], stages, { leads: [makeLead(deal)], clients: [], stageHistory: [] });
    expect(summary.openValueMvr).toBe(0);
    expect(summary.validationIssues).toHaveLength(1);
  });

  it('requires an outcome reason and groups deals by month or quarter', () => {
    const won = makeDeal('won-without-reason', { stage: 'Policy Bound / Won', disposition: 'won' });
    const lost = makeDeal('lost-without-reason', { stage: 'Lost', disposition: 'lost' });
    const otherMonth = makeDeal('open-next-month', { closeDate: '2026-03-15' });
    const context = {
      leads: [makeLead(won), makeLead(lost), makeLead(otherMonth)],
      clients: [client],
      stageHistory: [],
    };

    expect(summarizeDealValues([won], stages, context).validationIssues[0].errors).toContain('A win reason is required.');
    expect(summarizeDealValues([lost], stages, context).validationIssues[0].errors).toContain('A loss reason is required.');
    expect(summarizeDealsByPeriod([won, lost, otherMonth], stages, context, 'month').map((item) => item.key))
      .toEqual(['2026-02', '2026-03']);
    const quarterSummary = summarizeDealsByPeriod([won, lost, otherMonth], stages, context, 'quarter');
    expect(quarterSummary).toHaveLength(1);
    expect(quarterSummary[0].key).toBe('2026-01');
  });

  it('uses the audited outcome for a pipeline stage shared by Won and Lost', () => {
    const combinedStage: PipelineStage = {
      ...stages[2],
      name: 'Policy Bound / Lost',
      isClosedWon: true,
      isClosedLost: true,
    };
    const combinedDeal = makeDeal('combined', { stage: combinedStage.name });
    const lostAudit = audit(combinedDeal.id, 'lost');
    expect(classifyDealOutcome(combinedDeal, combinedStage, [lostAudit])).toBe('lost');
    expect(summarizeDealValues([combinedDeal], [combinedStage], {
      leads: [makeLead(combinedDeal)],
      clients: [client],
      stageHistory: [lostAudit],
    }).lostValueMvr).toBe(1000);
  });
});
