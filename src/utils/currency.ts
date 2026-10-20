export type Currency = 'MVR' | 'USD';

export const DEFAULT_USD_TO_MVR_RATE = 15.42;

export function toMvr(amount: number, currency: Currency, exchangeRate?: number | null) {
  if (currency === 'MVR') return amount;
  const rate = exchangeRate == null || exchangeRate === 0
    ? DEFAULT_USD_TO_MVR_RATE
    : exchangeRate;
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('A positive USD-to-MVR exchange rate is required.');
  }
  return amount * rate;
}

export function formatAmount(amount: number, currency: Currency) {
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
