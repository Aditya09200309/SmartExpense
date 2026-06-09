import prisma from '../../lib/prisma'
import { Prisma } from '../../generated/prisma/client'
import { balanceService } from '../balance/balance.service'

export interface CreateSettlementInput {
  groupId: string
  payerId: string
  receiverId: string
  amount: number
  note?: string
}

const SETTLEMENT_SELECT = {
  id: true,
  groupId: true,
  amount: true,
  note: true,
  settledAt: true,
  payer: {
    select: { id: true, name: true, email: true },
  },
  receiver: {
    select: { id: true, name: true, email: true },
  },
} as const

import { eventEmitter } from '../../lib/events'

async function createSettlement(input: CreateSettlementInput) {
  const settlement = await prisma.$transaction(async (tx) => {
    // getGroupBalances throws GROUP_NOT_FOUND or NOT_MEMBER if the group doesn't
    // exist or the payer is not a member — both propagate to the controller.
    const balances = await balanceService.getGroupBalances(input.groupId, input.payerId, tx)

    // Verify receiver is a current member of the group.
    const receiverInGroup = balances.netBalances.some(b => b.userId === input.receiverId)
    if (!receiverInGroup) {
      const err = new Error('Receiver is not a member of this group')
      err.name = 'RECEIVER_NOT_MEMBER'
      throw err
    }

    // There must be a simplified debt from payer → receiver right now.
    const debt = balances.simplifiedDebts.find(
      d => d.fromUserId === input.payerId && d.toUserId === input.receiverId,
    )
    if (!debt) {
      const err = new Error('You do not currently owe this person in this group')
      err.name = 'NO_DEBT_OWED'
      throw err
    }

    // Settlement cannot exceed the outstanding simplified debt.
    const debtCents = Math.round(debt.amount * 100)
    const amountCents = Math.round(input.amount * 100)
    if (amountCents > debtCents) {
      const err = new Error(
        `Settlement amount exceeds the amount currently owed (${debt.amount.toFixed(2)})`,
      )
      err.name = 'AMOUNT_EXCEEDS_OWED'
      throw err
    }

    return tx.settlement.create({
      data: {
        groupId: input.groupId,
        payerId: input.payerId,
        receiverId: input.receiverId,
        amount: input.amount,
        note: input.note?.trim() || null,
      },
      select: SETTLEMENT_SELECT,
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  // Emit event after successful transaction
  eventEmitter.emit('SettlementRecorded', {
    type: 'SettlementRecorded',
    version: '1.0',
    timestamp: Date.now(),
    data: {
      settlementId: settlement.id,
      groupId: settlement.groupId,
      payerId: settlement.payer.id,
      receiverId: settlement.receiver.id,
      amount: Number(settlement.amount)
    }
  })

  return settlement
}

async function createGlobalSettlement(input: {
  payerId: string
  receiverId: string
  amount: number
  targetCurrency: string
  breakdown: Array<{
    groupId: string
    originalAmount: number
    payerId: string
    receiverId: string
    amount: number
  }>
  note?: string
}) {
  const settlements = await prisma.$transaction(async (tx) => {
    const createdList = []
    for (const item of input.breakdown) {
      const balances = await balanceService.getGroupBalances(item.groupId, item.payerId, tx)
      
      const receiverInGroup = balances.netBalances.some(b => b.userId === item.receiverId)
      if (!receiverInGroup) {
        throw new Error(`Receiver is not a member of group ${item.groupId}`)
      }

      const debt = balances.simplifiedDebts.find(
        d => d.fromUserId === item.payerId && d.toUserId === item.receiverId,
      )
      if (!debt) {
        throw new Error(`No debt owed from ${item.payerId} to ${item.receiverId} in group ${item.groupId}`)
      }

      const debtCents = Math.round(debt.amount * 100)
      const amountCents = Math.round(item.amount * 100)
      if (amountCents > debtCents) {
        throw new Error(`Settlement amount exceeds group debt in group ${item.groupId}`)
      }

      const created = await tx.settlement.create({
        data: {
          groupId: item.groupId,
          payerId: item.payerId,
          receiverId: item.receiverId,
          amount: item.amount,
          note: input.note?.trim() ? `[Global Netting] ${input.note.trim()}` : '[Global Netting Offset]',
        },
        select: SETTLEMENT_SELECT,
      })
      createdList.push(created)
    }
    return createdList
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  // Emit event for each created settlement
  for (const settlement of settlements) {
    eventEmitter.emit('SettlementRecorded', {
      type: 'SettlementRecorded',
      version: '1.0',
      timestamp: Date.now(),
      data: {
        settlementId: settlement.id,
        groupId: settlement.groupId,
        payerId: settlement.payer.id,
        receiverId: settlement.receiver.id,
        amount: Number(settlement.amount)
      }
    })
  }

  return settlements
}

export const settlementService = { createSettlement, createGlobalSettlement }
