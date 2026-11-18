export interface PriceBookOverride {
  productCode: string;
  price: number;
}

export interface PriceBook {
  id: string;
  name: string;
  currency: 'MVR' | 'USD';
  overrides: PriceBookOverride[];
}

export interface PayeeAccount {
  id: string;
  name: string;
  accountNumber: string;
}

export interface TeamNotice {
  id: string;
  title: string;
  body: string;
  status: 'Draft' | 'Published' | 'Retracted';
}

export interface StrategicGoal {
  id: string;
  title: string;
  horizon: 'Quarterly' | 'Short term' | 'Long term';
  target: number;
  unit: string;
}

export interface ExchangeRateSetting {
  id: string;
  currency: string;
  usdPerUnit: number;
}

export interface SettingsCatalogs {
  tags: string[];
  leadSources: string[];
  priceBooks: PriceBook[];
  competitors: string[];
  payeeAccounts: PayeeAccount[];
  notices: TeamNotice[];
  strategicGoals: StrategicGoal[];
  exchangeRates: ExchangeRateSetting[];
}

export function createDefaultSettingsCatalogs(): SettingsCatalogs {
  return {
    tags: [],
    leadSources: ['Referral', 'Website', 'Renewal', 'Walk-in', 'Partner'],
    priceBooks: [],
    competitors: [],
    payeeAccounts: [],
    notices: [],
    strategicGoals: [],
    exchangeRates: [{ id: 'usd', currency: 'USD', usdPerUnit: 1 }],
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim()).filter(Boolean))];
}

export function normalizeSettingsCatalogs(value: unknown): SettingsCatalogs {
  const defaults = createDefaultSettingsCatalogs();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const saved = value as Record<string, unknown>;
  const priceBooks = Array.isArray(saved.priceBooks) ? saved.priceBooks.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const book = item as Record<string, unknown>;
    if (typeof book.id !== 'string' || typeof book.name !== 'string') return [];
    const overrides = Array.isArray(book.overrides) ? book.overrides.flatMap((override) => {
      if (!override || typeof override !== 'object' || Array.isArray(override)) return [];
      const entry = override as Record<string, unknown>;
      return typeof entry.productCode === 'string' && typeof entry.price === 'number'
        ? [{ productCode: entry.productCode, price: entry.price }]
        : [];
    }) : [];
    return [{
      id: book.id,
      name: book.name,
      currency: book.currency === 'USD' ? 'USD' as const : 'MVR' as const,
      overrides,
    }];
  }) : [];
  const payeeAccounts = Array.isArray(saved.payeeAccounts) ? saved.payeeAccounts.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const account = item as Record<string, unknown>;
    return typeof account.id === 'string' && typeof account.name === 'string' && typeof account.accountNumber === 'string'
      ? [{ id: account.id, name: account.name, accountNumber: account.accountNumber }]
      : [];
  }) : [];
  const notices = Array.isArray(saved.notices) ? saved.notices.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const notice = item as Record<string, unknown>;
    if (typeof notice.id !== 'string' || typeof notice.title !== 'string' || typeof notice.body !== 'string') return [];
    const status: TeamNotice['status'] = notice.status === 'Published' || notice.status === 'Retracted'
      ? notice.status
      : 'Draft';
    return [{
        id: notice.id,
        title: notice.title,
        body: notice.body,
        status,
      }];
  }) : [];
  const strategicGoals = Array.isArray(saved.strategicGoals) ? saved.strategicGoals.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const goal = item as Record<string, unknown>;
    if (typeof goal.id !== 'string' || typeof goal.title !== 'string'
      || typeof goal.target !== 'number' || typeof goal.unit !== 'string') return [];
    const horizon: StrategicGoal['horizon'] = goal.horizon === 'Quarterly' || goal.horizon === 'Long term'
      ? goal.horizon
      : 'Short term';
    return [{
        id: goal.id,
        title: goal.title,
        horizon,
        target: goal.target,
        unit: goal.unit,
      }];
  }) : [];
  const exchangeRates = Array.isArray(saved.exchangeRates) ? saved.exchangeRates.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const rate = item as Record<string, unknown>;
    return typeof rate.id === 'string' && typeof rate.currency === 'string' && typeof rate.usdPerUnit === 'number'
      ? [{ id: rate.id, currency: rate.currency, usdPerUnit: rate.usdPerUnit }]
      : [];
  }) : defaults.exchangeRates;

  return {
    tags: stringList(saved.tags),
    leadSources: saved.leadSources === undefined ? defaults.leadSources : stringList(saved.leadSources),
    priceBooks,
    competitors: stringList(saved.competitors),
    payeeAccounts,
    notices,
    strategicGoals,
    exchangeRates,
  };
}
