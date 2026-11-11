import type {
  ProductCode, QuotationSection, QuotationSectionData, QuotationSectionTemplate,
} from '../types';

interface SectionTemplateDefinition {
  id: QuotationSectionTemplate;
  interestLabels: string[];
  materialFields: string[];
  deductibles: string[];
  extensions: string[];
  businessInterruption?: boolean;
  options?: string[];
  optionCoverageHeads?: string[];
}

const templates: Record<QuotationSectionTemplate, SectionTemplateDefinition> = {
  property: {
    id: 'property',
    interestLabels: ['Building', 'Contents', 'Stock', 'Plant and machinery'],
    materialFields: ['Construction', 'Occupancy', 'Fire protection', 'Claims experience'],
    deductibles: ['Fire', 'Natural perils', 'All other perils'],
    extensions: ['Debris removal', 'Professional fees', 'Temporary removal'],
  },
  'business-interruption': {
    id: 'business-interruption',
    interestLabels: [],
    materialFields: ['Indemnity basis', 'Maximum indemnity period', 'Claims experience'],
    deductibles: ['Waiting period'],
    extensions: ['Additional increased cost of working'],
    businessInterruption: true,
  },
  liability: {
    id: 'liability',
    interestLabels: [],
    materialFields: ['Business description', 'Turnover', 'Territorial jurisdiction', 'Claims experience'],
    deductibles: ['Third party property damage'],
    extensions: ['Cross liability', 'Principal indemnity'],
    options: ['Option 01', 'Option 02'],
    optionCoverageHeads: ['Public liability', 'Products liability', 'Personal injury'],
  },
  terrorism: {
    id: 'terrorism',
    interestLabels: ['Property damage', 'Business interruption'],
    materialFields: ['Occupancy', 'Security arrangements', 'Accumulation exposure'],
    deductibles: ['Property damage'],
    extensions: ['Sabotage', 'Malicious damage'],
  },
  fidelity: {
    id: 'fidelity',
    interestLabels: ['Per employee', 'Annual aggregate'],
    materialFields: ['Employee count', 'Employee categories', 'Internal controls', 'Claims experience'],
    deductibles: ['Each and every loss'],
    extensions: ['Discovery period'],
  },
  'money-transit': {
    id: 'money-transit',
    interestLabels: ['Any one carrying', 'Any one vehicle', 'Annual estimate'],
    materialFields: ['Transit routes', 'Transit frequency', 'Security arrangements'],
    deductibles: ['Each and every loss'],
    extensions: ['Cash in safe', 'Cash in counter'],
  },
  'marine-cargo': {
    id: 'marine-cargo',
    interestLabels: ['Any one conveyance', 'Annual turnover'],
    materialFields: ['Voyage / trade', 'Cargo description', 'Packing', 'Conveyance', 'Claims experience'],
    deductibles: ['Each and every loss'],
    extensions: ['War and strikes', 'Increased value'],
  },
  'marine-hull': {
    id: 'marine-hull',
    interestLabels: ['Hull and machinery', 'Increased value'],
    materialFields: ['Vessel name', 'Vessel type', 'Year built', 'Flag', 'Trading limits', 'Claims experience'],
    deductibles: ['Hull and machinery'],
    extensions: ['War risks', 'Protection and indemnity'],
  },
  general: {
    id: 'general',
    interestLabels: ['Insured interest'],
    materialFields: ['Risk description', 'Claims experience'],
    deductibles: ['Standard deductible'],
    extensions: ['Additional extension'],
  },
};

const templateByProductCode: Record<string, QuotationSectionTemplate> = {
  PR: 'property',
  CF: 'property',
  FIR: 'property',
  LP: 'business-interruption',
  TL: 'liability',
  FY: 'terrorism',
  CG: 'fidelity',
  MT: 'money-transit',
  OP: 'marine-cargo',
  SH: 'marine-hull',
  HR: 'marine-hull',
};

export function getQuotationSectionTemplate(productCode: string): SectionTemplateDefinition {
  return templates[templateByProductCode[productCode.toUpperCase()] ?? 'general'];
}

function createSectionData(template: SectionTemplateDefinition): QuotationSectionData {
  return {
    template: template.id,
    interests: template.interestLabels.map((interest) => ({ interest, sumInsured: 0 })),
    ...(template.businessInterruption ? { businessInterruption: { grossProfit: 0, indemnityMonths: 12 } } : {}),
    totalSumInsured: 0,
    deductibles: template.deductibles.map((label) => `${label}: `),
    extensions: template.extensions.map((name) => ({ name, limit: '' })),
    materialInfo: Object.fromEntries(template.materialFields.map((field) => [field, ''])),
    options: (template.options ?? []).map((label, index) => ({
      id: `option-${String(index + 1).padStart(2, '0')}`,
      label,
      coverages: (template.optionCoverageHeads ?? [label]).map((name) => ({ name, limit: 0 })),
    })),
  };
}

export function createQuotationSection(
  id: string,
  no: number,
  product: Pick<ProductCode, 'code' | 'name'>,
): QuotationSection {
  const template = getQuotationSectionTemplate(product.code);
  return {
    id,
    no,
    productCode: product.code,
    title: product.name,
    data: createSectionData(template),
    status: 'Active',
  };
}

export function quotationSectionTotal(data: QuotationSectionData) {
  const interests = data.interests.reduce((total, item) =>
    total + (Number.isFinite(item.sumInsured) ? Math.max(item.sumInsured, 0) : 0), 0);
  const businessInterruption = data.businessInterruption?.grossProfit ?? 0;
  const optionLimit = data.options.reduce((largest, option) =>
    Math.max(largest, option.coverages.reduce((sum, coverage) =>
      sum + (Number.isFinite(coverage.limit) ? Math.max(coverage.limit, 0) : 0), 0)), 0);
  return interests + businessInterruption + optionLimit;
}

export function withSectionTotal(data: QuotationSectionData): QuotationSectionData {
  return { ...data, totalSumInsured: quotationSectionTotal(data) };
}

export function validateQuotationSection(section: QuotationSection) {
  const errors: string[] = [];
  if (!section.productCode.trim()) errors.push(`${section.title || 'Section'} needs a product.`);
  if (!section.title.trim()) errors.push('Every section needs a title.');
  if (!Number.isFinite(quotationSectionTotal(section.data)) || quotationSectionTotal(section.data) <= 0) {
    errors.push(`${section.title || 'Section'} needs a positive insured value or coverage limit.`);
  }
  if (section.data.interests.some((item) => item.interest.trim() && (!Number.isFinite(item.sumInsured) || item.sumInsured < 0))) {
    errors.push(`${section.title || 'Section'} has an invalid interest sum insured.`);
  }
  if (section.data.businessInterruption
    && (!Number.isFinite(section.data.businessInterruption.grossProfit)
      || section.data.businessInterruption.grossProfit < 0
      || !Number.isInteger(section.data.businessInterruption.indemnityMonths)
      || section.data.businessInterruption.indemnityMonths < 1)) {
    errors.push(`${section.title || 'Section'} has invalid business interruption details.`);
  }
  if (section.data.targetRatePct !== undefined
    && (!Number.isFinite(section.data.targetRatePct) || section.data.targetRatePct < 0)) {
    errors.push(`${section.title || 'Section'} has an invalid target rate percentage.`);
  }
  if (section.data.options.some((option) => option.coverages.some((coverage) =>
    !coverage.name.trim() || !Number.isFinite(coverage.limit) || coverage.limit < 0))) {
    errors.push(`${section.title || 'Section'} has invalid option coverage limits.`);
  }
  return errors;
}
