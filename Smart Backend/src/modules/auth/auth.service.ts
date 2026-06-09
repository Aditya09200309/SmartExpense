import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../../lib/prisma'

interface LoginResult {
  token: string
  user: { id: string; name: string; email: string }
}

async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, name: true, email: true, passwordHash: true },
  })

  if (!user) {
    const err = new Error('Invalid email or password')
    err.name = 'INVALID_CREDENTIALS'
    throw err
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const err = new Error('Invalid email or password')
    err.name = 'INVALID_CREDENTIALS'
    throw err
  }

  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')

  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: '7d' })

  return { token, user: { id: user.id, name: user.name, email: user.email } }
}

export const authService = { login }
