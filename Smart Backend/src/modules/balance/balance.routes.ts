import { Router } from 'express'
import { balanceController } from './balance.controller'

const router = Router()

router.get('/global', balanceController.getGlobalNettedBalances)
router.get('/:groupId/balances', balanceController.getGroupBalances)

export default router
