import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import type {
  Activity, Client, Deal, Invoice, Lead, Payment, Pipeline, PipelineStage,
  Role, StageHistoryAudit, TaxRate, User,
} from '../types';
import {
  USERS, TAX_RATES, LEADS, CLIENTS, ACTIVITIES, DEALS, INVOICES, PAYMENTS, COMPANY,
} from '../data/seed';
import { DEFAULT_PIPELINES, DEFAULT_PIPELINE_STAGES } from '../data/pipelineDefaults';
import { supabase, TENANT_ID } from '../lib/supabase';

interface AppState {
  user: User;
  authLoading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasAccess: (allowed: Role[]) => boolean;
  taxRates: TaxRate[];
  setTaxRates: (items: TaxRate[]) => void;
  leads: Lead[];
  setLeads: (items: Lead[]) => void;
  clients: Client[];
  setClients: (items: Client[]) => void;
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
}

interface TenantRecord {
  resource: string;
  record_id: string;
  data: Record<string, unknown>;
}

const AppContext = createContext<AppState | null>(null);
const GUEST_USER: User = { id: '', name: 'Guest', email: '', role: 'client', title: '' };
const DEMO_USER: User = {
  id: 'demo-admin',
  name: 'Demo Administrator',
  email: 'demo@premierbrokers.local',
  role: 'admin',
  title: 'Development Demo Session',
};
const AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';
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
  };
}

function asArray<T>(records: TenantRecord[], resource: string): T[] {
  return records.filter((record) => record.resource === resource).map((record) => record.data as T);
}

function writeArray(resource: string, items: unknown[]) {
  return supabase.rpc('sync_tenant_records', { p_resource: resource, p_records: items });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(AUTH_BYPASS ? DEMO_USER : GUEST_USER);
  const [authLoading, setAuthLoading] = useState(!AUTH_BYPASS);
  const [authError, setAuthError] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>(AUTH_BYPASS ? TAX_RATES : []);
  const [leads, setLeads] = useState<Lead[]>(AUTH_BYPASS ? LEADS : []);
  const [clients, setClients] = useState<Client[]>(AUTH_BYPASS ? CLIENTS : []);
  const [activities, setActivities] = useState<Activity[]>(AUTH_BYPASS ? ACTIVITIES : []);
  const [deals, setDeals] = useState<Deal[]>(AUTH_BYPASS ? DEALS : []);
  const [invoices, setInvoices] = useState<Invoice[]>(AUTH_BYPASS ? INVOICES : []);
  const [payments, setPayments] = useState<Payment[]>(AUTH_BYPASS ? PAYMENTS : []);
  const [users, setUsers] = useState<User[]>(AUTH_BYPASS ? USERS : []);
  const [company, setCompany] = useState<typeof COMPANY>(COMPANY);
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>(DEFAULT_EMAIL_TEMPLATES);
  const [pipelines, setPipelines] = useState<Pipeline[]>(AUTH_BYPASS ? DEFAULT_PIPELINES : []);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(AUTH_BYPASS ? DEFAULT_PIPELINE_STAGES : []);
  const [stageHistory, setStageHistory] = useState<StageHistoryAudit[]>([]);
  const [dataReady, setDataReady] = useState(AUTH_BYPASS);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const loadProfile = useCallback(async (userId: string): Promise<User> => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, title')
      .eq('id', userId)
      .single();
    if (error) throw new Error(`Could not load your Supabase profile: ${error.message}`);
    return appUser(data as ProfileRecord);
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) return;
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          const profile = await loadProfile(data.session.user.id);
          if (!cancelled) setUser(profile);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Could not restore the Supabase session.', error);
          setAuthError(error instanceof Error ? error.message : 'Supabase authentication is unavailable.');
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Supabase did not return a user for this sign-in.');
    const profile = await loadProfile(data.user.id);
    setUser(profile);
    setAuthError(null);
    setDataReady(false);
  }, [loadProfile]);

  const register = useCallback(async (name: string, email: string, password: string) => {
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
    setDataReady(false);
    setUsers([]);
  }, []);

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
        if (records.length === 0 && user.role === 'admin') {
          setTaxRates(TAX_RATES);
          setLeads(LEADS);
          setClients(CLIENTS);
          setActivities(ACTIVITIES);
          setDeals(DEALS);
          setInvoices(INVOICES);
          setPayments(PAYMENTS);
          setPipelines(DEFAULT_PIPELINES);
          setPipelineStages(DEFAULT_PIPELINE_STAGES);
          setStageHistory([]);
          setCompany(COMPANY);
          setEmailTemplates(DEFAULT_EMAIL_TEMPLATES);
        } else {
          setTaxRates(asArray<TaxRate>(records, 'tax-rates'));
          setLeads(asArray<Lead>(records, 'leads'));
          setClients(asArray<Client>(records, 'clients'));
          setActivities(asArray<Activity>(records, 'activities'));
          setDeals(asArray<Deal>(records, 'deals'));
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
        }
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
      sales: ['leads', 'clients', 'activities', 'deals', 'stage-history'],
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
    invoices, payments, pipelines, pipelineStages, stageHistory, company, emailTemplates,
  ]);

  useEffect(() => {
    if (AUTH_BYPASS || authLoading || user.role !== 'admin' || user.id === DEMO_USER.id) return;
    let cancelled = false;
    const loadUsers = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, email, role, title')
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

  const hasAccess = useCallback((allowed: Role[]) => Boolean(user.id) && allowed.includes(user.role), [user.id, user.role]);
  const value = useMemo(() => ({
    user, authLoading, authError, signIn, register, signOut, hasAccess,
    taxRates, setTaxRates, leads, setLeads, clients, setClients, activities, setActivities,
    deals, setDeals, invoices, setInvoices, payments, setPayments, users, setUsers,
    createUser, company, setCompany, emailTemplates, setEmailTemplates, persistenceError,
    pipelines, setPipelines, pipelineStages, setPipelineStages, stageHistory, setStageHistory,
  }), [
    user, authLoading, authError, signIn, register, signOut, hasAccess,
    taxRates, leads, clients, activities, deals, invoices, payments, users,
    createUser, company, emailTemplates, persistenceError, pipelines, pipelineStages, stageHistory,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
