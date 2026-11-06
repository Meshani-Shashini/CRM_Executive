export type Currency = 'MVR' | 'USD';

export const DEFAULT_USD_TO_MVR_RATE = 15.42;

export function toMvr(amount: number, currency?: Currency | null, exchangeRate?: number | null) {
  const normalizedCurrency = currency && (currency === 'MVR' || currency === 'USD') ? currency : 'MVR';
  if (normalizedCurrency === 'MVR') return amount;
  const rate = exchangeRate == null || exchangeRate === 0
    ? DEFAULT_USD_TO_MVR_RATE
    : exchangeRate;
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('A positive USD-to-MVR exchange rate is required.');
  }
  return amount * rate;
}

export function formatAmount(amount: number, currency?: Currency | null) {
  const normalizedCurrency = currency && (currency === 'MVR' || currency === 'USD') ? currency : null;
  const value = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return normalizedCurrency ? `${normalizedCurrency} ${value}` : value;
}

export function parseCurrencyInput(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  return normalized ? Number(normalized) : Number.NaN;
}

export function formatCurrencyInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const decimalIndex = normalized.indexOf('.');
  const integerPart = (decimalIndex < 0 ? normalized : normalized.slice(0, decimalIndex)).replace(/\D/g, '');
  const fractionPart = decimalIndex < 0 ? '' : normalized.slice(decimalIndex + 1).replace(/\D/g, '').slice(0, 2);
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalIndex < 0 ? groupedInteger : `${groupedInteger}.${fractionPart}`;
}

export function formatCurrencyInputForDisplay(value: string) {
  const amount = parseCurrencyInput(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
}
