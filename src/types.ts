// Domain types for IBMS

export type Role = 'admin' | 'sales' | 'finance' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId?: string;
  avatar?: string;
  title?: string;
}

export type LeadTemperature = 'HOT' | 'WARM' | 'COLD';
export type ActivityStatus = 'IN-PROGRESS' | 'TO-DO' | 'BACKLOG' | 'COMPLETED';
export type LeadFunnelStage = 'L0: Capture' | 'L1: KYC/AML Triage' | 'L2: LOB Scoping' | 'L3: Qualified Opportunity';

export interface Lead {
  id: string;
  personId?: string;
  person?: string;
  clientId?: string;
  client: string;
  title?: string;
  value?: number;
  valueMvr?: number;
  currency?: 'MVR' | 'USD';
  exchangeRate?: number;
  pipelineId?: string;
  closeDate?: string;
  /** Legacy values are retained for backwards-compatible reads; new Leads are always individual. */
  visibility?: 'individual' | 'company' | 'owner_group';
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
  leadFunnelStage?: LeadFunnelStage;
  dealId?: string;
  routedAt?: string;
}

export interface Client {
  id: string;
  name: string;
  tin: string;
  country: string;
  phone: string;
  email: string;
  address: string;
  contactPerson?: string;
  sumInsured: number;
  premium: number;
  expiry: string;
  insurer: string;
  productCode: string;
  class: string;
  ownerId: string;
  tags: string[];
  accountStatus?: 'draft' | 'active';
  insuredEntity?: InsuredEntityDetails;
}

export interface InsuredEntityDetails {
  entityType: string;
  industrySector: string;
  segment: string;
  accountHandler: string;
  branch: string;
  legalEntityName: string;
  tradeName: string;
  companyRegNo: string;
  gstStatus: string;
  businessType: string;
  administrativeAtoll: string;
  islandLocation: string;
  postalBilling: string;
  vesselMarineBase: string;
  primaryStakeholder: {
    fullName: string;
    designation: string;
    email: string;
    whatsappMobile: string;
    identificationType: string;
    idReferenceNo: string;
    pepSanctionStatus: string;
  };
  targetPremium: number;
  targetPremiumCurrency: 'MVR' | 'USD' | '';
  targetPremiumMvr: number;
  exchangeRate?: number;
  estimatedBrokeragePct: number;
  targetLines: string[];
  nextAction: {
    type: string;
    dueDate: string;
    assignedTo: string;
    notes: string;
  };
}

export interface Activity {
  id: string;
  clientId: string;
  type: 'call' | 'meeting' | 'email' | 'upload' | 'note' | 'quote';
  title: string;
  description: string;
  date: string;
  userId: string;
  quoteAmount?: number;
  quoteCurrency?: 'MVR' | 'USD';
  quoteExchangeRate?: number;
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
  classType: string;
  defaultPipelineCode: string;
  standardBrokerageRatePct: number;
  isStatutoryMandatory: boolean;
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
  linkedDealId?: string;
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
  createdAt?: string;
  renewalForClientId?: string;
  renewalExpiry?: string;
  renewalForDealId?: string;
  renewalDealId?: string;
  policyExpiry?: string;
  linkedInvoiceId?: string;
  client: string;
  product: string;
  value: number;
  weighted: number;
  currency: 'MVR' | 'USD';
  exchangeRate?: number;
  stage: string;
  probability: number;
  ownerId: string;
  closeDate: string;
  insurer: string;
  disposition?: 'won' | 'lost';
  intentTier?: 'P1' | 'P2' | 'P3';
  proposalSummary?: string;
  lossReason?: string;
  nextActivityAt?: string;
  nextActivityTitle?: string;
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
  outcome?: 'won' | 'lost';
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
