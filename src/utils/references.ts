import { supabase, TENANT_ID, AUTH_BYPASS } from '../lib/supabase';

export type ReferenceKind = 'deal' | 'quotation-request' | 'invoice' | 'client-quotation';

const referencePrefixes: Record<ReferenceKind, string> = {
  deal: 'DL',
  'quotation-request': 'QRS',
  invoice: 'INV',
  'client-quotation': 'QTY',
};

export function nextLocalReference(
  kind: ReferenceKind,
  year: number,
  existingReferences: string[],
  persistedCounter = 0,
) {
  const prefix = `${referencePrefixes[kind]}-${year}-`;
  const legacyPrefix = kind === 'quotation-request' ? `QR-${year}-` : '';
  const highestExisting = existingReferences.reduce((highest, reference) => {
    const matchesCurrentPrefix = reference.startsWith(prefix);
    const matchesLegacyPrefix = legacyPrefix && reference.startsWith(legacyPrefix);
    if (!matchesCurrentPrefix && !matchesLegacyPrefix) return highest;
    const matchedPrefix = matchesCurrentPrefix ? prefix : legacyPrefix;
    const value = Number(reference.slice(matchedPrefix.length));
    return Number.isInteger(value) ? Math.max(highest, value) : highest;
  }, 0);
  const nextValue = Math.max(highestExisting, persistedCounter) + 1;
  return `${prefix}${String(nextValue).padStart(4, '0')}`;
}

export async function getNextReference(
  kind: ReferenceKind,
  year: number,
  existingReferences: string[],
) {
  if (AUTH_BYPASS) {
    const counterKey = `crm:sequence:${TENANT_ID}:${kind}:${year}`;
    const persistedCounter = kind === 'quotation-request' || kind === 'client-quotation'
      ? Number(window.localStorage.getItem(counterKey) ?? 0)
      : 0;
    const reference = nextLocalReference(kind, year, existingReferences, persistedCounter);
    if (kind === 'quotation-request' || kind === 'client-quotation') {
      const allocated = Number(reference.slice(reference.lastIndexOf('-') + 1));
      window.localStorage.setItem(counterKey, String(allocated));
    }
    return reference;
  }

  const { data, error } = await supabase.rpc('get_next_reference', {
    p_tenant_id: TENANT_ID,
    p_kind: kind,
    p_year: year,
  });
  if (error) throw new Error(`Could not allocate a ${kind} reference: ${error.message}`);
  const validPrefix = `${referencePrefixes[kind]}-${year}-`;
  if (typeof data !== 'string' || !data.startsWith(validPrefix)) {
    throw new Error(`The database returned an invalid ${kind} reference.`);
  }
  return data;
}
