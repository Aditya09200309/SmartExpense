import { useUserIntelligence } from './useIntelligence'
import { getDisplayStrategy } from '../lib/smartSettlementPresentation'
import type { SmartSettlementResult } from './useSmartSettlement'

export function useAICoordinator(result: SmartSettlementResult) {
  const displayStrategy = getDisplayStrategy(result)
  
  // We need to fetch the intelligence of the person we are interacting with
  const targetUserId = displayStrategy?.strategy.type === 'pay' 
    ? displayStrategy.strategy.debt.toUserId 
    : displayStrategy?.strategy.debt.fromUserId
    
  const intel = useUserIntelligence(targetUserId)

  if (!displayStrategy) return { explanation: '' }

  const { personName, strategy } = displayStrategy
  const isPay = strategy.type === 'pay'

  let baseSentence = isPay
    ? `Paying ${personName} settles your ${displayStrategy.strategy.debt.groupName} ledger first.`
    : `Collecting from ${personName} settles your ${displayStrategy.strategy.debt.groupName} ledger first.`

  if (intel?.dominantTrait) {
    if (intel.dominantTrait === 'ANCHOR_CONTRIBUTOR') {
      baseSentence = isPay
        ? `Paying ${personName} settles this fastest. They’ve been covering a lot recently, so it’s a nice time to balance the load!`
        : `Collecting from ${personName} helps balance the load, since they cover many expenses.`
    } else if (intel.dominantTrait === 'LIGHTNING_SETTLER') {
      baseSentence = isPay
        ? `Paying ${personName} clears your balance quickly. They usually settle fast, so expect a quick confirmation!`
        : `Collecting from ${personName} is a good idea. They generally resolve requests within a day.`
    } else if (intel.dominantTrait === 'RELIABLE_CONTRIBUTOR') {
      baseSentence = isPay
        ? `Paying ${personName} clears this up quickly.`
        : `Collecting from ${personName} clears this up.`
    }
  }

  return { explanation: baseSentence, trait: intel?.dominantTrait }
}
