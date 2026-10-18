import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { User, Role } from '../types';
import { USERS, TAX_RATES } from '../data/seed';
import type { TaxRate } from '../types';

interface AppState {
  user: User;
  setUser: (u: User) => void;
  hasAccess: (allowed: Role[]) => boolean;
  taxRates: TaxRate[];
  setTaxRates: (t: TaxRate[]) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(USERS[0]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>(TAX_RATES);

  const hasAccess = (allowed: Role[]) => allowed.includes(user.role);

  const value = useMemo(() => ({
    user, setUser, hasAccess, taxRates, setTaxRates,
  }), [user, taxRates]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
