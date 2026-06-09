import prisma from '../../lib/prisma'

export interface UserIntelligence {
  userId: string
  trustScore: number
  dominantTrait?: string
}

export interface GroupIntelligence {
  groupId: string
  healthScore: number
}

async function getUserIntelligence(userId: string): Promise<UserIntelligence> {
  const [behavior, personality] = await Promise.all([
    prisma.intel_UserBehavior.findUnique({ where: { userId } }),
    prisma.intel_UserPersonality.findUnique({ where: { userId } })
  ])
  return {
    userId,
    trustScore: behavior?.trustScore ?? 100, // Default to 100
    dominantTrait: personality?.dominantTrait
  }
}

async function getGroupIntelligence(groupId: string): Promise<GroupIntelligence> {
  const health = await prisma.intel_GroupHealth.findUnique({
    where: { groupId }
  })
  return {
    groupId,
    healthScore: health?.healthScore ?? 100 // Default to 100
  }
}

async function getUserLongitudinalStats(userId: string) {
  // In a full implementation, this queries the Intel_LongitudinalStats table 
  // which is populated by a nightly cron job.
  // For Phase 4 execution, we scaffold a 3-month synthetic trend to demonstrate the moat.
  
  const now = new Date()
  return [
    { periodStart: new Date(now.getFullYear(), now.getMonth() - 2, 1), avgTimeToSettle: 48, totalContribution: 1200 },
    { periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), avgTimeToSettle: 36, totalContribution: 1800 },
    { periodStart: new Date(now.getFullYear(), now.getMonth(), 1), avgTimeToSettle: 12, totalContribution: 800 },
  ]
}

export const intelligenceService = {
  getUserIntelligence,
  getGroupIntelligence,
  getUserLongitudinalStats
}
