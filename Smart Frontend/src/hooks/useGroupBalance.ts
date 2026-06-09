import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';

interface NetBalance {
  userId: string;
  netBalance: number;
}

export interface SimplifiedDebt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

export interface ActivityEvent {
  type: 'expense' | 'settlement';
  userName: string;
  receiverName?: string;
  description?: string;
  amount: number;
  date: string; // ISO string from backend
}

interface BalanceResponse {
  netBalances: NetBalance[];
  simplifiedDebts: SimplifiedDebt[];
  totalExpenses: number;
  totalSettled: number;
  activity: ActivityEvent[];
}

export interface GroupBalanceSummary {
  memberCount: number;
  userNetBalance: number;
  topSuggestion: SimplifiedDebt | null;
  receivablesCount: number;
  receivableDebts: SimplifiedDebt[];
  totalExpenses: number;
  totalSettled: number;
  activity: ActivityEvent[];
}

export function useGroupBalance(groupId: string, userId: string) {
  const [summary, setSummary] = useState<GroupBalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => { setLoading(true); setRefetchKey(k => k + 1); }, []);

  // Re-fetch when any mutation invalidates this group's balance data.
  // The groupId dependency ensures the closure stays fresh if groupId ever changes.
  useEffect(() => {
    return onInvalidate(({ resource, groupId: changedGroupId }) => {
      if (
        resource === 'balances' &&
        (!changedGroupId || changedGroupId === groupId)
      ) {
        setLoading(true);
        setRefetchKey(k => k + 1);
      }
    });
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !userId) return;
    const controller = new AbortController();
    api.get<BalanceResponse>(`/groups/${groupId}/balances`, { signal: controller.signal })
      .then(res => {
        const netBalances = res.data?.netBalances ?? [];
        const simplifiedDebts = res.data?.simplifiedDebts ?? [];
        const entry = netBalances.find(b => b.userId === userId);

        const safeDebts: SimplifiedDebt[] = simplifiedDebts;
        // Prefer debts the user owes (actionable) over debts owed to them (informational).
        const myOwedDebts = safeDebts.filter(d => d.fromUserId === userId);
        const debtsOwedToMe = safeDebts.filter(d => d.toUserId === userId);
        const topSuggestion: SimplifiedDebt | null =
          myOwedDebts.length > 0
            ? [...myOwedDebts].sort((a, b) => b.amount - a.amount || a.toUserId.localeCompare(b.toUserId))[0] ?? null
            : debtsOwedToMe.length > 0
            ? [...debtsOwedToMe].sort((a, b) => b.amount - a.amount || a.fromUserId.localeCompare(b.fromUserId))[0] ?? null
            : null;

        const sortedReceivables = [...debtsOwedToMe].sort((a, b) => b.amount - a.amount || a.fromUserId.localeCompare(b.fromUserId));
        setSummary({
          memberCount: netBalances.length,
          userNetBalance: entry?.netBalance ?? 0,
          topSuggestion,
          receivablesCount: debtsOwedToMe.length,
          receivableDebts: sortedReceivables,
          totalExpenses: res.data?.totalExpenses ?? 0,
          totalSettled: res.data?.totalSettled ?? 0,
          activity: res.data?.activity ?? [],
        });
        setLoading(false);
      })
      .catch(err => {
        if (err?.name !== 'CanceledError') {
          setSummary(null);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [groupId, userId, refetchKey]);

  return { summary, loading, refetch };
}
