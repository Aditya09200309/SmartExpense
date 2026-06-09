import { useState, useEffect } from 'react'
import { api } from '../api/client'

export interface UserIntelligence {
  userId: string
  trustScore: number
  dominantTrait?: string
}

export interface GroupIntelligence {
  groupId: string
  healthScore: number
}

// In-memory cache to prevent spamming the backend
const userCache = new Map<string, UserIntelligence>()
const groupCache = new Map<string, GroupIntelligence>()

export function useUserIntelligence(userId: string | undefined) {
  const [data, setData] = useState<UserIntelligence | null>(null)

  useEffect(() => {
    if (!userId) return

    if (userCache.has(userId)) {
      setData(userCache.get(userId)!)
      return
    }

    const controller = new AbortController()

    api.get<UserIntelligence>(`/intelligence/users/${userId}`, { signal: controller.signal })
      .then(res => {
        userCache.set(userId, res.data)
        setData(res.data)
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          console.warn('[Intelligence] Failed to fetch user intelligence:', err)
          setData(null)
        }
      })

    return () => controller.abort()
  }, [userId])

  return data
}

export function useGroupIntelligence(groupId: string | undefined) {
  const [data, setData] = useState<GroupIntelligence | null>(null)

  useEffect(() => {
    if (!groupId) return

    if (groupCache.has(groupId)) {
      setData(groupCache.get(groupId)!)
      return
    }

    const controller = new AbortController()

    api.get<GroupIntelligence>(`/intelligence/groups/${groupId}`, { signal: controller.signal })
      .then(res => {
        groupCache.set(groupId, res.data)
        setData(res.data)
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          console.warn('[Intelligence] Failed to fetch group intelligence:', err)
          setData(null)
        }
      })

    return () => controller.abort()
  }, [groupId])

  return data
}
