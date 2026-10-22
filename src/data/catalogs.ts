import type { Insurer, ProductCode } from '../types';

export const INSURERS: Insurer[] = [
  { id: 'ins1', name: 'Allied Insurance Company', shortName: 'Allied', commissionRate: 15, address: '' },
  { id: 'ins2', name: 'Dhivehi Insurance Company', shortName: 'Dhivehi', commissionRate: 12, address: '' },
  { id: 'ins3', name: 'Amana Takaful', shortName: 'Amana', commissionRate: 14, address: '' },
  { id: 'ins4', name: 'Ceylinco Insurance', shortName: 'Ceylinco', commissionRate: 13, address: '' },
];

export const PRODUCT_CODES: ProductCode[] = [
  { code: 'AB', name: 'Advance Bond', category: 'Bonds', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'BB', name: 'Bid Bond', category: 'Bonds', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'CB', name: 'Performance Bond', category: 'Bonds', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'CM', name: 'Comprehensive Machinery', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'CP', name: 'Electronic Equipment', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'CR', name: 'Computer Crime', category: 'Engineering', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 17.5, isStatutoryMandatory: false },
  { code: 'FZ', name: "Contractor's Plant & Machinery", category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'IR', name: 'Industrial All Risks (Engineering)', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'LM', name: 'Machinery Con Loss', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'NC', name: 'Contractors All Risks', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'NE', name: 'Erection All Risks', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'NM', name: 'Machinery Breakdown', category: 'Engineering', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'CF', name: 'Commercial Fire', category: 'Fire', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'DF', name: 'Dwelling Fire', category: 'Fire', classType: 'PROPERTY', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'FIR', name: 'Industrial All Risks (Fire)', category: 'Fire', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'FY', name: 'Terrorism and Sabotage', category: 'Fire', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'HC', name: 'Hotel Combine', category: 'Fire', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'LP', name: 'Consequential Loss', category: 'Fire', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'PR', name: 'Property All Risk', category: 'Fire', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'EC', name: 'Export Certificate', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'EP', name: 'Export Policy', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'IC', name: 'Import Certificate', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'IP', name: 'Import Policy', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'LC', name: 'Land Cover', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'LT', name: 'Land Transit', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'OP', name: 'Open Policy', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'RJ', name: 'Rejection Cover', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'SH', name: 'Hull Policy', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'ZZ', name: 'Special Marine Policy', category: 'Marine', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'AL', name: 'Airport Owners & Operators Liability', category: 'Miscellaneous', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'AP', name: 'Personal Accident', category: 'Miscellaneous', classType: 'RETAIL_PERSONAL', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'BL', name: 'Bankers Indemnity', category: 'Miscellaneous', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 17.5, isStatutoryMandatory: false },
  { code: 'CG', name: 'Fidelity Guarantee', category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'CT', name: 'Travelclasics', category: 'Miscellaneous', classType: 'RETAIL_PERSONAL', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 20, isStatutoryMandatory: false },
  { code: 'DL', name: 'Doctors Liability', category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 20, isStatutoryMandatory: false },
  { code: 'DO', name: 'Directors & Officers Liability', category: 'Miscellaneous', classType: 'SPECIALTY_FINANCIAL', defaultPipelineCode: 'FINANCIAL_SPECIALTY', standardBrokerageRatePct: 20, isStatutoryMandatory: false },
  { code: 'EL', name: "Workmen's Compensation", category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 12.5, isStatutoryMandatory: true },
  { code: 'FL', name: 'Freight Forwarders Liability', category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'GL', name: 'Plate Glass Insurance', category: 'Miscellaneous', classType: 'PROPERTY', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'GT', name: 'Goods in Transit', category: 'Miscellaneous', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'HB', name: 'Burglary & Housebreaking', category: 'Miscellaneous', classType: 'PROPERTY', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'HE', name: 'Surgical and Hospital Expenses', category: 'Miscellaneous', classType: 'EMPLOYEE_BENEFITS', defaultPipelineCode: 'EMPLOYEE_BENEFITS', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'HR', name: 'Hull All Risk', category: 'Miscellaneous', classType: 'MARINE_AVIATION', defaultPipelineCode: 'MARINE_CARGO', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'MR', name: 'All Risks', category: 'Miscellaneous', classType: 'PROPERTY', defaultPipelineCode: 'SME_VELOCITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
  { code: 'MT', name: 'Money in Transit', category: 'Miscellaneous', classType: 'PROPERTY', defaultPipelineCode: 'COMMERCIAL_ENG', standardBrokerageRatePct: 12.5, isStatutoryMandatory: false },
  { code: 'PL', name: 'Product Liability', category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 17.5, isStatutoryMandatory: false },
  { code: 'PN', name: 'Professional Indemnity Insurance', category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 20, isStatutoryMandatory: false },
  { code: 'SI', name: 'Suwa Sampatha International', category: 'Health', classType: 'EMPLOYEE_BENEFITS', defaultPipelineCode: 'EMPLOYEE_BENEFITS', standardBrokerageRatePct: 10, isStatutoryMandatory: false },
  { code: 'TL', name: 'Public Liability', category: 'Miscellaneous', classType: 'CASUALTY_LIABILITY', defaultPipelineCode: 'CASUALTY_LIABILITY', standardBrokerageRatePct: 15, isStatutoryMandatory: false },
].map((product) => ({ ...product, description: product.name }));

export const FUNNELS = [
  { id: 'f1', name: 'Broker Sales Funnel', stages: ['Lead Identified', 'Contact Made', 'Key Person Identified', 'Quoted', 'Internal Slip'] },
  { id: 'f2', name: 'Renewals Funnel', stages: ['Renewal Notice', 'Quote Sent', 'Negotiation', 'Bound', 'Closed Won'] },
];

export const BANK_DETAILS = {
  bankName: '',
  mvrAccount: '',
  usdAccount: '',
  swift: '',
};

export const COMPANY = {
  name: '',
  legalName: '',
  address: '',
  email: '',
  phone: '',
  registration: '',
};
