import { Request, Response } from 'express'
import { settlementService } from './settlement.service'

async function createSettlement(req: Request, res: Response): Promise<void> {
  const { groupId, receiverId, amount, note, payerId: explicitPayerId } = req.body
  const requesterId = req.user!.userId
  const payerId = explicitPayerId ?? requesterId

  if (!groupId || !receiverId) {
    res.status(400).json({ error: 'groupId and receiverId are required' })
    return
  }

  if (payerId === receiverId) {
    res.status(400).json({ error: 'You cannot settle with yourself' })
    return
  }

  if (requesterId !== payerId && requesterId !== receiverId) {
    res.status(403).json({ error: 'You can only settle debts you are a party to' })
    return
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0.01 || amount > 9_999_999.99) {
    res.status(400).json({ error: 'amount must be between 0.01 and 9,999,999.99' })
    return
  }

  if (note !== undefined && typeof note !== 'string') {
    res.status(400).json({ error: 'note must be a string' })
    return
  }

  try {
    const settlement = await settlementService.createSettlement({
      groupId,
      payerId,
      receiverId,
      amount,
      note,
    })
    res.status(201).json({ settlement })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'GROUP_NOT_FOUND') {
        res.status(404).json({ error: err.message })
        return
      }
      // NOT_MEMBER means payer is not in the group (thrown by balanceService)
      if (err.name === 'NOT_MEMBER' || err.name === 'PAYER_NOT_MEMBER') {
        res.status(403).json({ error: err.message })
        return
      }
      if (err.name === 'RECEIVER_NOT_MEMBER') {
        res.status(422).json({ error: err.message })
        return
      }
      if (err.name === 'NO_DEBT_OWED') {
        res.status(422).json({ error: err.message })
        return
      }
      if (err.name === 'AMOUNT_EXCEEDS_OWED') {
        res.status(422).json({ error: err.message })
        return
      }
    }
    console.error('[createSettlement]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function createGlobalSettlement(req: Request, res: Response): Promise<void> {
  const { receiverId, amount, targetCurrency, breakdown, note, payerId: explicitPayerId } = req.body
  const requesterId = req.user!.userId
  const payerId = explicitPayerId ?? requesterId

  if (!receiverId || !breakdown || !Array.isArray(breakdown) || breakdown.length === 0) {
    res.status(400).json({ error: 'receiverId and non-empty breakdown array are required' })
    return
  }

  if (payerId === receiverId) {
    res.status(400).json({ error: 'You cannot settle with yourself' })
    return
  }

  if (requesterId !== payerId && requesterId !== receiverId) {
    res.status(403).json({ error: 'You can only settle debts you are a party to' })
    return
  }

  try {
    const settlements = await settlementService.createGlobalSettlement({
      payerId,
      receiverId,
      amount,
      targetCurrency: targetCurrency || 'EUR',
      breakdown,
      note,
    })
    res.status(201).json({ settlements })
  } catch (err: unknown) {
    if (err instanceof Error) {
      res.status(422).json({ error: err.message })
      return
    }
    console.error('[createGlobalSettlement]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const settlementController = { createSettlement, createGlobalSettlement }
