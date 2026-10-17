export type Stage = 'New' | 'Meeting' | 'Proposal' | 'Won';
export type Region = 'Europe' | 'UK' | 'APAC' | 'Maldives & Sri Lanka';

export interface Jurisdiction {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  flag: string;
  taxRates: { label: string; rate: number }[];
}

export interface Deal {
  id: string;
  company: string;
  contact: string;
  title: string;
  value: number;
  currency: string;
  stage: Stage;
  region: Region;
  jurisdictionCode: string;
  momentum: number;
  lastActivity: string;
  closeTarget: string;
  tags: string[];
  riskFlags: string[];
  owner: string;
}

export interface ComplianceAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  dealId?: string;
  jurisdictionCode?: string;
}

export interface RegionMetric {
  region: Region;
  pipelineValue: number;
  wonMTD: number;
  activeDeals: number;
  velocityDays: number;
  complianceScore: number;
}

export interface Invoice {
  number: string;
  date: string;
  customer: string;
  jurisdictionCode: string;
  items: { description: string; qty: number; unitPrice: number }[];
  taxRate: number;
  currency: string;
}

export interface CommLogEntry {
  id: string;
  channel: 'whatsapp' | 'email' | 'call' | 'note';
  from: string;
  timestamp: string;
  body: string;
}

export interface CustomerRecord {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  taxId: string;
  industry: string;
  lifetimeValue: number;
}
