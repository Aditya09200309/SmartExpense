import prisma from '../../lib/prisma'

export interface CreateGroupInput {
  name: string
  description?: string
  createdById: string
  baseCurrency?: string
  designatedPayerId?: string
}

export interface AddMemberInput {
  groupId: string
  userId: string
  requesterId: string
}

const GROUP_LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  baseCurrency: true,
  designatedPayerId: true,
} as const

const MEMBER_SELECT = {
  id: true,
  role: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  createdById: true,
  baseCurrency: true,
  designatedPayerId: true,
  members: {
    select: MEMBER_SELECT,
  },
} as const

async function createGroup(input: CreateGroupInput) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.createdById },
      select: { id: true },
    })

    if (!user) {
      const err = new Error('User not found')
      err.name = 'USER_NOT_FOUND'
      throw err
    }

    return tx.group.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim(),
        createdById: input.createdById,
        baseCurrency: input.baseCurrency ?? 'USD',
        designatedPayerId: input.designatedPayerId,
        members: {
          create: {
            userId: input.createdById,
            role: 'ADMIN',
          },
        },
      },
      select: GROUP_SELECT,
    })
  })
}

async function getGroupById(id: string, requesterId: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    select: GROUP_SELECT,
  })

  if (!group) {
    const err = new Error('Group not found')
    err.name = 'GROUP_NOT_FOUND'
    throw err
  }

  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: requesterId, groupId: id } },
    select: { id: true },
  })
  if (!membership) {
    const err = new Error('You are not a member of this group')
    err.name = 'NOT_MEMBER'
    throw err
  }

  return group
}

async function addMember(input: AddMemberInput) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({
      where: { id: input.groupId },
      select: { id: true },
    })
    if (!group) {
      const err = new Error('Group not found')
      err.name = 'GROUP_NOT_FOUND'
      throw err
    }

    const requester = await tx.groupMember.findUnique({
      where: { userId_groupId: { userId: input.requesterId, groupId: input.groupId } },
      select: { role: true },
    })
    if (!requester) {
      const err = new Error('You are not a member of this group')
      err.name = 'NOT_MEMBER'
      throw err
    }
    if (requester.role !== 'ADMIN') {
      const err = new Error('Only admins can add members')
      err.name = 'NOT_ADMIN'
      throw err
    }

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    })
    if (!user) {
      const err = new Error('User not found')
      err.name = 'USER_NOT_FOUND'
      throw err
    }

    const existing = await tx.groupMember.findUnique({
      where: { userId_groupId: { userId: input.userId, groupId: input.groupId } },
      select: { id: true },
    })
    if (existing) {
      const err = new Error('User is already a member of this group')
      err.name = 'ALREADY_MEMBER'
      throw err
    }

    return tx.groupMember.create({
      data: {
        userId: input.userId,
        groupId: input.groupId,
        role: 'MEMBER',
      },
      select: MEMBER_SELECT,
    })
  })
}

async function getAllGroups(requesterId: string) {
  const rows = await prisma.group.findMany({
    where: { members: { some: { userId: requesterId } } },
    select: {
      id: true,
      name: true,
      description: true,
      baseCurrency: true,
      designatedPayerId: true,
      createdAt: true,
      members: { where: { userId: requesterId }, select: { role: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description ?? undefined,
    baseCurrency: g.baseCurrency,
    designatedPayerId: g.designatedPayerId,
    createdAt: g.createdAt,
    currentUserRole: (g.members[0]?.role ?? 'MEMBER') as 'ADMIN' | 'MEMBER',
  }))
}

async function getGroupMembers(groupId: string, requesterId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  })

  if (!group) {
    const err = new Error('Group not found')
    err.name = 'GROUP_NOT_FOUND'
    throw err
  }

  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: requesterId, groupId } },
    select: { id: true },
  })
  if (!membership) {
    const err = new Error('You are not a member of this group')
    err.name = 'NOT_MEMBER'
    throw err
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  return members.map((m) => m.user)
}

export const groupService = { createGroup, getGroupById, getAllGroups, getGroupMembers, addMember }
