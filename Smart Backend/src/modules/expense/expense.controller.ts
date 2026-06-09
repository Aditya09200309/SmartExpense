import { Request, Response } from 'express'
import { expenseService, SplitInput } from './expense.service'

async function createExpense(req: Request, res: Response): Promise<void> {
  const { groupId, amount, description, category, splits, paidById: bodyPaidById, currency, exchangeRate } = req.body
  const paidById =
    typeof bodyPaidById === 'string' && bodyPaidById.trim()
      ? bodyPaidById
      : req.user!.userId

  if (!groupId || !description?.trim() || amount === undefined || amount === null) {
    res.status(400).json({ error: 'groupId, description, and amount are required' })
    return
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0.01 || amount > 9_999_999.99) {
    res.status(400).json({ error: 'amount must be between 0.01 and 9,999,999.99' })
    return
  }

  if (!Array.isArray(splits) || splits.length === 0) {
    res.status(400).json({ error: 'splits must be a non-empty array' })
    return
  }

  for (const split of splits) {
    if (!split.userId || typeof split.amount !== 'number' || split.amount < 0.01) {
      res.status(400).json({ error: 'each split must have a userId and an amount of at least 0.01' })
      return
    }
  }

  const splitUserIds = (splits as SplitInput[]).map((s) => s.userId)
  if (new Set(splitUserIds).size !== splitUserIds.length) {
    res.status(400).json({ error: 'splits cannot contain duplicate userIds' })
    return
  }

  try {
    const expense = await expenseService.createExpense({
      groupId,
      requesterId: req.user!.userId,
      paidById,
      amount,
      description,
      category,
      splits,
      currency,
      exchangeRate,
    })
    res.status(201).json({ expense })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'GROUP_NOT_FOUND') {
        res.status(404).json({ error: err.message })
        return
      }
      if (err.name === 'NOT_MEMBER') {
        res.status(403).json({ error: err.message })
        return
      }
      if (err.name === 'PAYER_NOT_MEMBER') {
        res.status(403).json({ error: err.message })
        return
      }
      if (err.name === 'SPLIT_USER_NOT_MEMBER') {
        res.status(422).json({ error: err.message })
        return
      }
      if (err.name === 'SPLIT_AMOUNT_MISMATCH' || err.name === 'DUPLICATE_SPLIT_USER') {
        res.status(400).json({ error: err.message })
        return
      }
    }
    console.error('[createExpense]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const expenseController = { createExpense }
