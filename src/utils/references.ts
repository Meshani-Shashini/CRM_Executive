import { supabase, TENANT_ID, AUTH_BYPASS } from '../lib/supabase';

export type ReferenceKind = 'deal' | 'quotation-request' | 'invoice';

const referencePrefixes: Record<ReferenceKind, string> = {
  deal: 'DL',
  'quotation-request': 'QR',
  invoice: 'INV',
};

export function nextLocalReference(kind: ReferenceKind, year: number, existingReferences: string[]) {
  const prefix = `${referencePrefixes[kind]}-${year}-`;
  const nextValue = existingReferences.reduce((highest, reference) => {
    if (!reference.startsWith(prefix)) return highest;
    const value = Number(reference.slice(prefix.length));
    return Number.isInteger(value) ? Math.max(highest, value) : highest;
  }, 0) + 1;
  return `${prefix}${String(nextValue).padStart(4, '0')}`;
}

export async function getNextReference(
  kind: ReferenceKind,
  year: number,
  existingReferences: string[],
) {
  if (AUTH_BYPASS) return nextLocalReference(kind, year, existingReferences);

  const { data, error } = await supabase.rpc('get_next_reference', {
    p_tenant_id: TENANT_ID,
    p_kind: kind,
    p_year: year,
  });
  if (error) throw new Error(`Could not allocate a ${kind} reference: ${error.message}`);
  if (typeof data !== 'string' || !data.startsWith(`${referencePrefixes[kind]}-${year}-`)) {
    throw new Error(`The database returned an invalid ${kind} reference.`);
  }
  return data;
}
