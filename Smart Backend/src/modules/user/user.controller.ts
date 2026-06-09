import { Request, Response } from 'express'
import { userService } from './user.service'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function createUser(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    res.status(400).json({ error: 'name, email, and password are required' })
    return
  }

  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Invalid email format' })
    return
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }

  try {
    const user = await userService.createUser({ name, email, password })
    res.status(201).json({ user })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'EMAIL_TAKEN') {
      res.status(409).json({ error: err.message })
      return
    }
    console.error('[createUser]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function getUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await userService.getUsers()
    res.json({ users })
  } catch (err: unknown) {
    console.error('[getUsers]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function getUserById(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string

  try {
    const user = await userService.getUserById(id)

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch (err: unknown) {
    console.error('[getUserById]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function updatePreferences(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId
  const { optOutNudges } = req.body

  if (typeof optOutNudges !== 'boolean') {
    res.status(400).json({ error: 'optOutNudges must be a boolean' })
    return
  }

  try {
    const user = await userService.updatePreferences(userId, optOutNudges)
    res.json({ user })
  } catch (err: unknown) {
    console.error('[updatePreferences]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const userController = { createUser, getUsers, getUserById, updatePreferences }
