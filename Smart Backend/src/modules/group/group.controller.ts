import { Request, Response } from 'express'
import { groupService } from './group.service'

async function createGroup(req: Request, res: Response): Promise<void> {
  const { name, description, baseCurrency, designatedPayerId } = req.body
  const createdById = req.user!.userId

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  try {
    const group = await groupService.createGroup({ name, description, createdById, baseCurrency, designatedPayerId })
    res.status(201).json({ group })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'USER_NOT_FOUND') {
      res.status(404).json({ error: err.message })
      return
    }
    console.error('[createGroup]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function getGroupById(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string
  const requesterId = req.user!.userId

  try {
    const group = await groupService.getGroupById(id, requesterId)
    res.json({ group })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'GROUP_NOT_FOUND') {
        res.status(404).json({ error: err.message })
        return
      }
      if (err.name === 'NOT_MEMBER') {
        res.status(403).json({ error: err.message })
        return
      }
    }
    console.error('[getGroupById]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function addMember(req: Request, res: Response): Promise<void> {
  const groupId = req.params['groupId'] as string
  const { userId } = req.body
  const requesterId = req.user!.userId

  if (!userId) {
    res.status(400).json({ error: 'userId is required' })
    return
  }

  try {
    const member = await groupService.addMember({ groupId, userId, requesterId })
    res.status(201).json({ member })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'GROUP_NOT_FOUND' || err.name === 'USER_NOT_FOUND') {
        res.status(404).json({ error: err.message })
        return
      }
      if (err.name === 'NOT_MEMBER' || err.name === 'NOT_ADMIN') {
        res.status(403).json({ error: err.message })
        return
      }
      if (err.name === 'ALREADY_MEMBER') {
        res.status(409).json({ error: err.message })
        return
      }
    }
    console.error('[addMember]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function getAllGroups(req: Request, res: Response): Promise<void> {
  const requesterId = req.user!.userId
  try {
    const groups = await groupService.getAllGroups(requesterId)
    res.json({ groups })
  } catch (err: unknown) {
    console.error('[getAllGroups]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function getGroupMembers(req: Request, res: Response): Promise<void> {
  const groupId = req.params['groupId'] as string
  const requesterId = req.user!.userId

  try {
    const members = await groupService.getGroupMembers(groupId, requesterId)
    res.json({ members })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'GROUP_NOT_FOUND') {
        res.status(404).json({ error: err.message })
        return
      }
      if (err.name === 'NOT_MEMBER') {
        res.status(403).json({ error: err.message })
        return
      }
    }
    console.error('[getGroupMembers]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const groupController = { createGroup, getGroupById, getAllGroups, getGroupMembers, addMember }
