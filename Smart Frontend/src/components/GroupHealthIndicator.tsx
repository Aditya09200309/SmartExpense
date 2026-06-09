import { useGroupIntelligence } from '../hooks/useIntelligence'
import { features } from '../lib/features'

export default function GroupHealthIndicator({ groupId }: { groupId: string }) {
  const data = useGroupIntelligence(groupId)

  if (!features.ENABLE_INTELLIGENCE_UI || !features.ENABLE_GROUP_HEALTH) return null
  if (!data) return null

  const { healthScore } = data

  let color = 'bg-slate-100 text-slate-600 border-slate-200'
  let icon = '•'

  if (healthScore >= 90) {
    color = 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
    icon = '💖'
  } else if (healthScore >= 70) {
    color = 'bg-blue-50 text-blue-700 border-blue-200/80'
    icon = '💚'
  } else if (healthScore >= 50) {
    color = 'bg-amber-50 text-amber-700 border-amber-200/80'
    icon = '💛'
  } else {
    color = 'bg-rose-50 text-rose-700 border-rose-200/80'
    icon = '💔'
  }

  return (
    <span
      className={`group relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide shadow-sm select-none cursor-help transition-colors hover:brightness-95 ${color}`}
    >
      <span aria-hidden>{icon}</span> Health: {healthScore}%
      
      {/* Explainability Tooltip */}
      <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 transition-opacity group-hover:opacity-100 z-10 text-center">
        Group Health: {healthScore}%<br />
        <span className="text-[9px] text-slate-300">Based on velocity & fairness</span>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </span>
    </span>
  )
}
