import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma helper
vi.mock('../../lib/prisma', () => {
  const findManyFn = vi.fn()
  const db = { groupMember: { findMany: findManyFn } }
  return {
    default: db,
  }
})

// Mock balanceService
vi.mock('./balance.service', () => ({
  balanceService: {
    getGroupBalances: vi.fn(),
  },
}))

import { globalBalanceService } from './globalBalance.service'
import { balanceService } from './balance.service'
import prisma from '../../lib/prisma'

const mockFindMemberships = vi.mocked(prisma.groupMember.findMany)
const mockGetGroupBalances = vi.mocked(balanceService.getGroupBalances)

describe('globalBalanceService.getGlobalNettedBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when user is in no groups', async () => {
    mockFindMemberships.mockResolvedValue([])

    const result = await globalBalanceService.getGlobalNettedBalances('user-alice')
    expect(result).toEqual([])
    expect(mockFindMemberships).toHaveBeenCalledWith({
      where: { userId: 'user-alice' },
      select: { groupId: true, group: { select: { name: true } } }
    })
  })

  it('correctly nets balances across multiple groups with EUR base', async () => {
    // Alice is in 2 groups
    mockFindMemberships.mockResolvedValue([
      { groupId: 'group-a', group: { name: 'Trip' } },
      { groupId: 'group-b', group: { name: 'Rent' } },
    ])

    // In Group A, Alice owes Bob 50 EUR
    mockGetGroupBalances.mockImplementation(async (groupId: string) => {
      if (groupId === 'group-a') {
        return {
          groupId: 'group-a',
          baseCurrency: 'EUR',
          simplifiedDebts: [
            { fromUserId: 'user-alice', fromUserName: 'Alice', toUserId: 'user-bob', toUserName: 'Bob', amount: 50 }
          ],
          netBalances: [],
          totalExpenses: 100,
          totalSettled: 0,
          activity: []
        }
      }
      // In Group B, Bob owes Alice 30 EUR
      if (groupId === 'group-b') {
        return {
          groupId: 'group-b',
          baseCurrency: 'EUR',
          simplifiedDebts: [
            { fromUserId: 'user-bob', fromUserName: 'Bob', toUserId: 'user-alice', toUserName: 'Alice', amount: 30 }
          ],
          netBalances: [],
          totalExpenses: 100,
          totalSettled: 0,
          activity: []
        }
      }
      return null as any
    })

    const result = await globalBalanceService.getGlobalNettedBalances('user-alice', 'EUR')

    // Alice owes Bob 50 in Group A, and Bob owes Alice 30 in Group B.
    // Net result: Alice owes Bob 20 EUR.
    expect(result).toHaveLength(1)
    expect(result[0].userId).toBe('user-bob')
    expect(result[0].netAmount).toBe(-20) // negative means Alice owes Bob
    expect(result[0].currency).toBe('EUR')
    expect(result[0].breakdown).toHaveLength(2)
  })
})
