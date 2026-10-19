export type Currency = 'MVR' | 'USD';

export function toMvr(amount: number, currency: Currency, exchangeRate?: number) {
  if (currency === 'MVR') return amount;
  if (!Number.isFinite(exchangeRate) || !exchangeRate || exchangeRate <= 0) {
    throw new Error('A positive USD-to-MVR exchange rate is required.');
  }
  return amount * exchangeRate;
}

export function formatAmount(amount: number, currency: Currency) {
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
