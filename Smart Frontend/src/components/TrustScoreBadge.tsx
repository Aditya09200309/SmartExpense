import { useUserIntelligence } from '../hooks/useIntelligence'
import { features } from '../lib/features'

export default function TrustScoreBadge({ userId }: { userId: string }) {
  const data = useUserIntelligence(userId)

  if (!features.ENABLE_INTELLIGENCE_UI || !features.ENABLE_TRUST_SCORES) return null
  if (!data) return null

  const { trustScore, dominantTrait } = data

  let color = 'bg-slate-50 text-slate-600 border-slate-200/60'
  let label = 'Unknown'
  let icon = '•'
  let tooltip = `Reliability: ${trustScore}\nBased on payment consistency.`

  if (dominantTrait === 'LIGHTNING_SETTLER') {
    color = 'bg-slate-50 text-violet-700 border-violet-100'
    label = 'Fast Settler'
    icon = '⚡'
    tooltip = 'Usually settles within 24h. Highly reliable.'
  } else if (dominantTrait === 'ANCHOR_CONTRIBUTOR') {
    color = 'bg-slate-50 text-blue-700 border-blue-100'
    label = 'Group Supporter'
    icon = '⚓'
    tooltip = 'Frequently covers group expenses. Balances the load.'
  } else if (dominantTrait === 'RELIABLE_CONTRIBUTOR') {
    color = 'bg-slate-50 text-emerald-700 border-emerald-100'
    label = 'Reliable'
    icon = '✓'
    tooltip = 'Consistent and reliable contributor.'
  } else if (trustScore >= 95) {
    color = 'bg-slate-50 text-emerald-700 border-emerald-100'
    label = 'Highly Reliable'
    icon = '✓'
  } else if (trustScore >= 80) {
    color = 'bg-slate-50 text-blue-700 border-blue-100'
    label = 'Reliable'
    icon = '✓'
  } else {
    // We do not show negative badges (Slow Payer / Unreliable) to preserve emotional safety.
    return null
  }

  return (
    <span
      className={`group relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm select-none cursor-help transition-colors hover:brightness-95 ${color}`}
    >
      <span aria-hidden>{icon}</span> {label}
      
      {/* Explainability Tooltip */}
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-normal normal-case text-white opacity-0 transition-opacity group-hover:opacity-100 z-10">
        {tooltip}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </span>
    </span>
  )
}
