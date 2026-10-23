import type { Client } from '../types';

export const INCOMPLETE_COMPANY_TAG = 'New company additional information to be filled';

export function hasCompleteClientProfile(client: Client) {
  return Boolean(
    client.name.trim()
    && client.tin.trim()
    && client.country.trim()
    && client.phone.trim()
    && client.email.trim()
    && client.address.trim()
    && client.contactPerson?.trim()
    && client.class.trim()
    && client.productCode.trim(),
  );
}
