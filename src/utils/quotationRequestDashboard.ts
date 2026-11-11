import type { QuotationRequestLine, QuotationRequestQuote, QuotationSection } from '../types';

export function quotationInterestBreakdown(section: QuotationSection) {
  const subtotal = section.data.interests.reduce((sum, interest) =>
    sum + (Number.isFinite(interest.sumInsured) ? Math.max(interest.sumInsured, 0) : 0), 0);
  return {
    subtotal,
    rows: section.data.interests.map((interest) => ({
      ...interest,
      weightPct: subtotal > 0 ? (Math.max(interest.sumInsured, 0) / subtotal) * 100 : 0,
    })),
  };
}

export function quotationRateFromPremium(premium: number, sumInsured: number) {
  return Number.isFinite(premium) && Number.isFinite(sumInsured) && premium >= 0 && sumInsured > 0
    ? (premium / sumInsured) * 100
    : undefined;
}

export function compareOptionCoverage(
  first: QuotationSection['data']['options'][number] | undefined,
  second: QuotationSection['data']['options'][number] | undefined,
) {
  const firstLimits = new Map((first?.coverages ?? []).map((coverage) => [coverage.name, coverage.limit]));
  const secondLimits = new Map((second?.coverages ?? []).map((coverage) => [coverage.name, coverage.limit]));
  const names = [...new Set([...firstLimits.keys(), ...secondLimits.keys()])];
  const rows = names.map((name) => {
    const firstLimit = firstLimits.get(name) ?? 0;
    const secondLimit = secondLimits.get(name) ?? 0;
    const variance = secondLimit - firstLimit;
    return {
      name,
      firstLimit,
      secondLimit,
      variance,
      variancePct: firstLimit > 0 ? (variance / firstLimit) * 100 : undefined,
    };
  });
  return {
    rows,
    firstTotal: rows.reduce((sum, row) => sum + row.firstLimit, 0),
    secondTotal: rows.reduce((sum, row) => sum + row.secondLimit, 0),
  };
}

export function selectBestQuote<T extends { line: QuotationRequestLine; quote: QuotationRequestQuote }>(
  candidates: T[],
): T | undefined {
  return candidates
    .filter(({ line, quote }) => line.status === 'Quoted' && Number.isFinite(quote.premium) && quote.premium >= 0)
    .reduce<T | undefined>((best, candidate) =>
      !best || candidate.quote.premium < best.quote.premium ? candidate : best, undefined);
}

export function isQuoteExpiring(validUntil: string | undefined, now = new Date(), days = 30) {
  if (!validUntil || !Number.isFinite(days) || days < 0) return false;
  const expiry = Date.parse(`${validUntil.slice(0, 10)}T23:59:59.999`);
  if (!Number.isFinite(expiry)) return false;
  const remaining = expiry - now.getTime();
  return remaining >= 0 && remaining <= days * 86400000;
}

export function calculateIndicativePremium(sumInsured: number, targetRatePct: number) {
  if (!Number.isFinite(sumInsured) || sumInsured < 0 || !Number.isFinite(targetRatePct) || targetRatePct < 0) {
    return undefined;
  }
  const annual = sumInsured * targetRatePct / 100;
  return {
    annual,
    monthly: annual / 12,
    daily: annual / 365,
  };
}
