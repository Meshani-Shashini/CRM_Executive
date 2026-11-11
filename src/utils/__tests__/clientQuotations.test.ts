import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientQuotation, QuotationRequest, QuotationRequestLine, QuotationSection } from '../../types';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
  AUTH_BYPASS: true,
  TENANT_ID: 'tenant-test',
}));

import {
  buildClientQuotationSources, canTransitionClientQuotation, createClientQuotationDraft,
  defaultLowestPremiumSelections, defaultQuotationValidUntil, getSourceValidityWarnings,
  isQuotationExpired, quotationRatePct, quotationTotalPremium, quotationTotalSumInsured,
  sourceValidityConfirmationRequired, validateClientQuotation,
} from '../clientQuotations';
import { getNextReference, nextLocalReference } from '../references';

const clauses = {
  perils: ['Fire'],
  deductibles: [{ label: 'Standard', text: 'MVR 500' }],
  warranties: [{ title: 'Safeguards', text: 'Maintain declared safeguards' }],
  exclusions: ['War'],
  conditions: ['Notify material changes'],
  disclaimer: 'Subject to underwriting.',
  communicableDiseaseExclusion: '',
  sanctionClause: '',
};

function makeSection(options: QuotationSection['data']['options'] = []): QuotationSection {
  return {
    id: 'section-1',
    no: 1,
    productCode: 'HR',
    title: 'Marine Hull',
    status: 'Active',
    data: {
      template: 'marine-hull',
      interests: [{ interest: 'Hull', sumInsured: 100000 }],
      totalSumInsured: 100000,
      deductibles: [],
      extensions: [{ name: 'Salvage', limit: 'MVR 5000' }],
      materialInfo: {},
      options,
    },
  };
}

function makeLine(overrides: Partial<QuotationRequestLine> = {}): QuotationRequestLine {
  return {
    id: 'line-1',
    reference: 'QRS-012-2026-01-01',
    sectionId: 'section-1',
    vendorId: 'insurer-1',
    status: 'Quoted',
    quotes: [{ optionId: 'base', premium: 2500, currency: 'MVR', validUntil: '2026-12-31' }],
    remarks: '',
    statusHistory: [],
    ...overrides,
  };
}

function makeRequest(section = makeSection(), lines = [makeLine()]): QuotationRequest {
  return {
    id: 'request-1',
    reference: 'QRS-012-2026',
    issuedAt: '2026-11-11',
    dealId: 'deal-1',
    leadId: 'lead-1',
    clientId: 'client-1',
    insuredName: 'Lagoon Logistics',
    businessActivity: 'Transport',
    additionalActivity: '',
    riskLocation: 'Male',
    territorialLimits: 'Maldives',
    occupation: 'Marine transport',
    periodOfInsurance: 'One year',
    requiredBy: '2026-11-20',
    currency: 'MVR',
    notes: '',
    preparedBy: 'sales-1',
    checkedBy: '',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    sections: [section],
    lines,
  };
}

const deal = {
  id: 'deal-1',
  leadId: 'lead-1',
  clientId: 'client-1',
  client: 'Lagoon Logistics',
  product: 'Marine Hull',
  productCode: 'HR',
  value: 100000,
  currency: 'MVR' as const,
  insurer: 'Island Insurance',
};

function createDraft(overrides: Partial<Parameters<typeof createClientQuotationDraft>[0]> = {}) {
  const request = overrides.request ?? makeRequest();
  return createClientQuotationDraft({
    id: 'qty-1',
    reference: 'QTY-2026-0001',
    request,
    sources: [{ sectionId: 'section-1', lineId: 'line-1' }],
    deal,
    addressee: { contactId: 'contact-1', name: 'Aminath', designation: 'Fleet Manager' },
    preparedBy: 'sales-1',
    authorizedBy: 'admin-1',
    validityDays: 5,
    now: '2026-11-11T00:00:00.000Z',
    clausesForSection: () => clauses,
    ...overrides,
  });
}

function quote(overrides: Partial<ClientQuotation> = {}): ClientQuotation {
  const draft = createDraft();
  return { ...draft, status: 'Draft', ...overrides };
}

