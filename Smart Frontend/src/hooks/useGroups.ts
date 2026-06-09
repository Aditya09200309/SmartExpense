import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';

export interface Group {
  id: string;
  name: string;
  description?: string;
  currentUserRole: 'ADMIN' | 'MEMBER';
  baseCurrency?: string;
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refetchKey, setRefetchKey] = useState(0);

  // Re-fetch whenever a mutation signals that the group list changed.
  useEffect(() => {
    return onInvalidate(({ resource }) => {
      if (resource === 'groups') {
        setLoading(true);
        setError('');
        setRefetchKey(k => k + 1);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ groups: Group[] }>('/groups', { signal: controller.signal })
      .then(res => {
        setGroups(res.data?.groups ?? []);
        setError('');
        setLoading(false);
      })
      .catch(err => {
        if (err?.name !== 'CanceledError') {
          setError('Failed to load groups.');
          setLoading(false);
        }
      });
    return () => { controller.abort(); };
  }, [refetchKey]);

  return { groups, loading, error };
}
