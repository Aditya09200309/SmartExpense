import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';
import type { Group } from './useGroups';

export interface EnrichedDebt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
  groupId: string;
  groupName: string;
  settlesTotalGroup: boolean;
}

export interface OptimizedPlanItem {
  toUserId: string;
  toUserName: string;
  totalAmount: number;          // raw sum of all per-group debt amounts (no netting)
  debts: EnrichedDebt[];        // raw per-group amounts — never capped; one entry per group
  savingsCount: number;         // debts.length - 1: transactions saved by merging
  crossGroupNetAmount: number | null; // net after receivable offsets — display insight only, never routed
  hasReciprocal: boolean;             // true when this person also owes you in another group
}

export interface SmartSuggestion {
  item: OptimizedPlanItem;
  reasoning: string;
}

export interface BestStrategy {
  type: 'pay' | 'collect';
  debt: EnrichedDebt;
  amount: number;
  personName: string;
  groupCount: number;
  reasoning: string;
}

export interface SmartSettlementResult {
  loading: boolean;
  error: boolean;
  bestAction: EnrichedDebt | null;
  bestStrategy: BestStrategy | null;
  smartSuggestion: SmartSuggestion | null;
  optimizedPlan: OptimizedPlanItem[];
  youOweDebts: EnrichedDebt[];
  owedToYouDebts: EnrichedDebt[];
  totalOwed: number;
  totalOwedToYou: number;
  peopleYouOweCount: number;
  groupsWithDebtCount: number;
  isFullySettled: boolean;
}

interface SimplifiedDebt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

interface BalanceResponse {
  netBalances: unknown[];
  simplifiedDebts: SimplifiedDebt[];
}

const EMPTY_RESULT: SmartSettlementResult = {
  loading: true,
  error: false,
  bestAction: null,
  bestStrategy: null,
  smartSuggestion: null,
  optimizedPlan: [],
  youOweDebts: [],
  owedToYouDebts: [],
  totalOwed: 0,
  totalOwedToYou: 0,
  peopleYouOweCount: 0,
  groupsWithDebtCount: 0,
  isFullySettled: false,
};

