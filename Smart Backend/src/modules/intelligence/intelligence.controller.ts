import { Request, Response } from 'express'
import { intelligenceService } from './intelligence.service'
import { getSocialBalanceInsight as getInsightEngine } from './socialBalance.engine'

async function getUserIntelligence(req: Request, res: Response) {
  try {
    const userId = req.params.userId as string
    const data = await intelligenceService.getUserIntelligence(userId)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user intelligence' })
  }
}

async function getGroupIntelligence(req: Request, res: Response) {
  try {
    const groupId = req.params.groupId as string
    const data = await intelligenceService.getGroupIntelligence(groupId)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch group intelligence' })
  }
}

async function getUserLongitudinalStats(req: Request, res: Response) {
  try {
    const userId = req.params.userId as string
    const data = await intelligenceService.getUserLongitudinalStats(userId)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch longitudinal stats' })
  }
}

async function getSocialBalanceInsight(req: Request, res: Response) {
  try {
    const groupId = req.params.groupId as string
    const requesterId = req.user!.userId
    const data = await getInsightEngine(groupId, requesterId)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch social balance insight' })
  }
}

export const intelligenceController = {
  getUserIntelligence,
  getGroupIntelligence,
  getUserLongitudinalStats,
  getSocialBalanceInsight
}
