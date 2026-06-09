import type { BestStrategy, SmartSettlementResult } from '../hooks/useSmartSettlement';
import { normalizeDisplayName } from './displayNames';

export interface StrategyPreview {
  isFullySettled: boolean;
  remainingPeopleOweYou: number;
  remainingTotalOwed: number;
  remainingTotalOwedToYou: number;
}

export interface DisplayStrategy {
  amount: number;
  ctaText: 'Pay now' | 'Send request';
  personName: string;
  preview: StrategyPreview;
  strategy: BestStrategy;
}

function clampCurrency(amount: number): number {
  return Math.max(0, Math.round(amount * 100) / 100);
}

function formatSettlementAmount(amount: number): string {
  return clampCurrency(amount)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

export function formatSettlementCurrency(amount: number): string {
  return `₹${formatSettlementAmount(amount)}`;
}

export function getDisplayStrategy(result: SmartSettlementResult): DisplayStrategy | null {
  const { bestStrategy, owedToYouDebts, totalOwed } = result;
  if (!bestStrategy) return null;

  const isPay = bestStrategy.type === 'pay';
  // bestStrategy.amount === debt.amount always for pay strategies (INV-6 by construction).
  const amount = clampCurrency(bestStrategy.amount);
  const remainingTotalOwed = clampCurrency(isPay ? totalOwed - amount : totalOwed);
  const remainingOwedToYouDebts = isPay
    ? owedToYouDebts
    : owedToYouDebts.filter(debt => debt.fromUserId !== bestStrategy.debt.fromUserId);
  const remainingTotalOwedToYou = clampCurrency(
    remainingOwedToYouDebts.reduce((sum, debt) => sum + debt.amount, 0)
  );
  const preview: StrategyPreview = {
    isFullySettled: remainingTotalOwed === 0 && remainingTotalOwedToYou === 0,
    remainingPeopleOweYou: remainingOwedToYouDebts.length,
    remainingTotalOwed,
    remainingTotalOwedToYou,
  };

  return {
    amount,
    ctaText: isPay ? 'Pay now' : 'Send request',
    personName: normalizeDisplayName(bestStrategy.personName),
    preview,
    strategy: bestStrategy,
  };
}
