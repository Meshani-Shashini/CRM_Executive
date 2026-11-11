import { describe, expect, it } from 'vitest';
import { createQuotationSection, quotationSectionTotal, validateQuotationSection } from '../quotationSectionTemplates';

describe('quotation section templates', () => {
  it('creates product-specific property, business interruption, and CGL sections', () => {
    const property = createQuotationSection('property-1', 1, { code: 'PR', name: 'Property All Risk' });
    const interruption = createQuotationSection('bi-1', 2, { code: 'LP', name: 'Consequential Loss' });
    const liability = createQuotationSection('cgl-1', 3, { code: 'TL', name: 'Public Liability' });
    expect(property.data.template).toBe('property');
    expect(interruption.data.businessInterruption?.indemnityMonths).toBe(12);
    expect(liability.data.options.map((option) => option.label)).toEqual(['Option 01', 'Option 02']);
    expect(liability.data.options[0].coverages.map((coverage) => coverage.name))
      .toEqual(['Public liability', 'Products liability', 'Personal injury']);
  });

  it('calculates totals from interests, business interruption, and the highest alternative option', () => {
    const section = createQuotationSection('section-1', 1, { code: 'TL', name: 'Public Liability' });
    section.data.options[0].coverages[0].limit = 250000;
    section.data.options[1].coverages[0].limit = 500000;
    expect(quotationSectionTotal(section.data)).toBe(500000);
    expect(validateQuotationSection(section)).toEqual([]);
  });

  it('requires a positive insured interest or coverage limit', () => {
    const section = createQuotationSection('section-1', 1, { code: 'PR', name: 'Property All Risk' });
    expect(validateQuotationSection(section)).toContain('Property All Risk needs a positive insured value or coverage limit.');
    section.data.interests[0].sumInsured = 250000;
    expect(validateQuotationSection(section)).toEqual([]);
  });
});
