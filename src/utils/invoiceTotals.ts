import type { Invoice } from '../types';
import { toMvr } from './currency';

export function invoiceTotalInMvr(invoice: Invoice) {
  const total = invoice.items.reduce(
    (sum, item) => sum + item.unitPrice * item.qty * (1 + item.vatRate / 100),
    0,
  );
  return toMvr(total, invoice.currency);
}
