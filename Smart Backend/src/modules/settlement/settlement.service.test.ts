import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock before importing the module under test.
// $transaction must pass `db` as the tx argument so the service callback can
// call tx.settlement.create — same vi.fn() instance so mockCreate tracks it.
vi.mock('../../lib/prisma', () => {
  const createFn = vi.fn()
  const db = { settlement: { create: createFn } }
  return {
    default: Object.assign({}, db, {
      $transaction: vi.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
    }),
  }
})

vi.mock('../balance/balance.service', () => ({
  balanceService: {
    getGroupBalances: vi.fn(),
  },
}))

import { settlementService } from './settlement.service'
import { balanceService } from '../balance/balance.service'
import prisma from '../../lib/prisma'

const mockGetBalances = vi.mocked(balanceService.getGroupBalances)
const mockCreate = vi.mocked(prisma.settlement.create)

const GROUP_ID = 'group-1'
const PAYER_ID = 'user-alice'
const RECEIVER_ID = 'user-bob'

const BASE_BALANCES = {
  groupId: GROUP_ID,
  baseCurrency: 'USD',
  netBalances: [
    { userId: PAYER_ID,    name: 'Alice', email: 'alice@t.com', netBalance: -50 },
    { userId: RECEIVER_ID, name: 'Bob',   email: 'bob@t.com',   netBalance:  50 },
  ],
  simplifiedDebts: [
    {
      fromUserId: PAYER_ID,    fromUserName: 'Alice',
      toUserId:   RECEIVER_ID, toUserName:   'Bob',
      amount: 50,
    },
  ],
  rawDebts: [
    {
      fromUserId: PAYER_ID,    fromUserName: 'Alice',
      toUserId:   RECEIVER_ID, toUserName:   'Bob',
      amount: 50,
    },
  ],
  totalExpenses: 0,
  totalSettled: 0,
  activity: [],
}

const CREATED_SETTLEMENT = {
  id: 'settlement-1',
  groupId: GROUP_ID,
  amount: 50,
  note: null,
  settledAt: new Date(),
  payer:    { id: PAYER_ID,    name: 'Alice', email: 'alice@t.com' },
  receiver: { id: RECEIVER_ID, name: 'Bob',   email: 'bob@t.com'  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBalances.mockResolvedValue(BASE_BALANCES)
  mockCreate.mockResolvedValue(CREATED_SETTLEMENT as never)
})

describe('settlementService.createSettlement', () => {
  it('creates a valid full settlement', async () => {
    const result = await settlementService.createSettlement({
      groupId: GROUP_ID,
      payerId: PAYER_ID,
      receiverId: RECEIVER_ID,
      amount: 50,
    })
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(result).toBe(CREATED_SETTLEMENT)
  })

  it('creates a valid partial settlement (amount < debt)', async () => {
    await settlementService.createSettlement({
      groupId: GROUP_ID,
      payerId: PAYER_ID,
      receiverId: RECEIVER_ID,
      amount: 25,
    })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('rejects when balanceService says the group does not exist', async () => {
    const err = Object.assign(new Error('Group not found'), { name: 'GROUP_NOT_FOUND' })
    mockGetBalances.mockRejectedValue(err)
    await expect(
      settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50 }),
    ).rejects.toMatchObject({ name: 'GROUP_NOT_FOUND' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects when payer is not a member (balanceService throws NOT_MEMBER)', async () => {
    const err = Object.assign(new Error('You are not a member of this group'), { name: 'NOT_MEMBER' })
    mockGetBalances.mockRejectedValue(err)
    await expect(
      settlementService.createSettlement({ groupId: GROUP_ID, payerId: 'stranger', receiverId: RECEIVER_ID, amount: 50 }),
    ).rejects.toMatchObject({ name: 'NOT_MEMBER' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects when receiver is not in netBalances', async () => {
    mockGetBalances.mockResolvedValue({
      ...BASE_BALANCES,
      netBalances: BASE_BALANCES.netBalances.filter(b => b.userId !== RECEIVER_ID),
      simplifiedDebts: [],
      rawDebts: [],
      totalExpenses: 0,
      totalSettled: 0,
      activity: []
    })
    await expect(
      settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50 }),
    ).rejects.toMatchObject({ name: 'RECEIVER_NOT_MEMBER' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects when no simplified debt exists from payer to receiver', async () => {
    mockGetBalances.mockResolvedValue({ ...BASE_BALANCES, simplifiedDebts: [], rawDebts: [] })
    await expect(
      settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50 }),
    ).rejects.toMatchObject({ name: 'NO_DEBT_OWED' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects when amount exceeds the outstanding debt', async () => {
    await expect(
      settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50.01 }),
    ).rejects.toMatchObject({ name: 'AMOUNT_EXCEEDS_OWED' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('allows settlement equal to the exact debt amount', async () => {
    await settlementService.createSettlement({
      groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50,
    })
    expect(mockCreate).toHaveBeenCalledOnce()
  })
})
