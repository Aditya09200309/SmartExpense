import prisma from '../../lib/prisma'
import { balanceService } from './balance.service'

export interface GlobalBreakdownItem {
  groupId: string
  groupName: string
  originalAmount: number
  originalCurrency: string
  exchangeRate: number
  convertedAmount: number
}

export interface GlobalNetBalance {
  userId: string
  userName: string
  netAmount: number // positive = requester is owed, negative = requester owes
  currency: string
  breakdown: GlobalBreakdownItem[]
}

// In-memory cache for live exchange rates to prevent rate limiting public APIs (15 min cache)
const rateCache = new Map<string, { rates: Record<string, number>; timestamp: number }>()
const CACHE_DURATION = 15 * 60 * 1000 // 15 minutes

async function getLiveRates(fromCurrency: string): Promise<Record<string, number>> {
  const now = Date.now()
  const cached = rateCache.get(fromCurrency)
  
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.rates
  }

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`).then((r) => r.json())
    if (res.result === 'success' && res.rates) {
      rateCache.set(fromCurrency, { rates: res.rates, timestamp: now })
      return res.rates
    }
  } catch (err) {
    console.warn(`[GlobalBalance] Failed to fetch live rates for ${fromCurrency}, using fallback 1.0`, err)
  }

  // Fallback map if rate API is down or rate-limited
  return { USD: 1.0, EUR: 1.0, GBP: 1.0, INR: 1.0 }
}

async function getGlobalNettedBalances(requesterId: string, targetCurrency = 'EUR'): Promise<GlobalNetBalance[]> {
  // 1. Fetch all groups where the requester is a member
  const groupMemberships = await prisma.groupMember.findMany({
    where: { userId: requesterId },
    select: { groupId: true, group: { select: { name: true } } }
  })

  if (groupMemberships.length === 0) return []

  const userNets = new Map<string, { name: string; breakdown: GlobalBreakdownItem[] }>()

  // 2. Fetch live conversion rates for the target base currency
  // We need to convert each group's baseCurrency to our target base currency.
  // Wait, the API works by fetching rates *from* a currency. So to convert GroupBase to Target,
  // we fetch rates for GroupBase, and look up rates[Target].
  const ratePromises = groupMemberships.map(async (gm) => {
    try {
      const balances = await balanceService.getGroupBalances(gm.groupId, requesterId)
      return { groupId: gm.groupId, groupName: gm.group.name, balances }
    } catch (err) {
      // If requester isn't a member or group is deleted, ignore
      return null
    }
  })

  const groupResults = (await Promise.all(ratePromises)).filter(Boolean)

  for (const groupRes of groupResults) {
    if (!groupRes) continue
    const { groupId, groupName, balances } = groupRes
    const groupBase = balances.baseCurrency || 'USD'

    // Fetch rate factor to convert GroupBase to Target base currency
    let rateFactor = 1.0
    if (groupBase !== targetCurrency) {
      const rates = await getLiveRates(groupBase)
      rateFactor = rates[targetCurrency] ?? 1.0
    }

    // Filter debts involving the requester
    for (const debt of balances.simplifiedDebts) {
      let counterPartyId = ''
      let counterPartyName = ''
      let amount = 0 // positive = requester is owed, negative = requester owes

      if (debt.fromUserId === requesterId) {
        // Requester owes money
        counterPartyId = debt.toUserId
        counterPartyName = debt.toUserName
        amount = -debt.amount
      } else if (debt.toUserId === requesterId) {
        // Requester is owed money
        counterPartyId = debt.fromUserId
        counterPartyName = debt.fromUserName
        amount = debt.amount
      } else {
        continue
      }

      if (!userNets.has(counterPartyId)) {
        userNets.set(counterPartyId, { name: counterPartyName, breakdown: [] })
      }

      const converted = Math.round(amount * rateFactor * 100) / 100

      userNets.get(counterPartyId)!.breakdown.push({
        groupId,
        groupName,
        originalAmount: amount,
        originalCurrency: groupBase,
        exchangeRate: rateFactor,
        convertedAmount: converted
      })
    }
  }

  // 3. Compile and simplify/net by counterparty
  const globalNets: GlobalNetBalance[] = []

  for (const [userId, data] of userNets.entries()) {
    const totalNetCents = data.breakdown.reduce((sum, item) => sum + Math.round(item.convertedAmount * 100), 0)
    const netAmount = totalNetCents / 100

    // Only return if there is an active outstanding debt
    if (netAmount !== 0) {
      globalNets.push({
        userId,
        userName: data.name,
        netAmount,
        currency: targetCurrency,
        breakdown: data.breakdown
      })
    }
  }

  return globalNets
}

export const globalBalanceService = {
  getGlobalNettedBalances
}
