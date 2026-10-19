import type { Insurer, ProductCode } from '../types';

export const INSURERS: Insurer[] = [
  { id: 'ins1', name: 'Allied Insurance Company', shortName: 'Allied', commissionRate: 15, address: '' },
  { id: 'ins2', name: 'Dhivehi Insurance Company', shortName: 'Dhivehi', commissionRate: 12, address: '' },
  { id: 'ins3', name: 'Amana Takaful', shortName: 'Amana', commissionRate: 14, address: '' },
  { id: 'ins4', name: 'Ceylinco Insurance', shortName: 'Ceylinco', commissionRate: 13, address: '' },
];

export const PRODUCT_CODES: ProductCode[] = [
  { code: 'AB', name: 'Advance Bond', category: 'Bonds' },
  { code: 'BB', name: 'Bid Bond', category: 'Bonds' },
  { code: 'CB', name: 'Performance Bond', category: 'Bonds' },
  { code: 'CM', name: 'Comp Machinery', category: 'Engineering' },
  { code: 'CP', name: 'Electronic Equip', category: 'Engineering' },
  { code: 'CR', name: 'Computer Crime', category: 'Engineering' },
  { code: 'FZ', name: "Contractor's Plant", category: 'Engineering' },
  { code: 'IR', name: 'Industrial All Risks', category: 'Engineering' },
  { code: 'LM', name: 'Machinery Con Loss', category: 'Engineering' },
  { code: 'NC', name: 'CAR', category: 'Engineering' },
  { code: 'NE', name: 'EAR', category: 'Engineering' },
  { code: 'NM', name: 'Machinery Breakdown', category: 'Engineering' },
  { code: 'CF', name: 'Commercial Fire', category: 'Fire' },
  { code: 'DF', name: 'Dwelling Fire', category: 'Fire' },
  { code: 'FY', name: 'Terrorism & Sabotage', category: 'Fire' },
  { code: 'HC', name: 'Hotel Combine', category: 'Fire' },
  { code: 'LP', name: 'Consequential Loss', category: 'Fire' },
  { code: 'PR', name: 'Property All Risk', category: 'Fire' },
  { code: 'EP', name: 'Export Policy', category: 'Marine' },
  { code: 'IP', name: 'Import Policy', category: 'Marine' },
  { code: 'LC', name: 'Land Cover', category: 'Marine' },
  { code: 'OP', name: 'Open Policy', category: 'Marine' },
  { code: 'SH', name: 'Hull Policy', category: 'Marine' },
  { code: 'AL', name: 'Airport Liability', category: 'Miscellaneous' },
  { code: 'AP', name: 'Personal Accident', category: 'Miscellaneous' },
  { code: 'BL', name: 'Bankers Indemnity', category: 'Miscellaneous' },
  { code: 'CG', name: 'Fidelity Guarantee', category: 'Miscellaneous' },
  { code: 'DO', name: 'D&O Liability', category: 'Miscellaneous' },
  { code: 'EL', name: "Workmen's Comp", category: 'Miscellaneous' },
  { code: 'GT', name: 'Goods in Transit', category: 'Miscellaneous' },
  { code: 'MT', name: 'Money in Transit', category: 'Miscellaneous' },
  { code: 'PL', name: 'Product Liability', category: 'Miscellaneous' },
  { code: 'PN', name: 'Professional Indemnity', category: 'Miscellaneous' },
  { code: 'TL', name: 'Public Liability', category: 'Miscellaneous' },
];

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
