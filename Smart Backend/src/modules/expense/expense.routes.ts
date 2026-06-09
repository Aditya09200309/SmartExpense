import { Router } from 'express'
import { expenseController } from './expense.controller'

const router = Router()

router.post('/', expenseController.createExpense)

export default router
