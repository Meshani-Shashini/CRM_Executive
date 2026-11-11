import { describe, expect, it } from 'vitest';
import type { QuotationRequestLine, QuotationSection } from '../../types';
import {
  calculateIndicativePremium, compareOptionCoverage, isQuoteExpiring,
  quotationInterestBreakdown, quotationRateFromPremium, selectBestQuote,
} from '../quotationRequestDashboard';

const section: QuotationSection = {
  id: 'section-1',
  no: 1,
  productCode: 'PR',
  title: 'Property',
  status: 'Active',
  data: {
    template: 'property',
    interests: [{ interest: 'Building', sumInsured: 750 }, { interest: 'Contents', sumInsured: 250 }],
    totalSumInsured: 1000,
    deductibles: [],
    extensions: [],
    materialInfo: {},
    options: [
      { id: 'option-01', label: 'Option 01', coverages: [{ name: 'Liability', limit: 100 }] },
      { id: 'option-02', label: 'Option 02', coverages: [{ name: 'Liability', limit: 150 }] },
    ],
  },
};

function quoteLine(id: string, premium: number): QuotationRequestLine {
  return {
    id,
    reference: id,
    sectionId: section.id,
    vendorId: `vendor-${id}`,
    status: 'Quoted',
    quotes: [{ optionId: 'option-01', premium, currency: 'MVR' }],
    remarks: '',
    statusHistory: [],
  };
}

describe('quotation request dashboard calculations', () => {
  it('derives interest weights and subtotal from section interests', () => {
    expect(quotationInterestBreakdown(section)).toEqual({
      subtotal: 1000,
      rows: [
        { interest: 'Building', sumInsured: 750, weightPct: 75 },
        { interest: 'Contents', sumInsured: 250, weightPct: 25 },
      ],
    });
  });

  it('calculates rate from premium and insured amount', () => {
    expect(quotationRateFromPremium(25, 1000)).toBe(2.5);
    expect(quotationRateFromPremium(25, 0)).toBeUndefined();
  });

  it('compares coverage limits with absolute and percentage variance', () => {
    const result = compareOptionCoverage(section.data.options[0], section.data.options[1]);
    expect(result.rows[0]).toMatchObject({ name: 'Liability', firstLimit: 100, secondLimit: 150, variance: 50, variancePct: 50 });
    expect([result.firstTotal, result.secondTotal]).toEqual([100, 150]);
  });

  it('selects the lowest valid quoted premium', () => {
    const candidates = [
      { line: quoteLine('one', 250), quote: quoteLine('one', 250).quotes[0] },
      { line: quoteLine('two', 180), quote: quoteLine('two', 180).quotes[0] },
      { line: { ...quoteLine('declined', 10), status: 'Declined' as const }, quote: quoteLine('declined', 10).quotes[0] },
      {
        line: { ...quoteLine('expired', 1), quotes: [{ optionId: 'option-01', premium: 1, currency: 'MVR' as const, validUntil: '2020-01-01' }] },
        quote: { optionId: 'option-01', premium: 1, currency: 'MVR' as const, validUntil: '2020-01-01' },
      },
    ];
    expect(selectBestQuote(candidates)?.line.id).toBe('two');
  });

  it('flags quotes expiring within the configured window only', () => {
    const now = new Date('2026-11-11T12:00:00');
    expect(isQuoteExpiring('2026-11-30', now, 30)).toBe(true);
    expect(isQuoteExpiring('2027-01-01', now, 30)).toBe(false);
    expect(isQuoteExpiring('2026-11-01', now, 30)).toBe(false);
  });

  it('calculates annual, monthly, and daily indicative premium', () => {
    expect(calculateIndicativePremium(100000, 2)).toEqual({
      annual: 2000, monthly: 2000 / 12, daily: 2000 / 365,
    });
    expect(calculateIndicativePremium(-1, 2)).toBeUndefined();
  });
});
