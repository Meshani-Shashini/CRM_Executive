import type { ProductCode } from '../types';

/** Calculates the tentative brokerage budget in the same currency as the insured value. */
export function calculateBrokerageCommission(insuredValue: number, product?: ProductCode | null): number {
  if (!Number.isFinite(insuredValue) || insuredValue < 0 || !product) return 0;
  return Math.round(insuredValue * product.standardBrokerageRatePct) / 100;
}
