import prisma from '../../lib/prisma'
import { ExpenseAddedEvent, SettlementRecordedEvent } from '../../lib/events.types'
import { analyticsEngine } from './analytics.engine'
import { updateGroupSocialEquilibrium } from './socialBalance.engine'

async function handleExpenseAdded(event: ExpenseAddedEvent) {
  try {
    const { groupId } = event.data

    // We do NOT query the core ledger for transactional logic.
    // We only read historical aggregates to update Intel_* tables.
    
    // For Phase 1, we can compute fairness index based on total paid so far
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      select: { paidById: true, amount: true }
    })

    const totalVolume = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
    
    // Group by user
    const paymentsByUser = new Map<string, number>()
    for (const e of expenses) {
      paymentsByUser.set(e.paidById, (paymentsByUser.get(e.paidById) ?? 0) + Number(e.amount))
    }

    const fairnessIndex = analyticsEngine.computeFairnessIndex(
      Array.from(paymentsByUser.values()),
      totalVolume
    )

    // Update group health
    const existingHealth = await prisma.intel_GroupHealth.findUnique({ where: { groupId } })
    const staleDebtVolume = Number(existingHealth?.staleDebtVolume ?? 0)
    
    const healthScore = analyticsEngine.computeGroupHealth(staleDebtVolume, totalVolume, fairnessIndex)

    await prisma.intel_GroupHealth.upsert({
      where: { groupId },
      update: {
        healthScore,
        fairnessIndex,
        lastCalculatedAt: new Date()
      },
      create: {
        groupId,
        healthScore,
        fairnessIndex,
        staleDebtVolume: 0
      }
    })

    // Phase A: Social Balance Intelligence - Update upfront burden
    await updateGroupSocialEquilibrium(groupId)

  } catch (error) {
    console.error('[Intelligence] Error handling ExpenseAdded:', error)
  }
}

async function handleSettlementRecorded(event: SettlementRecordedEvent) {
  try {
    const { payerId, amount } = event.data

    // Find the payer's behavior record
    let behavior = await prisma.intel_UserBehavior.findUnique({ where: { userId: payerId } })
    
    if (!behavior) {
      behavior = {
        userId: payerId,
        trustScore: 100,
        avgTimeToSettleHours: 0,
        totalDelayedPayments: 0,
        lastCalculatedAt: new Date()
      }
    }

    // In a full implementation, we'd find the time difference between the debt creation and now.
    // For this Phase 1, we simulate a slight improvement on settlement.
    // (If they had delayed payments, it stays, but settling helps.)
    const newTrustScore = analyticsEngine.computeTrustScore(
      Math.max(0, behavior.avgTimeToSettleHours - 1), // slightly faster avg
      behavior.totalDelayedPayments
    )

    await prisma.intel_UserBehavior.upsert({
      where: { userId: payerId },
      update: {
        trustScore: newTrustScore,
        lastCalculatedAt: new Date()
      },
      create: {
        userId: payerId,
        trustScore: newTrustScore,
        avgTimeToSettleHours: 0,
        totalDelayedPayments: 0
      }
    })

    // Phase 2: Compute Personality Trait
    const sampleSize = await prisma.settlement.count({ where: { payerId } })
    // We pass 0 for fairness index as proxy here, full implementation would query user's group fairness.
    const traitResult = analyticsEngine.computePersonalityTrait(
      behavior.avgTimeToSettleHours,
      behavior.totalDelayedPayments,
      0, 
      sampleSize
    )

    if (traitResult) {
      await prisma.intel_UserPersonality.upsert({
        where: { userId: payerId },
        update: {
          dominantTrait: traitResult.trait,
          traitConfidence: traitResult.confidence,
          lastEvaluatedAt: new Date()
        },
        create: {
          userId: payerId,
          dominantTrait: traitResult.trait,
          traitConfidence: traitResult.confidence
        }
      })
    }

  } catch (error) {
    console.error('[Intelligence] Error handling SettlementRecorded:', error)
  }
}

export const eventHandlers = {
  handleExpenseAdded,
  handleSettlementRecorded
}
