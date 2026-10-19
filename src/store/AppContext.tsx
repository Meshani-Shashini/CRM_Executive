import { createContext, useContext, useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import type { User, Role, Lead, Client, Activity, Deal, Invoice, Payment } from '../types';
import { USERS, TAX_RATES, LEADS, CLIENTS, ACTIVITIES, DEALS, INVOICES, PAYMENTS, COMPANY } from '../data/seed';
import type { TaxRate } from '../types';

function loadStoredCompany() {
  try {
    const stored = window.localStorage.getItem('ibms:company');
    if (stored === null) return COMPANY;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Stored company settings are not an object');
    }
    return { ...COMPANY, ...parsed as Partial<typeof COMPANY> };
  } catch (error) {
    console.error('Could not load company settings from browser storage.', error);
    return COMPANY;
  }
}

function loadStoredList<T>(key: string, initial: T[]): T[] {
  try {
    const stored = window.localStorage.getItem(`ibms:${key}`);
    if (stored === null) return initial;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error(`Stored ${key} data is not a list`);
    return parsed as T[];
  } catch (error) {
    console.error(`Could not load ${key} from browser storage.`, error);
    return initial;
  }
}

interface AppState {
  user: User;
  setUser: (u: User) => void;
  hasAccess: (allowed: Role[]) => boolean;
  taxRates: TaxRate[];
  setTaxRates: (t: TaxRate[]) => void;
  leads: Lead[];
  setLeads: (items: Lead[]) => void;
  clients: Client[];
  setClients: (items: Client[]) => void;
  activities: Activity[];
  setActivities: (items: Activity[]) => void;
  deals: Deal[];
  setDeals: (items: Deal[]) => void;
  invoices: Invoice[];
  setInvoices: (items: Invoice[]) => void;
  payments: Payment[];
  setPayments: (items: Payment[]) => void;
  users: User[];
  setUsers: (items: User[]) => void;
  company: typeof COMPANY;
  setCompany: (company: typeof COMPANY) => void;
  storageError: string | null;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(USERS[0]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>(() => loadStoredList('tax-rates', TAX_RATES));
  const [leads, setLeads] = useState<Lead[]>(() => loadStoredList('leads', LEADS));
  const [clients, setClients] = useState<Client[]>(() => loadStoredList('clients', CLIENTS));
  const [activities, setActivities] = useState<Activity[]>(() => loadStoredList('activities', ACTIVITIES));
  const [deals, setDeals] = useState<Deal[]>(() => loadStoredList('deals', DEALS));
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadStoredList('invoices', INVOICES));
  const [payments, setPayments] = useState<Payment[]>(() => loadStoredList('payments', PAYMENTS));
  const [users, setUsers] = useState<User[]>(() => loadStoredList('users', USERS));
  const [company, setCompany] = useState<typeof COMPANY>(loadStoredCompany);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    const lists = { 'tax-rates': taxRates, leads, clients, activities, deals, invoices, payments, users };
    let writeFailed = false;
    for (const [key, value] of Object.entries(lists)) {
      try {
        window.localStorage.setItem(`ibms:${key}`, JSON.stringify(value));
      } catch (error) {
        console.error(`Could not save ${key} to browser storage.`, error);
        writeFailed = true;
      }
    }
    try {
      window.localStorage.setItem('ibms:company', JSON.stringify(company));
    } catch (error) {
      console.error('Could not save company settings to browser storage.', error);
      writeFailed = true;
    }
    setStorageError(writeFailed
      ? 'Browser storage could not save your changes. They may be lost when you reload; check storage permissions or available space.'
      : null);
  }, [taxRates, leads, clients, activities, deals, invoices, payments, users, company]);

  const hasAccess = useCallback((allowed: Role[]) => allowed.includes(user.role), [user.role]);

  const value = useMemo(() => ({
    user, setUser, hasAccess, taxRates, setTaxRates,
    leads, setLeads, clients, setClients, activities, setActivities,
    deals, setDeals, invoices, setInvoices, payments, setPayments, users, setUsers, company, setCompany, storageError,
  }), [user, hasAccess, taxRates, leads, clients, activities, deals, invoices, payments, users, company, storageError]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
