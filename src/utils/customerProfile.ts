import type { Client } from '../types';

export const INCOMPLETE_COMPANY_TAG = 'New company additional information to be filled';

export function createLeadOrganization(
  name: string,
  ownerId: string,
  details: Partial<Omit<Client, 'id' | 'name' | 'ownerId'>> = {},
  id = `org-${crypto.randomUUID()}`,
): Client {
  return {
    id,
    name,
    tin: '',
    country: '',
    phone: '',
    email: '',
    address: '',
    sumInsured: 0,
    premium: 0,
    expiry: '',
    insurer: '',
    productCode: '',
    class: '',
    ownerId,
    tags: [INCOMPLETE_COMPANY_TAG],
    accountStatus: 'draft',
    ...details,
  };
}

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
