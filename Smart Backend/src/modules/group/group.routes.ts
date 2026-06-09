import { Router } from 'express'
import { groupController } from './group.controller'

const router = Router()

router.post('/', groupController.createGroup)
router.get('/', groupController.getAllGroups)
router.get('/:id', groupController.getGroupById)
router.get('/:groupId/members', groupController.getGroupMembers)
router.post('/:groupId/members', groupController.addMember)

export default router
