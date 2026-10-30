import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import type {
  Activity, Client, Deal, Invoice, Lead, Payment, Pipeline, PipelineStage,
  Role, StageHistoryAudit, TaxRate, User, ProductCode,
} from '../types';
import { COMPANY, PRODUCT_CODES } from '../data/catalogs';
import { createDefaultCustomerLookups, mergeCustomerLookups, type CustomerLookups } from '../data/customerLookups';
import { supabase, TENANT_ID } from '../lib/supabase';
import {
  createSampleLeads,
  initializeSampleLeads as persistSampleLeads,
  SAMPLE_LEAD_IDS,
} from '../lib/sampleLeads';
import { createSampleWorkspace } from '../lib/sampleWorkspace';
import { reconcileContactAssociations } from '../utils/contactProfiles';

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
}

type AuditedRecord = Lead | Deal;

function auditValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
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
const AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';
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

function writeArray(resource: string, items: unknown[]) {
  return supabase.rpc('sync_tenant_records', { p_resource: resource, p_records: sanitizeRecords(items) });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(GUEST_USER);
  const [viewAsRole, setViewAsRoleState] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(!AUTH_BYPASS);
  const [authError, setAuthError] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [customerLookups, setCustomerLookups] = useState<CustomerLookups>(createDefaultCustomerLookups);
  const [products, setProducts] = useState<ProductCode[]>(() => PRODUCT_CODES.map((product) => ({ ...product, id: product.code })));
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [company, setCompany] = useState<typeof COMPANY>(COMPANY);
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>(DEFAULT_EMAIL_TEMPLATES);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistoryAudit[]>([]);
  const [dataReady, setDataReady] = useState(AUTH_BYPASS);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const auditSnapshot = useRef<{ leads: Lead[]; deals: Deal[]; clients: Client[] } | null>(null);
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
      const sampleWorkspace = createSampleWorkspace(DEMO_USER);
      setUsers([DEMO_USER]);
      setLeads(sampleWorkspace.leads);
      setDeals(sampleWorkspace.deals);
      setClients(sampleWorkspace.clients);
      setActivities(sampleWorkspace.activities);
      setPipelines(sampleWorkspace.pipelines);
      setPipelineStages(sampleWorkspace.pipelineStages);
      setStageHistory(sampleWorkspace.stageHistory);
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
    setLeads((current) => [
      ...current.filter((lead) => !sampleIdSet.has(lead.id)),
      ...samples,
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
          .select('resource, record_id, data')
          .eq('tenant_id', TENANT_ID);
        if (error) throw new Error(`Could not load Supabase records: ${error.message}`);
        if (cancelled) return;
        const records = (data ?? []) as TenantRecord[];
        setTaxRates(asArray<TaxRate>(records, 'tax-rates'));
        const loadedLeads = asArray<Lead>(records, 'leads');
        const loadedClients = asArray<Client>(records, 'clients');
        const loadedDeals = asArray<Deal>(records, 'deals');
        const contactsReconciled = reconcileContactAssociations(loadedLeads, loadedClients, loadedDeals);
        setLeads(contactsReconciled.leads);
        setClients(contactsReconciled.clients);
        const customerLookupsRecord = records.find((record) => record.resource === 'customer-lookups');
        setCustomerLookups(mergeCustomerLookups(customerLookupsRecord?.data.options));
        const savedProducts = asArray<ProductCode>(records, 'products');
        setProducts(savedProducts.length > 0 ? savedProducts.map(normalizeProduct) : PRODUCT_CODES.map((product) => ({ ...product, id: product.code })));
        setActivities(asArray<Activity>(records, 'activities'));
        setDeals(loadedDeals);
        setInvoices(asArray<Invoice>(records, 'invoices'));
        setPayments(asArray<Payment>(records, 'payments'));
        setPipelines(asArray<Pipeline>(records, 'pipelines'));
        setPipelineStages(asArray<PipelineStage>(records, 'pipeline-stages'));
        setStageHistory(asArray<StageHistoryAudit>(records, 'stage-history'));
        const companyRecord = records.find((record) => record.resource === 'company');
        setCompany(companyRecord ? companyRecord.data as typeof COMPANY : COMPANY);
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
      'customer-lookups': [{ id: 'customer-lookups', options: customerLookups }],
      products,
      activities,
      deals,
      invoices,
      payments,
      pipelines,
      'pipeline-stages': pipelineStages,
      'stage-history': stageHistory,
      company: [{ id: 'company-settings', ...company }],
      'email-templates': [{ id: 'email-templates', templates: emailTemplates }],
    };
    const writableByRole: Record<Role, string[]> = {
      admin: Object.keys(allResources),
      sales: ['leads', 'clients', 'customer-lookups', 'activities', 'deals', 'stage-history'],
      finance: ['invoices', 'payments'],
      client: [],
    };
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        const results = await Promise.all(
          writableByRole[user.role].map((resource) => writeArray(resource, allResources[resource])),
        );
        const failed = results.find((result) => result.error);
        if (failed?.error) {
          console.error('Could not persist app records to Supabase.', failed.error);
          setPersistenceError(`Supabase save failed: ${failed.error.message}`);
          return;
        }
        setPersistenceError(null);
      }).catch((error: unknown) => {
        console.error('Could not persist app records to Supabase.', error);
        setPersistenceError(error instanceof Error ? error.message : 'Supabase save failed.');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    dataReady, user.id, user.role, taxRates, leads, clients, activities, deals,
    invoices, payments, pipelines, pipelineStages, stageHistory, company, emailTemplates, customerLookups, products,
  ]);

  useEffect(() => {
    if (!dataReady || !user.id || user.role === 'client') {
      auditSnapshot.current = null;
      auditUserId.current = user.id;
      return;
    }

    if (!auditSnapshot.current || auditUserId.current !== user.id) {
      auditSnapshot.current = { leads, deals, clients };
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

    auditSnapshot.current = { leads, deals, clients };
    const audits = [...leadAudits, ...dealAudits, ...contactAudits];
    if (audits.length) setActivities((current) => [...audits, ...current]);
  }, [clients, dataReady, deals, leads, user, setActivities]);

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
    signIn, register, signOut, initializeSampleLeads, hasAccess,
    taxRates, setTaxRates, leads, setLeads, clients, setClients, customerLookups, setCustomerLookups, products, setProducts,
    activities, setActivities,
    deals, setDeals, invoices, setInvoices, payments, setPayments, users, setUsers,
    createUser, updateUserProfile, company, setCompany, emailTemplates, setEmailTemplates, persistenceError,
    pipelines, setPipelines, pipelineStages, setPipelineStages, stageHistory, setStageHistory,
  }), [
    user, authLoading, authError, viewAsRole, setViewAsRole, signIn, register, signOut, initializeSampleLeads, hasAccess,
    taxRates, leads, clients, customerLookups, products, activities, deals, invoices, payments, users,
    createUser, updateUserProfile, company, emailTemplates, persistenceError, pipelines, pipelineStages, stageHistory,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
