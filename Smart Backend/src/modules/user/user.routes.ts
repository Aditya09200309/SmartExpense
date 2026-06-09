import { Router } from 'express'
import { userController } from './user.controller'
import { authenticate } from '../../middleware/auth.middleware'

const router = Router()

router.post('/', userController.createUser)                   // public: registration
router.get('/', authenticate, userController.getUsers)        // protected: frontend dropdowns
router.get('/:id', authenticate, userController.getUserById)  // protected
router.patch('/preferences', authenticate, userController.updatePreferences)

export default router
