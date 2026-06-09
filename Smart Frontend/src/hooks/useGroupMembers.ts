import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';

export interface Member {
  id: string;
  name: string;
  email: string;
}

export function useGroupMembers(groupId: string) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refetchKey, setRefetchKey] = useState(0);
  // Tracks which groupId the current `members` array was fetched for.
  // Only set after a successful fetch completes — never set to the new groupId
  // until the response arrives, so stale members from a previous group can be
  // detected by comparing loadedForGroupId !== groupId.
  const [loadedForGroupId, setLoadedForGroupId] = useState('');

  // Re-fetch when a member is added to / removed from this specific group.
  useEffect(() => {
    if (!groupId) return;
    return onInvalidate(({ resource, groupId: changedGroupId }) => {
      if (resource === 'members' && (!changedGroupId || changedGroupId === groupId)) {
        setRefetchKey(k => k + 1);
      }
    });
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get<{ members: Member[] }>(`/groups/${groupId}/members`, { signal: controller.signal });
        setMembers(res.data?.members ?? []);
        setLoadedForGroupId(groupId);
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name !== 'CanceledError') {
          setError('Failed to load group members.');
          setLoading(false);
        }
      }
    })();
    return () => { controller.abort(); };
  }, [groupId, refetchKey]);

  return { members: groupId ? members : [], loading, error, loadedForGroupId };
}
