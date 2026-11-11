import { describe, expect, it } from 'vitest';
import type { ClientQuotation, QuotationRequest, QuotationRequestLine } from '../../types';
import {
  canTransitionClientQuotation, createClientQuotationDraft, defaultQuotationValidUntil,
  isQuotationExpired, quotationRatePct, quotationTotalSumInsured,
  validateClientQuotation,
} from '../clientQuotations';
import { nextLocalReference } from '../references';

const request: QuotationRequest = {
  id: 'request-1',
  reference: 'QRS-012-2026',
  issuedAt: '2026-11-11',
  dealId: 'deal-1',
  leadId: 'lead-1',
  clientId: 'client-1',
  insuredName: 'Lagoon Logistics',
  businessActivity: '',
  additionalActivity: '',
  riskLocation: '',
  territorialLimits: '',
  occupation: '',
  periodOfInsurance: 'TBA',
  requiredBy: '2026-11-20',
  currency: 'MVR',
  notes: '',
  preparedBy: 'sales-1',
  checkedBy: '',
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
  sections: [{
    id: 'section-1', no: 1, productCode: 'HR', title: 'Marine Hull',
    status: 'Active',
    data: {
      template: 'marine-hull', interests: [{ interest: 'Hull', sumInsured: 100000 }],
      totalSumInsured: 100000, deductibles: [], extensions: [], materialInfo: {}, options: [],
    },
  }],
  lines: [],
};
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

function quote(overrides: Partial<ClientQuotation> = {}): ClientQuotation {
  const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  return {
    id: 'qty-1',
    reference: 'QTY-2026-0001',
    dealId: 'deal-1',
    leadId: 'lead-1',
    clientId: 'client-1',
    sourceRequestId: 'request-1',
    sourceLineId: 'line-1',
    version: 1,
    status: 'Draft',
    validUntil: future,
    addressee: { contactId: 'contact-1', name: 'Aminath', designation: 'Fleet Manager' },
    policyNo: 'TBA',
    endorsementNo: 'Not applicable',
    policyPeriod: '',
    territorialLimits: '',
    occupation: 'Marine Hull',
    riskLocation: '',
    sections: [{ title: 'Hull', items: [{ interest: 'Vessel', sumInsured: 60000 }, { interest: 'Machinery', sumInsured: 40000 }] }],
    totalSumInsured: 100000,
    currency: 'MVR',
    perils: [],
    extensions: [],
    deductibles: [],
    warranties: [],
    conditions: [],
    exclusions: [],
    disclaimer: '',
    proposedPremium: 2500,
    ratePct: 2.5,
    preparedBy: 'sales-1',
    authorizedBy: 'admin-1',
    ...overrides,
  };
}

describe('client quotations', () => {
  it('allocates monotonically increasing yearly QTY references', () => {
    expect(nextLocalReference('client-quotation', 2026, ['QTY-2026-0001', 'QTY-2026-0003'])).toBe('QTY-2026-0004');
    expect(nextLocalReference('client-quotation', 2026, [], 7)).toBe('QTY-2026-0008');
    expect(nextLocalReference('client-quotation', 2027, ['QTY-2026-0099'])).toBe('QTY-2027-0001');
  });

  it('calculates default validity, expiry, total sum insured, and premium rate', () => {
    expect(defaultQuotationValidUntil('2026-01-01T10:00:00.000Z', 5)).toBe('2026-01-06');
    expect(isQuotationExpired(quote({ status: 'Issued', validUntil: '2026-01-01' }), new Date('2026-01-02T00:00:00.000Z'))).toBe(true);
    expect(isQuotationExpired(quote({ status: 'Accepted', validUntil: '2026-01-01' }), new Date('2026-01-02T00:00:00.000Z'))).toBe(false);
    expect(quotationTotalSumInsured(quote())).toBe(100000);
    expect(quotationRatePct(2500, 100000)).toBe(2.5);
  });

  it('allows issuance and client acceptance, and only allows expiry after date passes', () => {
    expect(canTransitionClientQuotation('Draft', 'Issued', 'sales')).toBe(true);
    expect(canTransitionClientQuotation('Issued', 'Accepted', 'client')).toBe(true);
    expect(canTransitionClientQuotation('Issued', 'Accepted', 'client', true)).toBe(false);
    expect(canTransitionClientQuotation('Issued', 'Expired', 'sales', false)).toBe(false);
    expect(canTransitionClientQuotation('Issued', 'Expired', 'sales', true)).toBe(true);
    expect(canTransitionClientQuotation('Accepted', 'Issued', 'admin')).toBe(false);
  });

  it('requires an eligible quoted line and validates pricing, validity, addressee, and authorizer', () => {
    const line: QuotationRequestLine = {
      id: 'line-1',
      reference: 'QRS-012-2026-01-01',
      sectionId: 'section-1',
      vendorId: 'insurer-1',
      status: 'Quoted',
      quotes: [{ optionId: 'base', premium: 2500, currency: 'MVR' }],
      quotedPremium: 2500,
      quotedCurrency: 'MVR',
      insurerDeductibles: ['USD 500 each and every loss'],
      remarks: '',
      statusHistory: [],
    };
    const draft = createClientQuotationDraft({
      id: 'qty-1',
      reference: 'QTY-2026-0001',
      request,
      line,
      deal,
      addressee: { contactId: 'contact-1', name: 'Aminath', designation: 'Fleet Manager' },
      preparedBy: 'sales-1',
      authorizedBy: 'admin-1',
      validityDays: 5,
      now: '2026-11-11T00:00:00.000Z',
      template: { perils: ['Fire'], exclusions: ['War'] },
    });
    expect(draft.deductibles).toEqual([{ label: 'Insurer deductible', text: 'USD 500 each and every loss' }]);
    expect(draft.perils).toEqual(['Fire']);
    expect(validateClientQuotation(draft, true)).toEqual([]);
    expect(validateClientQuotation({
      ...draft,
      addressee: { ...draft.addressee, contactId: '' },
    }, true)).toContain('Select a contact as the quotation addressee.');
    expect(validateClientQuotation({ ...draft, proposedPremium: 0 }, true)).toContain('Proposed premium must be positive.');
    expect(validateClientQuotation({ ...draft, authorizedBy: 'sales-1' }, true)).toContain('The authorizer must be different from the preparer.');
    expect(() => createClientQuotationDraft({
      id: 'bad',
      reference: 'QTY-2026-0002',
      request,
      line: { ...line, status: 'Sent' },
      deal,
      addressee: { contactId: '', name: '', designation: '' },
      preparedBy: 'sales-1',
      authorizedBy: 'admin-1',
      validityDays: 5,
    })).toThrow(/Quoted QRS line/);
  });
});
