import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GlobalNetBalance } from '../hooks/useGlobalBalance';

interface Props {
  globalNets: GlobalNetBalance[];
  loading: boolean;
}

export default function GlobalOptimizerCard({ globalNets, loading }: Props) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-pulse">
        <div className="mb-3 h-5 w-48 rounded bg-slate-200" />
        <div className="h-4 w-3/4 rounded bg-slate-100 mb-2" />
        <div className="h-4 w-1/2 rounded bg-slate-100" />
      </div>
    );
  }

  // Filter out cases where netAmount is 0 (already handled by service, but double-check)
  const activeNets = globalNets.filter(net => Math.abs(net.netAmount) >= 0.01);

  if (activeNets.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5 shadow-sm flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-lg" aria-hidden>
          ✨
        </div>
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">Netted Ledger Clean</h3>
          <p className="mt-0.5 text-xs text-emerald-700/80">
            No cross-group netting needed. All your shared balances are already optimal.
          </p>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number, cur: string) => {
    const symbolMap: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    const sym = symbolMap[cur] || cur;
    return `${sym}${Math.abs(val).toFixed(2)}`;
  };

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800">
          Global Debt Optimizer
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Cross-group balances netted at live exchange rates — one payment clears multiple groups.
        </p>
      </div>

      <div className="space-y-4">
        {activeNets.map(net => {
          const isOwed = net.netAmount > 0;
          const isExpanded = expandedId === net.userId;

          return (
            <div key={net.userId} className="rounded-2xl border border-slate-100 bg-white/80 p-4 hover:border-violet-200 transition-all duration-200">
              <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${isOwed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {net.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-slate-800">
                        {isOwed ? `Collect from ${net.userName}` : `Pay ${net.userName}`}
                      </p>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : net.userId)}
                        className="text-[11px] font-medium text-violet-600 hover:text-violet-800 transition-colors flex items-center gap-0.5 mt-0.5"
                      >
                        {isExpanded ? 'Hide dynamic breakdown' : 'Show exchange rate math ⚡'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-base font-bold tabular-nums ${isOwed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(net.netAmount, net.currency)}
                  </span>
                  {!isOwed && (
                    <button
                      onClick={() => navigate('/settle-up', {
                        state: {
                          isGlobal: true,
                          receiverId: net.userId,
                          receiverName: net.userName,
                          netAmount: Math.abs(net.netAmount),
                          currency: net.currency,
                          breakdown: net.breakdown
                        }
                      })}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 active:scale-95 transition-all rounded-xl shadow-sm hover:shadow"
                    >
                      Settle All
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2.5 animate-fade-in">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Live Netting Ledger Math</p>
                  
                  {net.breakdown.map((item, idx) => {
                    const itemIsOwed = item.originalAmount > 0;
                    return (
                      <div key={idx} className="flex justify-between items-center text-xs p-2 rounded-xl bg-slate-50/50">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-700 truncate block">{item.groupName}</span>
                          <span className="text-[10px] text-slate-400">
                            {formatCurrency(item.originalAmount, item.originalCurrency)} in {item.originalCurrency}
                            {item.originalCurrency !== net.currency && ` × ${item.exchangeRate.toFixed(4)} (FX factor)`}
                          </span>
                        </div>
                        <span className={`font-bold tabular-nums shrink-0 ${itemIsOwed ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {itemIsOwed ? '+' : '-'}{formatCurrency(item.convertedAmount, net.currency)}
                        </span>
                      </div>
                    );
                  })}
                  
                  <div className="flex justify-between items-center text-xs p-2 border-t border-slate-100 font-bold">
                    <span className="text-slate-600">Total Net Amount ({net.currency})</span>
                    <span className={isOwed ? 'text-emerald-600' : 'text-rose-600'}>
                      {isOwed ? '+' : '-'}{formatCurrency(net.netAmount, net.currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
