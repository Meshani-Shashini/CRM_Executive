import type { QuotationRequestLineStatus, Role } from '../types';

export type QuotationRequestStatus = QuotationRequestLineStatus;
export type QuotationLineRowAction = 'send' | 'cancel' | 'log-quote' | 'decline' | 'edit-quote' | 'reopen';

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
  canManageAllStatuses = false,
) {
  if (current === next) return false;
  if (role === 'admin' || canManageAllStatuses) return true;
  if (ALLOWED_TRANSITIONS[current].includes(next)) return true;
  return false;
}

export function quotationRequestStatusOptions(
  current: QuotationRequestStatus,
  role: Role,
  canManageAllStatuses = false,
) {
  const statuses: QuotationRequestStatus[] = ['Requested', 'Sent', 'Quoted', 'Declined', 'Expired', 'Cancelled'];
  const allowed = statuses.filter((status) => status !== current
    && canTransitionQuotationRequestStatus(current, status, role, canManageAllStatuses));
  return [
    { status: current, label: current, disabled: true },
    ...allowed.map((status) => ({
      status,
      label: role === 'admin' && (status === 'Requested' || status === 'Sent') ? `Reopen to ${status}` : status,
      disabled: false,
    })),
  ];
}

export function quotationLineRowActions(
  displayStatus: QuotationRequestStatus,
  currentStatus: QuotationRequestStatus,
  role: Role,
  canManageAllStatuses = false,
): QuotationLineRowAction[] {
  if (displayStatus === 'Requested') return ['send', 'cancel'];
  if (displayStatus === 'Sent') return ['log-quote', 'decline', 'cancel'];
  if (displayStatus === 'Quoted') return ['edit-quote', 'cancel'];
  return canTransitionQuotationRequestStatus(currentStatus, 'Requested', role, canManageAllStatuses)
    ? ['reopen']
    : [];
}