export function useSmartSettlement(groups: Group[], currentUserId: string): SmartSettlementResult {
  const [result, setResult] = useState<SmartSettlementResult>(EMPTY_RESULT);
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    return onInvalidate(({ resource }) => {
      if (resource === 'balances') setRefetchKey(k => k + 1);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    if (groups.length === 0) {
      setResult({ ...EMPTY_RESULT, loading: false, isFullySettled: true });
      return;
    }

    const controller = new AbortController();
    setResult(prev => ({ ...prev, loading: true }));

    Promise.all(
      groups.map(group =>
        api
          .get<BalanceResponse>(`/groups/${group.id}/balances`, { signal: controller.signal })
          .then(res => ({ group, data: res.data, ok: true as const }))
          .catch(() => ({ group, data: null as BalanceResponse | null, ok: false as const }))
      )
    ).then(results => {
      if (controller.signal.aborted) return;

      // Phase 1: collect raw per-group entries keyed by the other person.
      const rawYouOweByPerson = new Map<string, EnrichedDebt[]>();
      const rawOwedToYouByPerson = new Map<string, EnrichedDebt[]>();
      let hasError = false;

      for (const r of results) {
        if (!r.ok || !r.data) {
          hasError = true;
          continue;
        }

        const debts: SimplifiedDebt[] = r.data?.simplifiedDebts ?? [];
        const groupYouOwe = debts.filter(d => d && d.fromUserId === currentUserId);
        const groupOwedToYou = debts.filter(d => d && d.toUserId === currentUserId);

        for (const d of groupYouOwe) {
          if (!d.toUserId) continue;
          const arr = rawYouOweByPerson.get(d.toUserId) ?? [];
          arr.push({
            ...d,
            groupId: r.group.id,
            groupName: r.group.name,
            settlesTotalGroup: groupYouOwe.length === 1,
          });
          rawYouOweByPerson.set(d.toUserId, arr);
        }

        for (const d of groupOwedToYou) {
          if (!d.fromUserId) continue;
          const arr = rawOwedToYouByPerson.get(d.fromUserId) ?? [];
          arr.push({
            ...d,
            groupId: r.group.id,
            groupName: r.group.name,
            settlesTotalGroup: false,
          });
          rawOwedToYouByPerson.set(d.fromUserId, arr);
        }
      }

      // Phase 2: compute global net per person; positive = they owe you, negative = you owe them.
      const netCentsByPerson = new Map<string, number>();
      const allPersonIds = new Set([...rawYouOweByPerson.keys(), ...rawOwedToYouByPerson.keys()]);
      for (const personId of allPersonIds) {
        const youOweCents = (rawYouOweByPerson.get(personId) ?? []).reduce((s, d) => s + Math.round(d.amount * 100), 0);
        const owedToYouCents = (rawOwedToYouByPerson.get(personId) ?? []).reduce((s, d) => s + Math.round(d.amount * 100), 0);
        netCentsByPerson.set(personId, owedToYouCents - youOweCents);
      }

      // Phase 3: classify into final arrays using global net direction.
      const youOweDebts: EnrichedDebt[] = [];
      const owedToYouDebts: EnrichedDebt[] = [];

      for (const [personId, netCents] of netCentsByPerson) {
        if (netCents < 0) {
          // Net: you owe them — all per-group debts flow unchanged.
          for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
        } else if (netCents > 0) {
          // Net: they owe you — all per-group receivables flow unchanged (no synthetic entry).
          for (const d of rawOwedToYouByPerson.get(personId) ?? []) owedToYouDebts.push(d);
        } else {
          // netCents === 0: exact cross-group cancellation.
          // DIR-2 policy: surface both sides. User must settle each group explicitly.
          for (const d of rawYouOweByPerson.get(personId) ?? []) youOweDebts.push(d);
          for (const d of rawOwedToYouByPerson.get(personId) ?? []) owedToYouDebts.push(d);
        }
      }

      youOweDebts.sort((a, b) => b.amount - a.amount || a.groupName.localeCompare(b.groupName));
      owedToYouDebts.sort((a, b) => b.amount - a.amount || a.groupName.localeCompare(b.groupName));

      // Phase 4: build optimizedPlan — totalAmount is raw sum of per-group debts (no netting).
      const planMap = new Map<string, OptimizedPlanItem>();
      for (const d of youOweDebts) {
        const existing = planMap.get(d.toUserId);
        if (existing) {
          existing.debts.push(d);
          existing.totalAmount = Math.round((existing.totalAmount + d.amount) * 100) / 100;
        } else {
          const rawOwedToYouCents = (rawOwedToYouByPerson.get(d.toUserId) ?? [])
            .reduce((s, x) => s + Math.round(x.amount * 100), 0);
          const netCents = netCentsByPerson.get(d.toUserId) ?? 0;
          planMap.set(d.toUserId, {
            toUserId: d.toUserId,
            toUserName: d.toUserName,
            totalAmount: d.amount,
            debts: [d],
            savingsCount: 0,
            crossGroupNetAmount: rawOwedToYouCents > 0 ? Math.abs(netCents) / 100 : null,
            hasReciprocal: rawOwedToYouCents > 0,
          });
        }
      }

      if (import.meta.env.DEV) {
        for (const item of planMap.values()) {
          const debtSum = item.debts.reduce((s, d) => s + Math.round(d.amount * 100), 0);
          const total = Math.round(item.totalAmount * 100);
          if (Math.abs(debtSum - total) > 1) {
            console.error('[INV-6 VIOLATION] planItem debts sum !== totalAmount', item);
          }
        }
        for (const d of youOweDebts) {
          if (d.amount <= 0) {
            console.error('[DATA] youOweDebts contains non-positive amount', d);
          }
        }
      }

      const optimizedPlan = [...planMap.values()]
        .map(item => ({ ...item, savingsCount: item.debts.length - 1 }))
        .sort((a, b) => b.savingsCount - a.savingsCount || b.totalAmount - a.totalAmount);

      const totalOwed = optimizedPlan.reduce((s, item) => s + item.totalAmount, 0);
      const totalOwedToYou = owedToYouDebts.reduce((s, d) => s + d.amount, 0);

      function buildPayStrategy(item: OptimizedPlanItem): BestStrategy {
        return {
          type: 'pay',
          debt: item.debts[0],
          amount: item.debts[0].amount,
          personName: item.toUserName,
          groupCount: item.debts.length,
          reasoning:
            optimizedPlan.length === 1 && owedToYouDebts.length === 0
              ? 'You’ll be fully settled after this'
              : item.debts.length > 1
                ? `Settle ${item.debts[0].groupName} first — ${item.debts.length} groups total`
                : 'Biggest impact on your balance',
        };
      }

      function buildCollectStrategy(debt: EnrichedDebt): BestStrategy {
        const groupCount = rawOwedToYouByPerson.get(debt.fromUserId)?.length ?? 1;
        return {
          type: 'collect',
          debt,
          amount: debt.amount,
          personName: debt.fromUserName,
          groupCount,
          reasoning:
            optimizedPlan.length === 0 && owedToYouDebts.length === 1
              ? 'You’ll be fully settled after this'
              : groupCount > 1
                ? `${groupCount} groups · largest balance first`
                : 'Biggest impact on your balance',
        };
      }

      const bestPayStrategy = optimizedPlan[0] ? buildPayStrategy(optimizedPlan[0]) : null;
      const bestCollectStrategy = owedToYouDebts[0] ? buildCollectStrategy(owedToYouDebts[0]) : null;
      const bestStrategy =
        !bestPayStrategy ? bestCollectStrategy
        : bestCollectStrategy && bestCollectStrategy.amount > bestPayStrategy.amount ? bestCollectStrategy
        : bestPayStrategy;

      if (import.meta.env.DEV && bestStrategy?.type === 'pay') {
        if (Math.abs(bestStrategy.amount - bestStrategy.debt.amount) > 0.01) {
          console.error('[INV-6 VIOLATION] BestStrategy.amount !== debt.amount', {
            amount: bestStrategy.amount,
            debtAmount: bestStrategy.debt.amount,
            debt: bestStrategy.debt,
          });
        }
      }

      const top = optimizedPlan[0] ?? null;
      const smartSuggestion: SmartSuggestion | null = top
        ? {
            item: top,
            reasoning: optimizedPlan.length === 1
              ? 'Do this to become fully settled'
              : top.debts.length > 1
                ? `Clears ${top.debts.length} groups in one go`
                : 'Largest impact \u2014 reduces your balance fastest',
          }
        : null;

      setResult({
        loading: false,
        error: hasError,
        bestAction: youOweDebts[0] ?? null,
        bestStrategy,
        smartSuggestion,
        optimizedPlan,
        youOweDebts,
        owedToYouDebts,
        totalOwed,
        totalOwedToYou,
        peopleYouOweCount: planMap.size,
        groupsWithDebtCount: new Set(youOweDebts.map(d => d.groupId)).size,
        isFullySettled: youOweDebts.length === 0 && owedToYouDebts.length === 0,
      });
    });

    return () => controller.abort();
  }, [currentUserId, groups, refetchKey]);

  return result;
}
