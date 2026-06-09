import { Router } from 'express'
import { settlementController } from './settlement.controller'

const router = Router()

router.post('/', settlementController.createSettlement)
router.post('/global', settlementController.createGlobalSettlement)

export default router
