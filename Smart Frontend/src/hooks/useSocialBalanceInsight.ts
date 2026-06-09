import { useState, useEffect } from 'react'
import { api } from '../api/client'

export interface BalanceInsight {
  suggestedPayerId: string | null
  message: string
}

export function useSocialBalanceInsight(groupId: string) {
  const [insight, setInsight] = useState<BalanceInsight | null>(null)

  useEffect(() => {
    if (!groupId) return

    let isMounted = true

    async function fetchInsight() {
      try {
        const response = await api.get(`/intelligence/groups/${groupId}/balance-insight`)
        if (isMounted) setInsight(response.data)
      } catch (error) {
        console.error('Error fetching social balance insight:', error)
      }
    }

    fetchInsight()

    return () => {
      isMounted = false
    }
  }, [groupId])

  return insight
}
