import type { QuotationRequestLineStatus, Role } from '../types';

export type QuotationRequestStatus = QuotationRequestLineStatus;

const ALLOWED_TRANSITIONS: Record<QuotationRequestStatus, QuotationRequestStatus[]> = {
  Requested: ['Sent', 'Expired', 'Cancelled'],
  Sent: ['Quoted', 'Declined', 'Expired', 'Cancelled'],
  Quoted: ['Cancelled'],
  Declined: ['Cancelled'],
  Expired: ['Cancelled'],
  Cancelled: [],
};

export function canTransitionQuotationRequestStatus(
  current: QuotationRequestStatus,
  next: QuotationRequestStatus,
  role: Role,
) {
  if (current === next) return false;
  if (ALLOWED_TRANSITIONS[current].includes(next)) return true;
  return role === 'admin' && current !== 'Cancelled' && (next === 'Requested' || next === 'Sent');
}

export function quotationRequestStatusOptions(current: QuotationRequestStatus, role: Role) {
  const statuses: QuotationRequestStatus[] = ['Requested', 'Sent', 'Quoted', 'Declined', 'Expired', 'Cancelled'];
  const allowed = statuses.filter((status) => status !== current
    && canTransitionQuotationRequestStatus(current, status, role));
  return [
    { status: current, label: current, disabled: true },
    ...allowed.map((status) => ({
      status,
      label: role === 'admin' && (status === 'Requested' || status === 'Sent') ? `Reopen to ${status}` : status,
      disabled: false,
    })),
  ];
}
