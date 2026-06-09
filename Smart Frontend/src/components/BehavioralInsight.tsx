import { useUserIntelligence } from '../hooks/useIntelligence'
import { features } from '../lib/features'
import { useState } from 'react'

interface Props {
  userId: string
}

export default function BehavioralInsight({ userId }: Props) {
  const data = useUserIntelligence(userId)
  const [dismissed, setDismissed] = useState(false)

  if (!features.ENABLE_INTELLIGENCE_UI || dismissed || !data) return null
  if (!data.dominantTrait) return null

  // We only show positive nudges or gentle observations
  let title = ''
  let message = ''
  let icon = ''
  let toneClass = ''

  if (data.dominantTrait === 'ANCHOR_CONTRIBUTOR') {
    title = 'Fairness Insight'
    message = 'You have been covering most bills recently. Consider letting others pick up the next one to balance the load.'
    icon = '⚖️'
    toneClass = 'bg-slate-50 border-slate-200/60 text-slate-700'
  } else if (data.dominantTrait === 'LIGHTNING_SETTLER') {
    title = 'Reliability Insight'
    message = 'Your settlement speed is excellent. You typically settle debts within 24 hours.'
    icon = '⚡'
    toneClass = 'bg-slate-50 border-slate-200/60 text-slate-700'
  } else if (data.trustScore < 80) {
    // Only show private "aging debt" or "slow payer" nudges to the user themselves
    title = 'Action Insight'
    message = 'This balance is older than usual. Resolving it early keeps the group healthy.'
    icon = '🌱'
    toneClass = 'bg-slate-50 border-slate-200/60 text-slate-700'
  } else {
    return null
  }

  return (
    <div className={`mb-6 rounded-2xl border p-4 shadow-sm transition-all relative ${toneClass}`}>
      <button 
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-current opacity-40 hover:opacity-100 transition-opacity"
        aria-label="Dismiss insight"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex items-start gap-3">
        <div className="text-xl shrink-0 mt-0.5" aria-hidden="true">{icon}</div>
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-1">{title}</h4>
          <p className="text-sm font-medium leading-relaxed opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}
