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
  createdAt?: string;
  created_at?: string;
  startDate?: string;
  start_date?: string;
  updatedAt?: string;
  stageChangedAt?: string;
  stage_changed_at?: string;
  stageHistory?: LeadStageTransition[];
  contactedAt?: string;
  contacted_at?: string;
  personId?: string;
  contactProfileId?: string;
  contactRole?: string;
  person?: string;
  clientId?: string;
  client: string;
  title?: string;
  value?: number;
  valueMvr?: number;
  brokerageRatePct?: number;
  brokerageCommission?: number;
  currency?: 'MVR' | 'USD';
  exchangeRate?: number;
  pipelineId?: string;
  closeDate?: string;
  /** Legacy values are retained for backwards-compatible reads; new Leads are always individual. */
  visibility?: 'individual' | 'company' | 'owner_group';
  contact: string;
  contactEmail?: string;
  contactPhone?: string;
  whatsapp?: string;
  telegram?: string;
  contacts?: CompanyContactProfile[];
  source?: string;
  notes?: string;
  country: string;
  insuranceClass: string;
  productCode: string;
  temperature: LeadTemperature;
  status: ActivityStatus;
  funnelStage: string;
  disposition?: 'converted' | 'lost';
  lossReason?: string;
  renewalDate: string;
  sumInsured: number;
  premium: number;
  ownerId: string;
  lastActivity: string;
  leadFunnelStage?: LeadFunnelStage;
  dealId?: string;
  routedAt?: string;
}

export interface LeadStageTransition {
  fromStage: string;
  toStage: string;
  enteredAt: string;
  entered_at?: string;
  timestamp?: string;
  created_at?: string;
  date?: string;
  durationDays: number;
}

export interface LeadStageHistoryRecord {
  id: string;
  lead_id: string;
  leadId?: string;
  stage: string;
  entered_at: string;
  exited_at?: string;
  duration_days?: number;
  is_current: boolean;
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
  contacts?: CompanyContactProfile[];
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

export interface CompanyContactProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  whatsapp?: string;
  telegram?: string;
  linkedLeadIds?: string[];
  linkedDealIds?: string[];
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
  createdAt?: string;
  clientId: string;
  leadId?: string;
  dealId?: string;
  insurer?: string;
  type: 'call' | 'meeting' | 'email' | 'upload' | 'note' | 'quote' | 'task';
  title: string;
  description: string;
  date: string;
  dueDate?: string;
  done?: boolean;
  userId: string;
  meetingMode?: 'Call' | 'Online' | 'Site Visit' | 'Physical Meeting';
  venue?: string;
  personsMet?: string;
  outcome?: string;
  followUpAction?: string;
  durationMinutes?: number;
  quoteAmount?: number;
  quoteCurrency?: 'MVR' | 'USD';
  quoteExchangeRate?: number;
  actorName?: string;
}

export type VendorType = 'Insurer' | 'Reinsurer' | 'Surveyor' | 'Loss Adjuster' | 'Other';

export interface Vendor {
  id: string;
  name: string;
  vendorType: VendorType;
  country: string;
  currency: 'MVR' | 'USD';
  address: string;
  taxId?: string;
  licenseNo?: string;
  email?: string;
  phone?: string;
  contacts?: CompanyContactProfile[];
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
}

export interface QuotationRequest {
  id: string;
  ref: string;
  dealId: string;
  leadId: string;
  clientId: string;
  vendorIds: string[];
  productCode: string;
  sumInsured: number;
  currency: 'MVR' | 'USD';
  requiredBy: string;
  notes: string;
  attachments?: string[];
  status: 'Draft' | 'Sent' | 'Responses received' | 'Closed';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Insurer {
  id: string;
  name: string;
  shortName: string;
  commissionRate: number;
  address: string;
}

export interface ProductCode {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: string;
  classType: string;
  defaultPipelineCode: string;
  standardBrokerageRatePct: number;
  isStatutoryMandatory: boolean;
  salesCycleVelocity?: string;
  riskLevel?: 'Low' | 'Medium' | 'High' | 'Very High';
  keyUnderwritingIntakeArtifacts?: string;
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
  stageChangedAt?: string;
  renewalForClientId?: string;
  renewalExpiry?: string;
  renewalForDealId?: string;
  renewalDealId?: string;
  policyExpiry?: string;
  linkedInvoiceId?: string;
  client: string;
  clientId?: string;
  product: string;
  productCode?: string;
  value: number;
  weighted: number;
  brokerageRatePct?: number;
  brokerageCommission?: number;
  currency: 'MVR' | 'USD';
  exchangeRate?: number;
  stage: string;
  probability: number;
  ownerId: string;
  closeDate: string;
  insurer: string;
  vendorId?: string;
  leadId: string;
  contactName?: string;
  contactProfileId?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;
  whatsapp?: string;
  telegram?: string;
  disposition?: 'won' | 'lost';
  intentTier?: 'P1' | 'P2' | 'P3';
  proposalSummary?: string;
  lossReason?: string;
  nextActivityAt?: string;
  nextActivityTitle?: string;
  nextActivityCreatedAt?: string;
  source?: string;
  notes?: string;
  intakeCompleted?: boolean;
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
  shortLabel?: string;
  purpose?: string;
  stageOrder: number;
  winProbabilityPct: number;
  stagnationDaysThreshold: number;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
  requiresApproval?: boolean;
}

export interface StageHistoryAudit {
  id: string;
  tenantId: string;
  dealId: string;
  userId?: string;
  userName?: string;
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