describe('client quotations', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('obtains QTY references from the database RPC even in auth-bypass mode', async () => {
    rpcMock.mockResolvedValue({ data: 'QTY-2026-0042', error: null });
    await expect(getNextReference('client-quotation', 2026, [])).resolves.toBe('QTY-2026-0042');
    expect(rpcMock).toHaveBeenCalledWith('get_next_reference', {
      p_tenant_id: 'tenant-test',
      p_kind: 'client-quotation',
      p_year: 2026,
    });
    expect(() => nextLocalReference('client-quotation', 2026, [])).toThrow(/database/);
  });

  it('calculates totals, validity, expiry, and premium rate from section snapshots', () => {
    const quotation = quote();
    expect(defaultQuotationValidUntil('2026-01-01T10:00:00.000Z', 5)).toBe('2026-01-06');
    expect(isQuotationExpired(quote({ status: 'Issued', validUntil: '2026-01-01' }), new Date('2026-01-02T00:00:00.000Z'))).toBe(true);
    expect(isQuotationExpired(quote({ status: 'Accepted', validUntil: '2026-01-01' }), new Date('2026-01-02T00:00:00.000Z'))).toBe(false);
    expect(quotationTotalSumInsured(quotation)).toBe(100000);
    expect(quotationTotalPremium(quotation)).toBe(2500);
    expect(quotationRatePct(2500, 100000)).toBe(2.5);
    expect(quotation.sections[0]?.extensions).toEqual([{ name: 'Salvage', limit: 'MVR 5000' }]);
  });

  it('allows authorized status transitions and disallows client route access', () => {
    expect(canTransitionClientQuotation('Draft', 'Issued', 'sales')).toBe(true);
    expect(canTransitionClientQuotation('Issued', 'Accepted', 'admin')).toBe(true);
    expect(canTransitionClientQuotation('Issued', 'Accepted', 'sales', true)).toBe(false);
    expect(canTransitionClientQuotation('Issued', 'Accepted', 'client')).toBe(false);
    expect(canTransitionClientQuotation('Issued', 'Expired', 'sales', false)).toBe(false);
    expect(canTransitionClientQuotation('Issued', 'Expired', 'sales', true)).toBe(true);
    expect(canTransitionClientQuotation('Accepted', 'Issued', 'admin')).toBe(false);
  });

  it('selects one lowest-premium quoted source per section option', () => {
    const section = makeSection([
      { id: 'option-1', label: 'Option 01', coverages: [] },
      { id: 'option-2', label: 'Option 02', coverages: [] },
    ]);
    const request = makeRequest(section, [
      makeLine({ id: 'line-a', reference: 'QRS-012-2026-01-01', quotes: [
        { optionId: 'option-1', premium: 3000, currency: 'MVR' },
        { optionId: 'option-2', premium: 5000, currency: 'MVR' },
      ] }),
      makeLine({ id: 'line-b', reference: 'QRS-012-2026-01-02', vendorId: 'insurer-2', quotes: [
        { optionId: 'option-1', premium: 2500, currency: 'MVR' },
        { optionId: 'option-2', premium: 4500, currency: 'MVR' },
      ] }),
    ]);
    const selected = defaultLowestPremiumSelections(request);
    expect(selected).toEqual({
      'section-1:option-1': 'line-b',
      'section-1:option-2': 'line-b',
    });
    const sources = buildClientQuotationSources(request, ['section-1'], selected);
    expect(sources).toEqual([
      { sectionId: 'section-1', lineId: 'line-b', optionKey: 'option-1' },
      { sectionId: 'section-1', lineId: 'line-b', optionKey: 'option-2' },
    ]);
    const quotation = createDraft({ request, sources });
    expect(quotation.sources).toHaveLength(2);
    expect(quotation.sections[0]?.optionQuotes).toEqual([
      expect.objectContaining({ optionKey: 'option-1', proposedPremium: 2500 }),
      expect.objectContaining({ optionKey: 'option-2', proposedPremium: 4500 }),
    ]);
    expect(quotation.totalPremium).toBe(2500);
  });

  it('requires source quote validity confirmation when a carrier quote expires earlier', () => {
    const request = makeRequest(makeSection(), [makeLine({
      quotes: [{ optionId: 'base', premium: 2500, currency: 'MVR', validUntil: '2026-11-12' }],
    })]);
    const draft = createDraft({ request });
    expect(getSourceValidityWarnings(draft, [request], new Date('2026-11-11T12:00:00.000Z'))).toContain(
      'QRS-012-2026-01-01 expires before the client quotation.',
    );
    expect(sourceValidityConfirmationRequired(draft, [request], new Date('2026-11-11T12:00:00.000Z'))).toBe(true);
    expect(validateClientQuotation(draft, request, true)).toContain('QRS-012-2026-01-01 expires before the client quotation.');
    expect(validateClientQuotation(draft, request, true, { confirmSourceValidity: true })).toEqual([]);
  });

  it('validates required addressee, positive section values, source status, and authorizer before issue', () => {
    const request = makeRequest();
    const draft = createDraft({ request });
    expect(validateClientQuotation(draft, request, true, { forIssue: true })).toEqual([]);
    expect(validateClientQuotation({
      ...draft,
      addressee: { ...draft.addressee, contactId: '' },
    }, request, true)).toContain('Select a contact as the quotation addressee.');
    expect(validateClientQuotation({
      ...draft,
      authorizedBy: '',
    }, request, true, { forIssue: true })).toContain('Authorized by is required before issue.');
    expect(validateClientQuotation({
      ...draft,
      authorizedBy: draft.preparedBy,
    }, request, true, { forIssue: true })).toContain('The authorizer must be different from the preparer.');
    expect(validateClientQuotation({
      ...draft,
      sections: [{ ...draft.sections[0]!, totalSumInsured: 0, proposedPremium: 0 }],
      totalSumInsured: 0,
      totalPremium: 0,
    }, request, true)).toContain('Marine Hull proposed premium must be positive.');
    const changedSource = makeRequest(makeSection(), [makeLine({ status: 'Sent' })]);
    expect(validateClientQuotation(draft, changedSource, true)).toContain(
      'Marine Hull requires a matching QRS line in Quoted status.',
    );
  });
});
