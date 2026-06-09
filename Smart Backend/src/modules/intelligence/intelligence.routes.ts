import { Router } from 'express'
import { intelligenceController } from './intelligence.controller'

const router = Router()

// Read-only endpoints for intelligence data
router.get('/users/:userId', intelligenceController.getUserIntelligence)
router.get('/users/:userId/longitudinal', intelligenceController.getUserLongitudinalStats)
router.get('/groups/:groupId', intelligenceController.getGroupIntelligence)
router.get('/groups/:groupId/balance-insight', intelligenceController.getSocialBalanceInsight)

export default router
