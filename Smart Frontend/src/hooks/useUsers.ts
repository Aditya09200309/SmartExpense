import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';

export interface User {
  id: string;
  name: string;
  email: string;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refetchKey, setRefetchKey] = useState(0);

  // Re-fetch when a new user account is created.
  useEffect(() => {
    return onInvalidate(({ resource }) => {
      if (resource === 'users') {
        setLoading(true);
        setError('');
        setRefetchKey(k => k + 1);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ users: User[] }>('/users', { signal: controller.signal })
      .then(res => {
        setUsers(res.data?.users ?? []);
        setError('');
        setLoading(false);
      })
      .catch(err => {
        if (err?.name !== 'CanceledError') {
          setError('Failed to load users.');
          setLoading(false);
        }
      });
    return () => { controller.abort(); };
  }, [refetchKey]);

  return { users, loading, error };
}
