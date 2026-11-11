import { describe, expect, it } from 'vitest';
import { linkDealToLead } from '../dealFactory';
import { buildLeadConversion } from '../leadConversion';
import type { Lead } from '../../types';

describe('deal conversion invariants', () => {
  it('does not create a deal when no lead is linked', () => {
    const dealDraft = {
      id: 'deal-without-lead',
      client: 'Example Company',
      product: 'Marine Hull',
      value: 100_000,
      weighted: 10_000,
      currency: 'MVR' as const,
      stage: 'Identified',
      probability: 10,
      ownerId: 'user-1',
      closeDate: '2026-06-30',
      insurer: 'Not assigned',
    } satisfies Parameters<typeof linkDealToLead>[0];

    expect(() => linkDealToLead(dealDraft, undefined)).toThrow(
      'Deal conversion requires a valid lead record.',
    );
  });

  it('blocks converting a lead that already has a linked deal', () => {
    const convertedLead = {
      id: 'lead-1',
      client: 'Example Company',
      title: 'Example opportunity',
      contact: 'Example Contact',
      country: 'Maldives',
      insuranceClass: 'Marine',
      productCode: 'HR',
      temperature: 'WARM',
      status: 'IN-PROGRESS',
      funnelStage: 'Converted to deal',
      disposition: 'converted',
      dealId: 'deal-1',
      renewalDate: '',
      sumInsured: 100_000,
      premium: 0,
      ownerId: 'user-1',
      lastActivity: '',
    } satisfies Lead;

    expect(buildLeadConversion({ lead: convertedLead, contactChannels: {} })).toBeNull();
  });
});
