import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import type {
  Activity, Client, Deal, Invoice, Lead, LeadStageHistoryRecord, Payment, Pipeline, PipelineStage,
  QuotationRequest, Role, StageHistoryAudit, TaxRate, User, ProductCode, Vendor,
} from '../types';
import { COMPANY, PRODUCT_CODES } from '../data/catalogs';
import { DEAL_PIPELINE_STAGES } from '../data/pipelineStageTemplates';
import { migrateVendorData } from '../data/vendors';
import {
  createDefaultCustomerLookups,
  mergeCustomerLookups,
  type CustomerLookupKey,
  type CustomerLookups,
} from '../data/customerLookups';
import { AUTH_BYPASS, supabase, TENANT_ID } from '../lib/supabase';
import {
  createSampleLeadActivities,
  createSampleLeads,
  initializeSampleLeads as persistSampleLeads,
  SAMPLE_LEAD_IDS,
} from '../lib/sampleLeads';
import { reconcileContactAssociations } from '../utils/contactProfiles';
import { isLostPipelineStage, isWonPipelineStage } from '../utils/stageSla';
import { buildLeadStageHistoryRecords, hydrateLeadStageHistory } from '../utils/leadLifecycle';
import { migrateDealLeadLinks } from '../utils/dealFactory';
import { createDemoSeed } from '../dev/demoSeed';

