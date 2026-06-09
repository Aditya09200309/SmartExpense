import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';

export interface GlobalBreakdownItem {
  groupId: string;
  groupName: string;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number;
  convertedAmount: number;
}

export interface GlobalNetBalance {
  userId: string;
  userName: string;
  netAmount: number; // positive = requester is owed, negative = requester owes
  currency: string;
  breakdown: GlobalBreakdownItem[];
}

export function useGlobalBalance(userId: string, targetCurrency = 'EUR') {
  const [globalNets, setGlobalNets] = useState<GlobalNetBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => {
    setLoading(true);
    setRefetchKey(k => k + 1);
  }, []);

  // Invalidate cache when expenses or settlements mutate
  useEffect(() => {
    return onInvalidate(({ resource }) => {
      if (resource === 'balances') {
        setLoading(true);
        setRefetchKey(k => k + 1);
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    
    api.get<GlobalNetBalance[]>(`/groups/global?currency=${targetCurrency}`, { signal: controller.signal })
      .then(res => {
        setGlobalNets(res.data ?? []);
        setLoading(false);
      })
      .catch(err => {
        if (err?.name !== 'CanceledError') {
          setGlobalNets([]);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [userId, targetCurrency, refetchKey]);

  return { globalNets, loading, refetch };
}
