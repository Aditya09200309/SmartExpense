import prisma from '../../lib/prisma'

/**
 * Re-computes the 30-day social equilibrium metrics for a group
 * after an expense is added. This is an asynchronous side-effect.
 */
export async function updateGroupSocialEquilibrium(groupId: string): Promise<void> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // 1. Fetch all expenses in the last 30 days for this group
  const recentExpenses = await prisma.expense.findMany({
    where: {
      groupId,
      createdAt: {
        gte: thirtyDaysAgo
      }
    }
  })

  // 2. Aggregate burden metrics per user
  const userMetrics = new Map<string, { liquidityBurden: number; initiationCount: number }>()

  for (const expense of recentExpenses) {
    const payerId = expense.paidById
    const current = userMetrics.get(payerId) || { liquidityBurden: 0, initiationCount: 0 }
    
    current.liquidityBurden += Number(expense.amount)
    current.initiationCount += 1
    
    userMetrics.set(payerId, current)
  }

  // 3. Upsert metrics to Intel_SocialEquilibrium
  for (const [userId, metrics] of userMetrics.entries()) {
    await prisma.intel_SocialEquilibrium.upsert({
      where: {
        groupId_userId: { groupId, userId }
      },
      update: {
        rollingLiquidityBurden: metrics.liquidityBurden,
        rollingInitiationCount: metrics.initiationCount,
        lastUpdated: new Date()
      },
      create: {
        groupId,
        userId,
        rollingLiquidityBurden: metrics.liquidityBurden,
        rollingInitiationCount: metrics.initiationCount
      }
    })
  }
}

export interface BalanceInsight {
  suggestedPayerId: string | null
  message: string
}

/**
 * Read-only insight function to determine who should naturally cover the next expense.
 */
export async function getSocialBalanceInsight(groupId: string, requesterId: string): Promise<BalanceInsight> {
  const requester = await prisma.user.findUnique({ where: { id: requesterId } })
  if (requester?.optOutNudges) {
    return { suggestedPayerId: null, message: '' }
  }

  // 1. Fetch group members (to know the baseline)
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: { include: { user: true } } }
  })

  if (!group || group.members.length < 2) {
    return { suggestedPayerId: null, message: '' }
  }

  // 2. Fetch the current equilibrium metrics
  const metrics = await prisma.intel_SocialEquilibrium.findMany({
    where: { groupId }
  })

  if (metrics.length === 0) {
    return { suggestedPayerId: null, message: '' }
  }

  let totalLiquidity = 0
  let totalInitiation = 0

  for (const m of metrics) {
    totalLiquidity += Number(m.rollingLiquidityBurden)
    totalInitiation += m.rollingInitiationCount
  }

  // Confidence Check: Too little data
  if (totalInitiation < 5) {
    return { suggestedPayerId: null, message: '' }
  }

  // Find the anchor (the one carrying the highest burden)
  let anchorPayerId: string | null = null
  let maxLiquidityShare = 0

  for (const m of metrics) {
    const share = Number(m.rollingLiquidityBurden) / totalLiquidity
    if (share > 0.6) { // If one person is paying > 60% of the total liquidity in the group
      anchorPayerId = m.userId
      maxLiquidityShare = share
    }
  }

  if (anchorPayerId) {
    if ((group as any).designatedPayerId === anchorPayerId) {
      // If the anchor is the designated payer (e.g. corporate card), suppress the nudge.
      return { suggestedPayerId: null, message: '' }
    }

    const anchorMember = group.members.find((m: any) => m.userId === anchorPayerId)
    if (anchorMember) {
      return {
        suggestedPayerId: null, // We never force assign, but we provide an insight
        message: `${anchorMember.user.name} has covered several recent expenses. Picking up this one may help balance the group.`
      }
    }
  }

  return { suggestedPayerId: null, message: '' }
}
