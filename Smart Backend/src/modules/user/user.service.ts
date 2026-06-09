import bcrypt from 'bcryptjs'
import prisma from '../../lib/prisma'

export interface CreateUserInput {
  name: string
  email: string
  password: string
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  optOutNudges: true,
} as const

async function createUser(input: CreateUserInput) {
  const normalizedEmail = input.email.toLowerCase().trim()

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  })

  if (existing) {
    const err = new Error('Email is already in use')
    err.name = 'EMAIL_TAKEN'
    throw err
  }

  const passwordHash = await bcrypt.hash(input.password, 10)

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
    },
    select: USER_SELECT,
  })

  return user
}

async function getUsers() {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: 'asc' },
  })
}

async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  })
}

async function updatePreferences(id: string, optOutNudges: boolean) {
  return prisma.user.update({
    where: { id },
    data: { optOutNudges },
    select: USER_SELECT,
  })
}

export const userService = { createUser, getUsers, getUserById, updatePreferences }
