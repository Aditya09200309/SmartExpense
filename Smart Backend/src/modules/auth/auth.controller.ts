import { Request, Response } from 'express'
import { authService } from './auth.service'
import { userService } from '../user/user.service'

async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = await userService.getUserById(req.user!.userId)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ user })
  } catch (err: unknown) {
    console.error('[me]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' })
    return
  }

  try {
    const result = await authService.login(email, password)
    res.json(result)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: err.message })
      return
    }
    console.error('[login]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const authController = { login, me }
