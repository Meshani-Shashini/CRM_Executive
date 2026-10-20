export const CUSTOMER_LOOKUP_DEFAULTS = {
  entityTypes: ['Corporate', 'Retail / Individual'],
  industrySectors: [
    'Agriculture & Fisheries',
    'Construction',
    'Education',
    'Financial Services',
    'Healthcare',
    'Hospitality & Tourism',
    'Manufacturing',
    'Marine & Shipping',
    'Retail & Wholesale',
    'Technology',
    'Transport & Logistics',
    'Other',
  ],
  segments: ['Enterprise', 'Corporate', 'SME', 'Retail', 'High Net Worth'],
  accountHandlers: [],
  salesPersons: [],
  branches: ['Male', 'Hulhumale', 'Addu City'],
  gstStatuses: ['Registered', 'Unregistered', 'Exempt', 'Pending Verification'],
  businessTypes: ['Private Limited Company', 'Public Limited Company', 'Partnership', 'Sole Proprietorship', 'Government', 'Individual'],
  administrativeAtolls: [
    'Haa Alif', 'Haa Dhaalu', 'Shaviyani', 'Noonu', 'Raa', 'Baa', 'Lhaviyani',
    'Kaafu', 'Alif Alif', 'Alif Dhaalu', 'Vaavu', 'Meemu', 'Faafu', 'Dhaalu',
    'Thaa', 'Laamu', 'Gaafu Alif', 'Gaafu Dhaalu', 'Gnaviyani', 'Seenu',
  ],
  islands: ['Male', 'Hulhumale', 'Villimale', 'Gan'],
} as const;

export type CustomerLookupKey = keyof typeof CUSTOMER_LOOKUP_DEFAULTS;
export type CustomerLookups = Record<CustomerLookupKey, string[]>;

export function createDefaultCustomerLookups(): CustomerLookups {
  return Object.fromEntries(
    Object.entries(CUSTOMER_LOOKUP_DEFAULTS).map(([key, values]) => [key, [...values]]),
  ) as CustomerLookups;
}

export function mergeCustomerLookups(saved: unknown): CustomerLookups {
  const defaults = createDefaultCustomerLookups();
  if (!saved || typeof saved !== 'object') return defaults;

  return Object.fromEntries(
    Object.keys(defaults).map((key) => {
      const savedValues = (saved as Record<string, unknown>)[key];
      const values = Array.isArray(savedValues)
        ? savedValues.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      return [key, [...new Set([...defaults[key as CustomerLookupKey], ...values])]];
    }),
  ) as CustomerLookups;
}
