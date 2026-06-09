import express from 'express'
import cors from 'cors'
import authRouter from './modules/auth/auth.routes'
import userRouter from './modules/user/user.routes'
import groupRouter from './modules/group/group.routes'
import expenseRouter from './modules/expense/expense.routes'
import balanceRouter from './modules/balance/balance.routes'
import settlementRouter from './modules/settlement/settlement.routes'
import intelligenceRouter from './modules/intelligence/intelligence.routes'
import { authenticate } from './middleware/auth.middleware'
import { eventEmitter } from './lib/events'
import { eventHandlers } from './modules/intelligence/event.handlers'

// Initialize event listeners
eventEmitter.on('ExpenseAdded', eventHandlers.handleExpenseAdded)
eventEmitter.on('SettlementRecorded', eventHandlers.handleSettlementRecorded)

const app = express()

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (/^http:\/\/localhost:(5173|5174|5175)$/.test(origin)) {
      return callback(null, true);
    }
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Public
app.use('/api/auth', authRouter)
app.use('/api/users', userRouter)

// Protected
app.use('/api/groups', authenticate, balanceRouter)
app.use('/api/expenses', authenticate, expenseRouter)
app.use('/api/groups', authenticate, groupRouter)
app.use('/api/settlements', authenticate, settlementRouter)
app.use('/api/intelligence', authenticate, intelligenceRouter)

export default app