interface AppState {
  user: User;
  authLoading: boolean;
  authError: string | null;
  viewAsRole: Role | null;
  setViewAsRole: (role: Role | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initializeSampleLeads: (ownerIds?: string[]) => Promise<void>;
  hasAccess: (allowed: Role[]) => boolean;
  dataReady: boolean;
  taxRates: TaxRate[];
  setTaxRates: (items: TaxRate[]) => void;
  leads: Lead[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  clients: Client[];
  setClients: Dispatch<SetStateAction<Client[]>>;
  customerLookups: CustomerLookups;
  setCustomerLookups: Dispatch<SetStateAction<CustomerLookups>>;
  products: ProductCode[];
  setProducts: Dispatch<SetStateAction<ProductCode[]>>;
  activities: Activity[];
  setActivities: (items: Activity[]) => void;
  vendors: Vendor[];
  setVendors: Dispatch<SetStateAction<Vendor[]>>;
  quotationRequests: QuotationRequest[];
  setQuotationRequests: Dispatch<SetStateAction<QuotationRequest[]>>;
  deals: Deal[];
  setDeals: Dispatch<SetStateAction<Deal[]>>;
  invoices: Invoice[];
  setInvoices: (items: Invoice[]) => void;
  payments: Payment[];
  setPayments: (items: Payment[]) => void;
  users: User[];
  setUsers: (items: User[]) => void;
  createUser: (user: { name: string; email: string; password: string; role: Role; title: string }) => Promise<User>;
  updateUserProfile: (user: Pick<User, 'id' | 'name' | 'title' | 'role'>) => Promise<User>;
  company: typeof COMPANY;
  setCompany: (company: typeof COMPANY) => void;
  emailTemplates: Record<string, string>;
  setEmailTemplates: (templates: Record<string, string>) => void;
  persistenceError: string | null;
  pipelines: Pipeline[];
  setPipelines: Dispatch<SetStateAction<Pipeline[]>>;
  pipelineStages: PipelineStage[];
  setPipelineStages: Dispatch<SetStateAction<PipelineStage[]>>;
  stageHistory: StageHistoryAudit[];
  setStageHistory: Dispatch<SetStateAction<StageHistoryAudit[]>>;
}

interface ProfileRecord {
  id: string;
  name: string;
  email: string;
  role: 'System Admin' | 'Sales' | 'Accountant' | 'Client';
  title: string;
  client_record_id?: string | null;
}

interface TenantRecord {
  resource: string;
  record_id: string;
  data: Record<string, unknown>;
  updated_at: string;
}

type AuditedRecord = Lead | Deal;

function auditValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function auditFieldName(field: string): string {
  const labels: Record<string, string> = {
    contact: 'Primary contact',
    contactName: 'Contact name',
    contactEmail: 'Contact email',
    contactPhone: 'Contact phone',
    contactRole: 'Contact role',
    contactProfileId: 'Contact profile',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    funnelStage: 'Lead stage',
    disposition: 'Lead outcome',
    lossReason: 'Loss reason',
    temperature: 'Lead temperature',
    status: 'Activity status',
    stage: 'Deal stage',
    ownerId: 'Owner',
    closeDate: 'Expected close date',
    renewalDate: 'Renewal date',
    contacts: 'Contacts',
    notes: 'Notes',
  };
  return labels[field] ?? field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

function auditRecordChange(
  kind: 'Lead' | 'Deal',
  previous: AuditedRecord | undefined,
  current: AuditedRecord | undefined,
  user: User,
  now: string,
): Activity | undefined {
  const record = current ?? previous;
  if (!record) return undefined;
  const lead = kind === 'Lead' ? record as Lead : undefined;
  const deal = kind === 'Deal' ? record as Deal : undefined;
  const leadId = lead?.id ?? deal?.leadId;
  const dealId = deal?.id ?? lead?.dealId;
  const recordName = lead?.title ?? deal?.product ?? record.client;
  let title: string;
  let description: string;

  if (!previous) {
    title = `${kind} created`;
    const initialChanges = [`Record: — → ${recordName}`];
    if (lead) {
      initialChanges.push(
        `Lead stage: — → ${lead.funnelStage}`,
        `Lead temperature: — → ${lead.temperature}`,
        `Activity status: — → ${lead.status}`,
      );
    } else if (deal) {
      initialChanges.push(`Deal stage: — → ${deal.stage}`);
    }
    description = initialChanges.join(' · ');
  } else if (!current) {
    title = `${kind} deleted`;
    description = `Record: ${recordName} → —`;
  } else {
    const fields = new Set([...Object.keys(previous), ...Object.keys(current)]);
    const changes = [...fields].flatMap((field) => {
      const oldValue = (previous as unknown as Record<string, unknown>)[field];
      const newValue = (current as unknown as Record<string, unknown>)[field];
      return JSON.stringify(oldValue) === JSON.stringify(newValue)
        ? []
        : [`${auditFieldName(field)}: ${auditValue(oldValue)} → ${auditValue(newValue)}`];
    });
    if (!changes.length) return undefined;
    const oldStage = kind === 'Lead' ? (previous as Lead).funnelStage : (previous as Deal).stage;
    const newStage = kind === 'Lead' ? (current as Lead).funnelStage : (current as Deal).stage;
    const stageChanged = oldStage !== newStage;
    const temperatureChanged = kind === 'Lead'
      && (previous as Lead).temperature !== (current as Lead).temperature;
    title = stageChanged
      ? `${kind} stage changed: ${oldStage} → ${newStage}`
      : temperatureChanged
        ? `Lead temperature changed: ${(previous as Lead).temperature} → ${(current as Lead).temperature}`
        : `${kind} updated`;
    description = changes.join(' · ');
  }

  return {
    id: `audit-${crypto.randomUUID()}`,
    clientId: record.clientId ?? '',
    ...(leadId ? { leadId } : {}),
    ...(dealId ? { dealId } : {}),
    type: 'note',
    title,
    description,
    date: now,
    createdAt: now,
    userId: user.id,
    actorName: user.name,
  };
}

const AppContext = createContext<AppState | null>(null);
const GUEST_USER: User = { id: '', name: 'Guest', email: '', role: 'client', title: '' };
const DEMO_USER: User = {
  id: 'local-development-admin',
  name: 'Demo Administrator',
  email: 'admin',
  role: 'admin',
  title: 'Development Demo Session',
};
const DEMO_SEED_ENABLED = AUTH_BYPASS && import.meta.env.VITE_DEMO_SEED === 'true';
const DEMO_ADMIN_USERNAME = import.meta.env.VITE_DEMO_ADMIN_USERNAME;
const DEMO_ADMIN_PASSWORD = import.meta.env.VITE_DEMO_ADMIN_PASSWORD;
const normalizeProduct = (product: ProductCode): ProductCode => {
  const catalogProduct = PRODUCT_CODES.find((item) => item.code === product.code);
  return {
    ...catalogProduct,
    ...product,
    id: product.id || product.code,
    defaultPipelineCode: 'COMMERCIAL',
    salesCycleVelocity: product.salesCycleVelocity || catalogProduct?.salesCycleVelocity || '14–30 Days',
    riskLevel: product.riskLevel || catalogProduct?.riskLevel || 'Medium',
    keyUnderwritingIntakeArtifacts: product.keyUnderwritingIntakeArtifacts || catalogProduct?.keyUnderwritingIntakeArtifacts || 'Completed proposal form, asset/risk schedule and prior claims history',
  };
};

function migratePipelineStageData(
  pipelines: Pipeline[],
  pipelineStages: PipelineStage[],
  deals: Deal[],
  stageHistory: StageHistoryAudit[],
) {
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const stageTargets = new Map<string, { stageId: string; stageOrder: number; outcome?: 'won' | 'lost' }>();
  const normalizedStages = pipelineStages.filter((stage) =>
    !activePipelines.some((pipeline) => pipeline.id === stage.pipelineId));

  for (const pipeline of activePipelines) {
    const existing = pipelineStages
      .filter((stage) => stage.pipelineId === pipeline.id)
      .sort((left, right) => left.stageOrder - right.stageOrder);
    const alreadyCanonical = DEAL_PIPELINE_STAGES.every((template, index) =>
      existing.some((stage) => stage.stageOrder === index + 1 && stage.name === template.name));
    const targets = DEAL_PIPELINE_STAGES.map((template, index) => {
      const stageOrder = index + 1;
      const previous = existing.find((stage) => stage.stageOrder === stageOrder);
      const stage: PipelineStage = {
        ...previous,
        ...template,
        ...(alreadyCanonical && previous ? {
          winProbabilityPct: previous.winProbabilityPct,
          stagnationDaysThreshold: previous.stagnationDaysThreshold,
        } : {}),
        id: previous?.id ?? `stage-${crypto.randomUUID()}`,
        pipelineId: pipeline.id,
        stageOrder,
      };
      normalizedStages.push(stage);
      return stage;
    });

    for (const stage of existing) {
      const outcome = isWonPipelineStage(stage) ? 'won' : isLostPipelineStage(stage) ? 'lost' : undefined;
      const targetOrder = outcome
        ? DEAL_PIPELINE_STAGES.length
        : Math.max(1, Math.min(stage.stageOrder, DEAL_PIPELINE_STAGES.length));
      stageTargets.set(stage.id, {
        stageId: targets[targetOrder - 1].id,
        stageOrder: targetOrder,
        outcome,
      });
    }
  }

  normalizedStages.sort((left, right) => left.pipelineId.localeCompare(right.pipelineId) || left.stageOrder - right.stageOrder);
  const normalizedDeals = deals.map((deal) => {
    const pipeline = activePipelines.find((item) => item.id === deal.pipelineId);
    if (!pipeline) return deal;
    const oldStage = pipelineStages.find((stage) =>
      stage.pipelineId === pipeline.id && stage.name === deal.stage);
    const mappedStage = oldStage ? stageTargets.get(oldStage.id) : undefined;
    const outcome = deal.disposition ?? mappedStage?.outcome
      ?? (isWonPipelineStage(deal.stage) ? 'won' : isLostPipelineStage(deal.stage) ? 'lost' : undefined);
    const stageOrder = mappedStage?.stageOrder
      ?? (outcome ? DEAL_PIPELINE_STAGES.length
        : Math.max(1, DEAL_PIPELINE_STAGES.findIndex((stage) => stage.name === deal.stage) + 1));
    const stage = DEAL_PIPELINE_STAGES[stageOrder - 1];
    return {
      ...deal,
      stage: stage.name,
      probability: outcome === 'won' ? 100 : outcome === 'lost' ? 0 : stage.winProbabilityPct,
      weighted: Math.round(deal.value * (outcome === 'won' ? 100 : outcome === 'lost' ? 0 : stage.winProbabilityPct)) / 100,
      ...(outcome ? { disposition: outcome } : {}),
    };
  });
  const normalizedHistory = stageHistory.map((entry) => ({
    ...entry,
    fromStageId: entry.fromStageId ? stageTargets.get(entry.fromStageId)?.stageId ?? entry.fromStageId : null,
    toStageId: stageTargets.get(entry.toStageId)?.stageId ?? entry.toStageId,
  }));

  return { deals: normalizedDeals, pipelineStages: normalizedStages, stageHistory: normalizedHistory };
}

const DEFAULT_EMAIL_TEMPLATES = Object.fromEntries([
  'Renewal Reminder (30/60/90)', 'Quotation Sent', 'Invoice Issued', 'Payment Receipt', 'Payment Overdue',
].map((name) => [name, '']));

const ROLE_TO_APP: Record<ProfileRecord['role'], Role> = {
  'System Admin': 'admin',
  Sales: 'sales',
  Accountant: 'finance',
  Client: 'client',
};
const ROLE_TO_PROFILE: Record<Role, ProfileRecord['role']> = {
  admin: 'System Admin',
  sales: 'Sales',
  finance: 'Accountant',
  client: 'Client',
};

function appUser(profile: ProfileRecord): User {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: ROLE_TO_APP[profile.role],
    title: profile.title,
    ...(profile.client_record_id ? { clientId: profile.client_record_id } : {}),
  };
}

function recordId(value: Record<string, unknown>, fallback?: string): string {
  for (const candidate of [value.id, value.code, value.policyCode, value.policy_code, value.record_id, fallback]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function sanitizeRecords(items: unknown[]): Record<string, unknown>[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const value = item as Record<string, unknown>;
    const id = recordId(value);
    return id ? [{ ...value, id }] : [];
  });
}

function asArray<T>(records: TenantRecord[], resource: string): T[] {
  return records
    .filter((record) => record.resource === resource)
    .flatMap((record) => {
      const value = { ...record.data, id: recordId(record.data, record.record_id) };
      return value.id ? [value as T] : [];
    });
}

function writeArray(
  resource: string,
  items: unknown[],
  versions: Map<string, string>,
  deleteMissing: boolean,
) {
  const records = sanitizeRecords(items).map((record) => {
    const updatedAt = versions.get(`${resource}:${record.id}`);
    return updatedAt ? { ...record, __expectedUpdatedAt: updatedAt } : record;
  });
  return supabase.rpc('sync_tenant_records', {
    p_resource: resource,
    p_records: records,
    p_delete_missing: deleteMissing,
  });
}

function persistedRecordMap(value: unknown): Map<string, { updated_at: string; data: Record<string, unknown> }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid record synchronization response.');
  }
  const result = new Map<string, { updated_at: string; data: Record<string, unknown> }>();
  for (const [id, row] of Object.entries(value)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Supabase returned invalid record synchronization metadata.');
    }
    const updatedAt = (row as Record<string, unknown>).updated_at;
    const data = (row as Record<string, unknown>).data;
    if (typeof updatedAt !== 'string' || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Supabase returned incomplete record synchronization metadata.');
    }
    result.set(id, { updated_at: updatedAt, data: data as Record<string, unknown> });
  }
  return result;
}

