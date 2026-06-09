import { Request, Response } from 'express'
import { balanceService } from './balance.service'
import { globalBalanceService } from './globalBalance.service'

async function getGroupBalances(req: Request, res: Response): Promise<void> {
  const groupId = req.params['groupId'] as string
  const requesterId = req.user!.userId

  try {
    const balances = await balanceService.getGroupBalances(groupId, requesterId)
    res.json(balances)
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
    }
    console.error('[getGroupBalances]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function getGlobalNettedBalances(req: Request, res: Response): Promise<void> {
  const requesterId = req.user!.userId
  const targetCurrency = (req.query['currency'] as string) || 'EUR'

  try {
    const globalNets = await globalBalanceService.getGlobalNettedBalances(requesterId, targetCurrency)
    res.json(globalNets)
  } catch (err: unknown) {
    console.error('[getGlobalNettedBalances]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const balanceController = { getGroupBalances, getGlobalNettedBalances }
