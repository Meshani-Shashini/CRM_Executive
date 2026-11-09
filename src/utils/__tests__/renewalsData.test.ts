import { describe, expect, it } from 'vitest';
import type { Client, Deal, Lead, Pipeline, User } from '../../types';
import { buildRenewalRows } from '../renewalsData';

const pipeline: Pipeline = {
  id: 'renewal-pipeline',
  tenantId: 'tenant-1',
  name: 'Renewals',
  code: 'RENEWALS',
  isActive: true,
};

const client: Client = {
  id: 'client-1',
  name: 'Acme',
  tin: '',
  country: 'Maldives',
  phone: '',
  email: '',
  address: '',
  sumInsured: 1000,
  premium: 250,
  expiry: '2026-05-01',
  insurer: 'Carrier',
  productCode: 'PR',
  class: 'Property',
  ownerId: 'owner-1',
  tags: [],
};

const renewalDeal: Deal = {
  id: 'renewal-1',
  pipelineId: pipeline.id,
  renewalExpiry: client.expiry,
  client: client.name,
  clientId: client.id,
  product: 'Property',
  value: 1000,
  weighted: 500,
  currency: 'MVR',
  stage: 'Renewal review',
  probability: 50,
  ownerId: 'owner-1',
  closeDate: '2026-02-01',
  insurer: 'Renewal Carrier',
  leadId: 'lead-1',
};

const lead: Lead = {
  id: 'lead-2',
  client: 'Beta',
  title: 'Beta policy',
  contact: 'Pat',
  country: 'Maldives',
  insuranceClass: 'Property',
  productCode: 'PR',
  temperature: 'WARM',
  status: 'IN-PROGRESS',
  funnelStage: 'Qualified',
  renewalDate: '2026-01-16',
  sumInsured: 1000,
  premium: 80,
  ownerId: 'owner-2',
  lastActivity: '',
};

const owner: User = { id: 'owner-1', name: 'Owner One', email: '', role: 'sales' };

describe('buildRenewalRows', () => {
  it('combines matching policy records, prefers the renewal deal, and groups by the nearest trigger', () => {
    const rows = buildRenewalRows({
      clients: [client],
      deals: [renewalDeal],
      leads: [lead],
      pipelines: [pipeline],
      pipelineStages: [],
      users: [owner],
      today: '2026-01-01',
    });
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'deal:renewal-1',
        client: 'Acme',
        insurer: 'Renewal Carrier',
        premium: 250,
        bucket: 'T-90',
        daysUntil: 120,
        dealId: 'renewal-1',
      }),
      expect.objectContaining({
        id: 'lead:lead-2',
        client: 'Beta',
        premium: 80,
        bucket: 'T-15',
        daysUntil: 15,
      }),
    ]));
  });

  it('keeps overdue records and excludes dates beyond the 120-day horizon', () => {
    const pastClient = { ...client, id: 'past', name: 'Past', expiry: '2025-12-31' };
    const futureClient = { ...client, id: 'future', name: 'Future', expiry: '2026-05-02' };
    const rows = buildRenewalRows({
      clients: [pastClient, futureClient],
      deals: [],
      leads: [],
      pipelines: [],
      pipelineStages: [],
      users: [],
      today: '2026-01-01',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ client: 'Past', bucket: 'Overdue', daysUntil: -1 });
  });
});
