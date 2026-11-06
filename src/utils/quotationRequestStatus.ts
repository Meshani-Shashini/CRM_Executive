import type { QuotationRequest, Role } from '../types';

export type QuotationRequestStatus = QuotationRequest['status'];

const STATUS_ORDER: QuotationRequestStatus[] = ['Draft', 'Sent', 'Responses received', 'Closed'];

export function canTransitionQuotationRequestStatus(
  current: QuotationRequestStatus,
  next: QuotationRequestStatus,
  role: Role,
) {
  if (current === next) return false;
  const currentIndex = STATUS_ORDER.indexOf(current);
  const nextIndex = STATUS_ORDER.indexOf(next);
  return nextIndex === currentIndex + 1
    || next === 'Closed'
    || (role === 'admin' && nextIndex < currentIndex);
}

export function quotationRequestStatusOptions(current: QuotationRequestStatus, role: Role) {
  const allowed = STATUS_ORDER.filter((status) => status !== current
    && canTransitionQuotationRequestStatus(current, status, role));
  return [
    { status: current, label: current, disabled: true },
    ...allowed.map((status) => ({
      status,
      label: STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(current) ? `Reopen to ${status}` : status,
      disabled: false,
    })),
  ];
}
