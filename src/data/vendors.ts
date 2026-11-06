import type { Client, Deal, Vendor } from '../types';
import { INSURERS } from './catalogs';

export const VENDOR_TYPES = ['Insurer', 'Reinsurer', 'Surveyor', 'Loss Adjuster', 'Other'] as const;

export function normalizeVendorName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildVendorSeedFromName(name: string, fallbackId?: string): Vendor {
  const trimmed = name.trim();
  return {
    id: fallbackId ?? `vendor-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vendor-generic'}`,
    name: trimmed,
    vendorType: 'Insurer',
    country: 'Maldives',
    currency: 'MVR',
    address: '',
    taxId: '',
    licenseNo: '',
    email: '',
    phone: '',
    contacts: [],
    status: 'active',
    notes: '',
    createdAt: new Date().toISOString(),
  };
}

export function mergeVendorRecords(existing: Vendor[], ...batches: Array<Vendor[]>) {
  const map = new Map<string, Vendor>();
  for (const batch of [existing, ...batches]) {
    for (const vendor of batch) {
      const key = normalizeVendorName(vendor.name);
      if (!key || map.has(key)) continue;
      map.set(key, {
        ...vendor,
        status: vendor.status ?? 'active',
        vendorType: vendor.vendorType ?? 'Other',
        country: vendor.country || 'Maldives',
        currency: vendor.currency || 'MVR',
        createdAt: vendor.createdAt || new Date().toISOString(),
      });
    }
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function migrateVendorData(existing: Vendor[], deals: Deal[], clients: Client[]) {
  const insurerSeed = INSURERS.map((insurer) => ({
    id: insurer.id,
    name: insurer.name,
    vendorType: 'Insurer' as const,
    country: 'Maldives',
    currency: 'MVR' as const,
    address: insurer.address || '',
    taxId: '',
    licenseNo: '',
    email: '',
    phone: '',
    contacts: [],
    status: 'active' as const,
    notes: 'Migrated from legacy insurer seed list.',
    createdAt: new Date().toISOString(),
  }));

  const dealInsurerNames = [...new Set((deals ?? [])
    .map((deal) => deal.insurer)
    .filter((name): name is string => Boolean(name && name.trim()))
    .map((name) => name.trim()))];

  const clientInsurerNames = [...new Set((clients ?? [])
    .map((client) => client.insurer)
    .filter((name): name is string => Boolean(name && name.trim()))
    .map((name) => name.trim()))];

  const inferredVendors = [...new Set([...dealInsurerNames, ...clientInsurerNames])]
    .filter((name) => !existing.some((vendor) => normalizeVendorName(vendor.name) === normalizeVendorName(name)))
    .map((name) => buildVendorSeedFromName(name));

  const merged = mergeVendorRecords(existing, ...[insurerSeed, inferredVendors]);
  const vendorIdMap = new Map<string, string>();
  for (const vendor of merged) {
    vendorIdMap.set(normalizeVendorName(vendor.name), vendor.id);
  }

  const dealsWithVendorIds = deals.map((deal) => {
    if (deal.vendorId) return deal;
    const resolvedName = deal.insurer?.trim();
    if (!resolvedName) return deal;
    const matchId = vendorIdMap.get(normalizeVendorName(resolvedName));
    return matchId ? { ...deal, vendorId: matchId } : deal;
  });

  return { vendors: merged, deals: dealsWithVendorIds };
}
