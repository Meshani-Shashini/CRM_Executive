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
  const highestExisting = existingReferences.reduce((highest, reference) => {
    let value = 0;
    if (kind === 'quotation-request') {
      const currentMatch = reference.match(new RegExp(`^QRS-(\\d+)-${year}$`));
      const legacyMatch = reference.match(new RegExp(`^(?:QR|QRS)-${year}-(\\d+)$`));
      value = Number(currentMatch?.[1] ?? legacyMatch?.[1] ?? 0);
    } else {
      const prefix = `${referencePrefixes[kind]}-${year}-`;
      if (!reference.startsWith(prefix)) return highest;
      value = Number(reference.slice(prefix.length));
    }
    return Number.isInteger(value) ? Math.max(highest, value) : highest;
  }, 0);
  const nextValue = Math.max(highestExisting, persistedCounter) + 1;
  if (kind === 'quotation-request') {
    return `QRS-${String(nextValue).padStart(3, '0')}-${year}`;
  }
  return `${referencePrefixes[kind]}-${year}-${String(nextValue).padStart(4, '0')}`;
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
      const allocated = kind === 'quotation-request'
        ? Number(reference.split('-')[1])
        : Number(reference.slice(reference.lastIndexOf('-') + 1));
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
  const isValidReference = kind === 'quotation-request'
    ? typeof data === 'string' && new RegExp(`^QRS-\\d{3,}-${year}$`).test(data)
    : typeof data === 'string' && data.startsWith(`${referencePrefixes[kind]}-${year}-`);
  if (!isValidReference) {
    throw new Error(`The database returned an invalid ${kind} reference.`);
  }
  return data;
}
