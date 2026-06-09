import { useState } from 'react'
import { features } from '../lib/features'
import { useUserIntelligence } from '../hooks/useIntelligence'
import { api } from '../api/client'

interface Props {
  userId: string
}

interface LongitudinalStat {
  periodStart: string
  avgTimeToSettle: number
  totalContribution: number
}

export default function ProUpsellBanner({ userId }: Props) {
  const data = useUserIntelligence(userId)
  const [dismissed, setDismissed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [stats, setStats] = useState<LongitudinalStat[]>([])
  const [loading, setLoading] = useState(false)

  // Only show the upsell if enabled, not dismissed, and the user has a high trust score (positive reinforcement)
  if (!features.ENABLE_PRO_UPSELLS || dismissed || !data || data.trustScore < 95) {
    return null
  }

  const handleViewHistory = async () => {
    setModalOpen(true)
    setLoading(true)
    try {
      const res = await api.get<LongitudinalStat[]>(`/intelligence/users/${userId}/longitudinal`)
      setStats(res.data)
    } catch (err) {
      console.warn('[ProUpsellBanner] Failed to fetch user longitudinal stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatPeriod = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm relative">
        <button 
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors z-10"
          aria-label="Dismiss banner"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="text-2xl shrink-0 mt-0.5" aria-hidden="true">🌱</div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-0.5">
                Consistent Reliability
              </h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed max-w-lg">
                Your payment consistency is excellent. View your relationship history and advanced reliability metrics with <span className="font-semibold text-slate-700">Smart Expense Pro</span>.
              </p>
            </div>
          </div>
          <button 
            onClick={handleViewHistory}
            className="shrink-0 bg-slate-100 text-slate-700 font-medium px-4 py-2 rounded-xl text-[13px] hover:bg-slate-200 transition-colors active:scale-95 whitespace-nowrap"
          >
            View History
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl max-w-lg w-full overflow-hidden transform transition-all p-6 relative">
            <button 
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close modal"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl">✨</span>
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                  PRO FEATURE
                </span>
                <h3 className="text-lg font-bold text-slate-800 mt-1">
                  Reliability Longitudinal History
                </h3>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 mb-6 leading-relaxed">
              Analyze your long-term payment behavior and trust trends. Consistent payments lower outstanding friction and earn top group recognition.
            </p>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-8 h-8 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin"></div>
                <span className="text-xs font-semibold text-slate-400">Loading reliability stats...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 text-center pb-2 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <div>Period</div>
                  <div>Avg Settle Time</div>
                  <div>Contributions</div>
                </div>

                {stats.length > 0 ? (
                  stats.map((stat, idx) => (
                    <div 
                      key={idx} 
                      className="grid grid-cols-3 text-center py-3.5 rounded-xl text-xs font-medium text-slate-600 border border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="font-semibold text-slate-700">
                        {formatPeriod(stat.periodStart)}
                      </div>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-[13px]">⏱️</span>
                        <span>{stat.avgTimeToSettle}h</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-emerald-600 font-semibold">
                        <span>€{(stat.totalContribution).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-xs text-slate-400 py-6">No historical data available.</p>
                )}

                {/* Positive reinforcement indicator */}
                <div className="mt-6 p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100/40 flex items-start gap-3">
                  <span className="text-lg">📈</span>
                  <p className="text-[11px] font-medium leading-relaxed text-emerald-800">
                    Excellent progress! Your average settlement speed has improved by <strong className="font-semibold">75%</strong> over the past 3 months. Maintain this to keep your 95+ trust score!
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold py-3 px-4 rounded-2xl text-xs shadow-md shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-[0.99] transition-all"
                  >
                    Unlock Lifetime Pro Access
                  </button>
                  <button 
                    onClick={() => setModalOpen(false)}
                    className="w-full bg-slate-50 text-slate-500 font-semibold py-3 px-4 rounded-2xl text-xs hover:bg-slate-100 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

