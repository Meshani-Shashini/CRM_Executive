// Domain types for IBMS

export type Role = 'admin' | 'sales' | 'finance' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  title?: string;
}

export type LeadTemperature = 'HOT' | 'WARM' | 'COLD';
export type ActivityStatus = 'IN-PROGRESS' | 'TO-DO' | 'BACKLOG' | 'COMPLETED';

export interface Lead {
  id: string;
  client: string;
  contact: string;
  country: string;
  insuranceClass: string;
  productCode: string;
  temperature: LeadTemperature;
  status: ActivityStatus;
  funnelStage: string;
  renewalDate: string;
  sumInsured: number;
  premium: number;
  ownerId: string;
  lastActivity: string;
}

export interface Client {
  id: string;
  name: string;
  tin: string;
  country: string;
  phone: string;
  email: string;
  address: string;
  sumInsured: number;
  premium: number;
  expiry: string;
  insurer: string;
  productCode: string;
  class: string;
  ownerId: string;
  tags: string[];
}

export interface Activity {
  id: string;
  clientId: string;
  type: 'call' | 'meeting' | 'email' | 'upload' | 'note' | 'quote';
  title: string;
  description: string;
  date: string;
  userId: string;
}

export interface Insurer {
  id: string;
  name: string;
  shortName: string;
  commissionRate: number;
  address: string;
}

export interface ProductCode {
  code: string;
  name: string;
  category: string;
}

export interface InvoiceItem {
  description: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  insurer: string;
  policyNo: string;
  issueDate: string;
  dueDate: string;
  status: 'Pending' | 'Paid' | 'Partial' | 'Overdue' | 'Archived';
  items: InvoiceItem[];
  installments: { id: string; label: string; due: string; amount: number; paid: boolean }[];
  currency: 'MVR' | 'USD';
}

export interface Payment {
  id: string;
  receiptNo: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  date: string;
  type: 'Premium' | 'Commission' | 'Fee';
  method: 'Bank Transfer' | 'Cash' | 'Card';
  status: 'Completed' | 'Pending';
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  category: 'Standard' | 'Tourism' | 'Zero-rated';
  active: boolean;
}

export interface MiraRow {
  id: string;
  date: string;
  insured: string;
  insurer: string;
  sumInsured: number;
  premium: number;
  commissionPct: number;
  commissionAmount: number;
  brokerageFee: number;
}

export interface Deal {
  id: string;
  pipelineId?: string;
  client: string;
  product: string;
  value: number;
  weighted: number;
  stage: string;
  probability: number;
  ownerId: string;
  closeDate: string;
  insurer: string;
  proposalSummary?: string;
  lossReason?: string;
}

export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  stageOrder: number;
  winProbabilityPct: number;
  stagnationDaysThreshold: number;
}

export interface StageHistoryAudit {
  id: string;
  tenantId: string;
  dealId: string;
  fromStageId: string | null;
  toStageId: string;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  lossReason?: string;
  details?: string;
}

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: 'renewal' | 'reminder' | 'meeting' | 'task';
  client: string;
  days: number; // 30/60/90 trigger
}