function reconcilePersistedFields<T extends { id: string }>(
  items: T[],
  records: Map<string, { updated_at: string; data: Record<string, unknown> }>,
  fields: string[],
): T[] {
  let changed = false;
  const result = items.map((item) => {
    const persisted = records.get(item.id)?.data;
    if (!persisted) return item;
    const updates = Object.fromEntries(fields
      .filter((field) => typeof persisted[field] === 'string'
        && (item as Record<string, unknown>)[field] !== persisted[field])
      .map((field) => [field, persisted[field]]));
    if (!Object.keys(updates).length) return item;
    changed = true;
    return { ...item, ...updates };
  });
  return changed ? result : items;
}

function customerLookupRecord(options: CustomerLookups) {
  const defaults = createDefaultCustomerLookups();
  const persistedOptions = Object.fromEntries(
    (Object.keys(defaults) as CustomerLookupKey[]).map((key) => [
      key,
      Array.isArray(options[key])
        ? options[key].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [],
    ]),
  ) as CustomerLookups;

  return { id: 'customer-lookups', options: persistedOptions };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [demoSeed] = useState(() => DEMO_SEED_ENABLED ? createDemoSeed() : null);
  const [user, setUser] = useState<User>(demoSeed ? DEMO_USER : GUEST_USER);
  const [viewAsRole, setViewAsRoleState] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(!AUTH_BYPASS);
  const [authError, setAuthError] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [leads, setLeads] = useState<Lead[]>(demoSeed?.leads ?? []);
  const [clients, setClients] = useState<Client[]>(demoSeed?.clients ?? []);
  const [customerLookups, setCustomerLookups] = useState<CustomerLookups>(createDefaultCustomerLookups);
  const [products, setProducts] = useState<ProductCode[]>(() => PRODUCT_CODES.map((product) => ({ ...product, id: product.code })));
  const [activities, setActivities] = useState<Activity[]>(demoSeed?.activities ?? []);
  const [vendors, setVendors] = useState<Vendor[]>(demoSeed?.vendors ?? []);
  const [quotationRequests, setQuotationRequests] = useState<QuotationRequest[]>(demoSeed?.quotationRequests ?? []);
  const [deals, setDeals] = useState<Deal[]>(demoSeed?.deals ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(demoSeed?.invoices ?? []);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<User[]>(demoSeed ? [DEMO_USER] : []);
  const [company, setCompany] = useState<typeof COMPANY>(COMPANY);
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>(DEFAULT_EMAIL_TEMPLATES);
  const [pipelines, setPipelines] = useState<Pipeline[]>(demoSeed?.pipelines ?? []);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(demoSeed?.pipelineStages ?? []);
  const [stageHistory, setStageHistory] = useState<StageHistoryAudit[]>(demoSeed?.stageHistory ?? []);
  const [dataReady, setDataReady] = useState(AUTH_BYPASS);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const recordVersions = useRef(new Map<string, string>());
  const auditSnapshot = useRef<{
    leads: Lead[];
    deals: Deal[];
    clients: Client[];
    vendors: Vendor[];
    quotationRequests: QuotationRequest[];
  } | null>(null);
  const auditUserId = useRef('');
  const setViewAsRole = useCallback((role: Role | null) => {
    if (user.role !== 'admin' && !AUTH_BYPASS) return;
    setViewAsRoleState(role === user.role ? null : role);
  }, [user.role]);

  const loadProfile = useCallback(async (userId: string): Promise<User> => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, title, client_record_id')
      .eq('id', userId)
      .single();
    if (error) throw new Error(`Could not load your Supabase profile: ${error.message}`);
    return appUser(data as ProfileRecord);
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) return;
    let cancelled = false;
    const syncSession = async (session: { user: { id: string } } | null) => {
      if (!session) {
        if (!cancelled) {
          setUser(GUEST_USER);
          setDataReady(false);
          setAuthLoading(false);
        }
        return;
      }
      try {
        const profile = await loadProfile(session.user.id);
        if (!cancelled) {
          setUser(profile);
          setAuthError(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Could not synchronize the Supabase session.', error);
          setAuthError(error instanceof Error ? error.message : 'Supabase authentication is unavailable.');
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        await syncSession(data.session);
      } catch (error) {
        if (!cancelled) {
          console.error('Could not restore the Supabase session.', error);
          setAuthError(error instanceof Error ? error.message : 'Supabase authentication is unavailable.');
          setAuthLoading(false);
        }
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(GUEST_USER);
        setDataReady(false);
        setAuthError(null);
        setAuthLoading(false);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void Promise.resolve().then(() => syncSession(session));
      }
    });

    void restoreSession();
    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (AUTH_BYPASS) {
      if (
        !DEMO_ADMIN_USERNAME
        || !DEMO_ADMIN_PASSWORD
        || email.trim() !== DEMO_ADMIN_USERNAME
        || password !== DEMO_ADMIN_PASSWORD
      ) {
        throw new Error('Invalid demo username or password.');
      }
      setUsers([DEMO_USER]);
      setLeads([]);
      setDeals([]);
      setClients([]);
      setActivities([]);
      setVendors([]);
      setQuotationRequests([]);
      setPipelines([]);
      setPipelineStages([]);
      setStageHistory([]);
      setUser(DEMO_USER);
      setAuthError(null);
      setDataReady(true);
      return;
    }
    const login = email.trim().toLowerCase();
    const authEmail = login === 'admin' ? import.meta.env.VITE_ADMIN_LOGIN_EMAIL?.trim() : login;
    if (!authEmail) {
      throw new Error('Set VITE_ADMIN_LOGIN_EMAIL to the valid Supabase email for the admin login alias.');
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Supabase did not return a user for this sign-in.');
    const profile = await loadProfile(data.user.id);
    setUser(profile);
    setAuthError(null);
    setDataReady(false);
  }, [loadProfile]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    if (AUTH_BYPASS) {
      throw new Error('Account registration is disabled in demo login mode.');
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw new Error(error.message);
    if (!data.session || !data.user) {
      throw new Error('Account created. Confirm your email, then sign in to continue.');
    }
    const profile = await loadProfile(data.user.id);
    setUser(profile);
    setAuthError(null);
    setDataReady(false);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (!AUTH_BYPASS) {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
    }
    setUser(GUEST_USER);
    setViewAsRoleState(null);
    setDataReady(false);
    setTaxRates([]);
    setLeads([]);
    setClients([]);
    setCustomerLookups(createDefaultCustomerLookups());
    setProducts(PRODUCT_CODES.map((product) => ({ ...product, id: product.code })));
    setActivities([]);
    setVendors([]);
    setQuotationRequests([]);
    setDeals([]);
    setInvoices([]);
    setPayments([]);
    setUsers([]);
    setCompany(COMPANY);
    setEmailTemplates(DEFAULT_EMAIL_TEMPLATES);
    setPipelines([]);
    setPipelineStages([]);
    setStageHistory([]);
    setAuthError(null);
    setPersistenceError(null);
  }, []);

  const initializeSampleLeads = useCallback(async (ownerIds = [user.id]) => {
    const validOwnerIds = ownerIds.filter(Boolean);
    if (validOwnerIds.length === 0) {
      throw new Error('Sign in as a staff user or provide an existing staff owner ID before seeding sample Leads.');
    }

    const samples = AUTH_BYPASS
      ? createSampleLeads(validOwnerIds)
      : await persistSampleLeads(validOwnerIds);
    const sampleIdSet = new Set<string>(SAMPLE_LEAD_IDS);
    const sampleActivities = createSampleLeadActivities(samples);
    setLeads((current) => [
      ...current.filter((lead) => !sampleIdSet.has(lead.id)),
      ...samples,
    ]);
    setActivities((current) => [
      ...current.filter((activity) => !SAMPLE_LEAD_IDS.some((leadId) => activity.id.startsWith(`sample-activity-${leadId}-`))),
      ...sampleActivities,
    ]);
  }, [user.id]);

  useEffect(() => {
    if (AUTH_BYPASS || authLoading || !user.id || user.id === DEMO_USER.id) return;
    let cancelled = false;
    const loadRecords = async () => {
      setDataReady(false);
      try {
        const { data, error } = await supabase
          .from('tenant_records')
          .select('resource, record_id, data, updated_at')
          .eq('tenant_id', TENANT_ID);
        if (error) throw new Error(`Could not load Supabase records: ${error.message}`);
        if (cancelled) return;
        const records = (data ?? []) as TenantRecord[];
        recordVersions.current = new Map(records.map((record) => [
          `${record.resource}:${record.record_id}`,
          record.updated_at,
        ]));
        setTaxRates(asArray<TaxRate>(records, 'tax-rates'));
        const loadedLeads = asArray<Lead>(records, 'leads');
        const leadStageHistory = asArray<LeadStageHistoryRecord>(records, 'lead-stage-history');
        const loadedClients = asArray<Client>(records, 'clients');
        const loadedDeals = asArray<Deal>(records, 'deals');
        const leadsWithHistory = hydrateLeadStageHistory(loadedLeads, leadStageHistory);
        const rawPipelines = asArray<Pipeline>(records, 'pipelines');
        const rawPipelineStages = asArray<PipelineStage>(records, 'pipeline-stages');
        const migrated = migratePipelineStageData(
          rawPipelines,
          rawPipelineStages,
          loadedDeals,
          asArray<StageHistoryAudit>(records, 'stage-history'),
        );
        const linkedRecords = migrateDealLeadLinks(migrated.deals, leadsWithHistory, loadedClients);
        const contactsReconciled = reconcileContactAssociations(linkedRecords.leads, loadedClients, linkedRecords.deals);
        setLeads(contactsReconciled.leads);
        setClients(contactsReconciled.clients);
        const customerLookupsRecord = records.find((record) => record.resource === 'customer-lookups');
        setCustomerLookups(mergeCustomerLookups(customerLookupsRecord?.data.options));
        const savedProducts = asArray<ProductCode>(records, 'products');
        setProducts(savedProducts.length > 0 ? savedProducts.map(normalizeProduct) : PRODUCT_CODES.map((product) => ({ ...product, id: product.code })));
        const rawVendors = asArray<Vendor>(records, 'vendors');
        setQuotationRequests(asArray<QuotationRequest>(records, 'quotation-requests'));
        setActivities(asArray<Activity>(records, 'activities'));
        const vendorMigration = migrateVendorData(rawVendors, linkedRecords.deals, loadedClients);
        setDeals(vendorMigration.deals);
        setVendors(vendorMigration.vendors);
        setPipelines(rawPipelines);
        setPipelineStages(migrated.pipelineStages);
        setInvoices(asArray<Invoice>(records, 'invoices'));
        setPayments(asArray<Payment>(records, 'payments'));
        setStageHistory(migrated.stageHistory);
        const companyRecord = records.find((record) => record.resource === 'company');
        const savedCompany = companyRecord?.data;
        const savedLeadStageSlaDays = savedCompany?.leadStageSlaDays;
        setCompany({
          ...COMPANY,
          ...savedCompany,
          requireNextActivityForStageChange: typeof savedCompany?.requireNextActivityForStageChange === 'boolean'
            ? savedCompany.requireNextActivityForStageChange
            : COMPANY.requireNextActivityForStageChange,
          leadStageSlaDays: {
            ...COMPANY.leadStageSlaDays,
            ...(savedLeadStageSlaDays && typeof savedLeadStageSlaDays === 'object'
              ? savedLeadStageSlaDays as Partial<typeof COMPANY.leadStageSlaDays>
              : {}),
          },
        });
        const templatesRecord = records.find((record) => record.resource === 'email-templates');
        setEmailTemplates(templatesRecord
          ? templatesRecord.data.templates as Record<string, string>
          : DEFAULT_EMAIL_TEMPLATES);
        setPersistenceError(null);
        setDataReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error('Could not load app records from Supabase.', error);
          setPersistenceError(error instanceof Error ? error.message : 'Supabase data could not be loaded.');
          setDataReady(false);
        }
      }
    };
    void loadRecords();
    return () => { cancelled = true; };
  }, [authLoading, user.id, user.role]);

  useEffect(() => {
    if (AUTH_BYPASS || !dataReady || !user.id || user.id === DEMO_USER.id) return;
    const allResources: Record<string, unknown[]> = {
      'tax-rates': taxRates,
      leads,
      clients,
      'customer-lookups': [customerLookupRecord(customerLookups)],
      products,
      activities,
      vendors,
      'quotation-requests': quotationRequests,
      deals,
      invoices,
      payments,
      pipelines,
      'pipeline-stages': pipelineStages,
      'stage-history': stageHistory,
      'lead-stage-history': buildLeadStageHistoryRecords(leads),
      company: [{ id: 'company-settings', ...company }],
      'email-templates': [{ id: 'email-templates', templates: emailTemplates }],
    };
    const writableByRole: Record<Role, string[]> = {
      admin: Object.keys(allResources),
      sales: ['leads', 'clients', 'customer-lookups', 'activities', 'vendors', 'quotation-requests', 'deals', 'stage-history', 'lead-stage-history'],
      finance: ['invoices', 'payments'],
      client: [],
    };
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const resources = writableByRole[user.role];
        const upsertOrder = [
          'clients', 'vendors', 'pipelines', 'pipeline-stages', 'leads', 'deals',
          'invoices', 'quotation-requests', 'payments', 'activities', 'stage-history',
          'lead-stage-history', 'tax-rates', 'customer-lookups', 'products', 'policy-types',
          'company', 'email-templates',
        ].filter((resource) => resources.includes(resource));
        const deleteOrder = [
          'payments', 'activities', 'audit-log', 'quotation-requests', 'invoices', 'deals',
          'stage-history', 'lead-stage-history', 'leads', 'clients', 'vendors',
          'pipeline-stages', 'pipelines', 'customer-lookups', 'tax-rates', 'products',
          'policy-types', 'company', 'email-templates',
        ].filter((resource) => resources.includes(resource));
        const savedRecords = new Map<string, Map<string, { updated_at: string; data: Record<string, unknown> }>>();

        const syncResource = async (resource: string, deleteMissing: boolean) => {
          const result = await writeArray(resource, allResources[resource], recordVersions.current, deleteMissing);
          if (result.error) {
            console.error(`Could not persist "${resource}" records to Supabase.`, result.error);
            setPersistenceError(`Supabase save failed for ${resource}: ${result.error.message}`);
            return false;
          }
          const persisted = persistedRecordMap(result.data);
          for (const [recordId, record] of persisted) {
            recordVersions.current.set(`${resource}:${recordId}`, record.updated_at);
          }
          if (!deleteMissing) savedRecords.set(resource, persisted);
          return true;
        };

        for (const resource of upsertOrder) {
          if (!await syncResource(resource, false)) return;
        }

        setDeals((current) => reconcilePersistedFields(current, savedRecords.get('deals') ?? new Map(), ['reference']));
        setQuotationRequests((current) => reconcilePersistedFields(
          current,
          savedRecords.get('quotation-requests') ?? new Map(),
          ['reference', 'ref'],
        ));
        setInvoices((current) => reconcilePersistedFields(
          current,
          savedRecords.get('invoices') ?? new Map(),
          ['invoiceNumber', 'number'],
        ));

        for (const resource of deleteOrder) {
          if (!await syncResource(resource, true)) return;
        }
        setPersistenceError(null);
      }).catch((error: unknown) => {
        console.error('Could not persist app records to Supabase.', error);
        setPersistenceError(error instanceof Error ? error.message : 'Supabase save failed.');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    dataReady, user.id, user.role, taxRates, leads, clients, activities, vendors, quotationRequests, deals,
    invoices, payments, pipelines, pipelineStages, stageHistory, company, emailTemplates, customerLookups, products,
  ]);

  useEffect(() => {
    if (!dataReady || !user.id || user.role === 'client') {
      auditSnapshot.current = null;
      auditUserId.current = user.id;
      return;
    }

    if (!auditSnapshot.current || auditUserId.current !== user.id) {
      auditSnapshot.current = { leads, deals, clients, vendors, quotationRequests };
      auditUserId.current = user.id;
      return;
    }

    const previous = auditSnapshot.current;
    const now = new Date().toISOString();
    const leadAudits = [
      ...leads.flatMap((lead) => {
        const oldLead = previous.leads.find((item) => item.id === lead.id);
        const audit = auditRecordChange('Lead', oldLead, lead, user, now);
        return audit ? [audit] : [];
      }),
      ...previous.leads
        .filter((lead) => !leads.some((item) => item.id === lead.id))
        .flatMap((lead) => {
          const audit = auditRecordChange('Lead', lead, undefined, user, now);
          return audit ? [audit] : [];
        }),
    ];
    const dealAudits = [
      ...deals.flatMap((deal) => {
        const oldDeal = previous.deals.find((item) => item.id === deal.id);
        const audit = auditRecordChange('Deal', oldDeal, deal, user, now);
        return audit ? [audit] : [];
      }),
      ...previous.deals
        .filter((deal) => !deals.some((item) => item.id === deal.id))
        .flatMap((deal) => {
          const audit = auditRecordChange('Deal', deal, undefined, user, now);
          return audit ? [audit] : [];
        }),
    ];
    const contactAudits = clients.flatMap((client) => {
      const oldClient = previous.clients.find((item) => item.id === client.id);
      if (!oldClient) return [];
      const changedFields = (['contactPerson', 'contacts', 'phone', 'email'] as const)
        .filter((field) => JSON.stringify(oldClient[field]) !== JSON.stringify(client[field]));
      if (!changedFields.length) return [];
      return [{
        id: `audit-${crypto.randomUUID()}`,
        clientId: client.id,
        type: 'note' as const,
        title: 'Client contact updated',
        description: changedFields.map((field) =>
          `${auditFieldName(field)}: ${auditValue(oldClient[field])} → ${auditValue(client[field])}`,
        ).join(' · '),
        date: now,
        createdAt: now,
        userId: user.id,
        actorName: user.name,
      }];
    });
    const vendorAudits = vendors.flatMap((vendor) => {
      const oldVendor = previous.vendors.find((item) => item.id === vendor.id);
      if (!oldVendor) return [{
        id: `audit-${crypto.randomUUID()}`,
        clientId: '',
        type: 'note' as const,
        title: 'Vendor created',
        description: `Vendor created: ${vendor.name}`,
        date: now,
        createdAt: now,
        userId: user.id,
        actorName: user.name,
      }];
      const changedFields = (['name', 'vendorType', 'country', 'currency', 'status', 'phone', 'email', 'notes'] as const)
        .filter((field) => JSON.stringify(oldVendor[field]) !== JSON.stringify(vendor[field]));
      if (!changedFields.length) return [];
      return [{
        id: `audit-${crypto.randomUUID()}`,
        clientId: '',
        type: 'note' as const,
        title: 'Vendor updated',
        description: changedFields.map((field) => `${auditFieldName(field)}: ${auditValue(oldVendor[field])} → ${auditValue(vendor[field])}`).join(' · '),
        date: now,
        createdAt: now,
        userId: user.id,
        actorName: user.name,
      }];
    });

    const quotationRequestAudits = quotationRequests.flatMap((request) => {
      const previousRequest = previous.quotationRequests.find((item) => item.id === request.id);
      if (previousRequest && previousRequest.status === request.status) return [];
      const isCreated = !previousRequest;
      const vendorNames = request.vendorIds
        .map((vendorId) => vendors.find((vendor) => vendor.id === vendorId)?.name)
        .filter((name): name is string => Boolean(name));
      return [{
        id: `audit-${crypto.randomUUID()}`,
        clientId: request.clientId,
        leadId: request.leadId,
        dealId: request.dealId,
        type: 'note' as const,
        title: isCreated ? 'Quotation request created' : 'Quotation request status changed',
        description: isCreated
          ? `${request.ref} created with status ${request.status}${vendorNames.length ? ` for ${vendorNames.join(', ')}` : ''}.`
          : `${request.ref}: ${previousRequest.status} → ${request.status}`,
        date: now,
        createdAt: now,
        userId: user.id,
        actorName: user.name,
      }];
    });

    auditSnapshot.current = { leads, deals, clients, vendors, quotationRequests };
    const audits = [...leadAudits, ...dealAudits, ...contactAudits, ...vendorAudits, ...quotationRequestAudits];
    if (audits.length) setActivities((current) => [...audits, ...current]);
  }, [clients, dataReady, deals, leads, quotationRequests, user, vendors, setActivities]);

  useEffect(() => {
    if (AUTH_BYPASS || authLoading || user.role !== 'admin' || user.id === DEMO_USER.id) return;
    let cancelled = false;
    const loadUsers = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, email, role, title, client_record_id')
        .eq('tenant_id', TENANT_ID)
        .order('name');
      if (error) {
        console.error('Could not load user profiles from Supabase.', error);
        if (!cancelled) setPersistenceError(`Could not load users: ${error.message}`);
        return;
      }
      if (!cancelled) setUsers((data ?? []).map((profile) => appUser(profile as ProfileRecord)));
    };
    void loadUsers();
    return () => { cancelled = true; };
  }, [authLoading, user.id, user.role]);

  const createUser = useCallback(async (newUser: {
    name: string; email: string; password: string; role: Role; title: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { ...newUser, role: ROLE_TO_PROFILE[newUser.role] },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error as string);
    const profile = appUser(data.user as ProfileRecord);
    setUsers((current) => [...current, profile]);
    return profile;
  }, []);

  const updateUserProfile = useCallback(async (updatedUser: Pick<User, 'id' | 'name' | 'title' | 'role'>) => {
    if (user.role !== 'admin') throw new Error('Only System Admins can update user profiles.');
    if (updatedUser.id === user.id && updatedUser.role !== user.role) {
      throw new Error('You cannot change your own role.');
    }
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        name: updatedUser.name.trim(),
        title: updatedUser.title?.trim() ?? '',
        role: ROLE_TO_PROFILE[updatedUser.role],
      })
      .eq('id', updatedUser.id)
      .eq('tenant_id', TENANT_ID)
      .select('id, name, email, role, title, client_record_id')
      .single();
    if (error) throw new Error(`Could not update user profile: ${error.message}`);
    const profile = appUser(data as ProfileRecord);
    setUsers((current) => current.map((item) => item.id === profile.id ? profile : item));
    return profile;
  }, [user.id, user.role]);

  const activeViewRole = viewAsRole ?? user.role;
  const hasAccess = useCallback(
    (allowed: Role[]) => Boolean(user.id) && allowed.includes(activeViewRole),
    [user.id, activeViewRole],
  );
  const value = useMemo(() => ({
    user, authLoading, authError, viewAsRole, setViewAsRole,
    signIn, register, signOut, initializeSampleLeads, hasAccess, dataReady,
    taxRates, setTaxRates, leads, setLeads, clients, setClients, customerLookups, setCustomerLookups, products, setProducts,
    activities, setActivities, vendors, setVendors, quotationRequests, setQuotationRequests,
    deals, setDeals, invoices, setInvoices, payments, setPayments, users, setUsers,
    createUser, updateUserProfile, company, setCompany, emailTemplates, setEmailTemplates, persistenceError,
    pipelines, setPipelines, pipelineStages, setPipelineStages, stageHistory, setStageHistory,
  }), [
    user, authLoading, authError, viewAsRole, setViewAsRole, signIn, register, signOut, initializeSampleLeads, hasAccess, dataReady,
    taxRates, leads, clients, customerLookups, products, activities, vendors, quotationRequests, deals, invoices, payments, users,
    createUser, updateUserProfile, company, emailTemplates, persistenceError, pipelines, pipelineStages, stageHistory,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
