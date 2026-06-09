import prisma from '../../lib/prisma'

export interface SplitInput {
  userId: string
  amount: number
}

export interface CreateExpenseInput {
  groupId: string
  requesterId: string
  paidById: string
  amount: number
  description: string
  category?: string
  currency?: string
  exchangeRate?: number
  splits: SplitInput[]
}

const SPLIT_SELECT = {
  id: true,
  userId: true,
  amount: true,
  isPaid: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const

const EXPENSE_SELECT = {
  id: true,
  groupId: true,
  amount: true,
  description: true,
  category: true,
  splitType: true,
  date: true,
  createdAt: true,
  currency: true,
  exchangeRate: true,
  paidBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  splits: {
    select: SPLIT_SELECT,
  },
} as const

import { eventEmitter } from '../../lib/events'

async function createExpense(input: CreateExpenseInput) {
  const expense = await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({
      where: { id: input.groupId },
      select: { id: true },
    })
    if (!group) {
      const err = new Error('Group not found')
      err.name = 'GROUP_NOT_FOUND'
      throw err
    }

    const members = await tx.groupMember.findMany({
      where: { groupId: input.groupId },
      select: { userId: true },
    })
    const memberIds = new Set(members.map((m) => m.userId))

    if (!memberIds.has(input.requesterId)) {
      const err = new Error('You are not a member of this group')
      err.name = 'NOT_MEMBER'
      throw err
    }

    if (!memberIds.has(input.paidById)) {
      const err = new Error('Payer is not a member of this group')
      err.name = 'PAYER_NOT_MEMBER'
      throw err
    }

    for (const split of input.splits) {
      if (!memberIds.has(split.userId)) {
        const err = new Error(`User ${split.userId} is not a member of this group`)
        err.name = 'SPLIT_USER_NOT_MEMBER'
        throw err
      }
    }

    const splitUserIds = input.splits.map((s) => s.userId)
    if (new Set(splitUserIds).size !== splitUserIds.length) {
      const err = new Error('splits cannot contain duplicate userIds')
      err.name = 'DUPLICATE_SPLIT_USER'
      throw err
    }

    const totalCents = Math.round(input.amount * 100)
    const splitTotalCents = input.splits.reduce(
      (sum, s) => sum + Math.round(s.amount * 100),
      0,
    )
    if (totalCents !== splitTotalCents) {
      const err = new Error('Sum of splits must equal the total expense amount')
      err.name = 'SPLIT_AMOUNT_MISMATCH'
      throw err
    }

    return tx.expense.create({
      data: {
        groupId: input.groupId,
        paidById: input.paidById,
        amount: input.amount,
        description: input.description.trim(),
        category: input.category?.trim(),
        currency: input.currency ?? 'USD',
        exchangeRate: input.exchangeRate ?? 1.0,
        splitType: 'EXACT',
        splits: {
          create: input.splits.map((s) => ({
            userId: s.userId,
            amount: s.amount,
          })),
        },
      },
      select: EXPENSE_SELECT,
    })
  })

  // Emit event after successful transaction
  eventEmitter.emit('ExpenseAdded', {
    type: 'ExpenseAdded',
    version: '1.0',
    timestamp: Date.now(),
    data: {
      expenseId: expense.id,
      groupId: expense.groupId,
      paidById: expense.paidBy.id,
      amount: Number(expense.amount),
      splits: expense.splits.map(s => ({
        userId: s.userId,
        amount: Number(s.amount)
      }))
    }
  })

  return expense
}

export const expenseService = { createExpense }
