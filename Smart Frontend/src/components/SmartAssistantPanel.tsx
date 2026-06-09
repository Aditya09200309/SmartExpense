import { useState } from 'react';
import type { OptimizedPlanItem, SmartSettlementResult } from '../hooks/useSmartSettlement';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency, getDisplayStrategy } from '../lib/smartSettlementPresentation';
import { useAICoordinator } from '../hooks/useAICoordinator';

interface Props {
  result: SmartSettlementResult;
}

export default function SmartAssistantPanel({ result }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const {
    loading,
    optimizedPlan,
    youOweDebts,
    owedToYouDebts,
    totalOwedToYou,
  } = result;

  const hasOwed = youOweDebts.length > 0;
  const hasIncoming = owedToYouDebts.length > 0;
  const visiblePlan = showAll ? optimizedPlan : optimizedPlan.slice(0, 3);
  const owedToYouCount = new Set(owedToYouDebts.map(d => d.fromUserId)).size;
  const displayStrategy = getDisplayStrategy(result);
  const { explanation, trait } = useAICoordinator(result);

  function toggleExpand(userId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-pulse">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-slate-200 shrink-0" />
          <div className="h-3 w-40 rounded bg-slate-200" />
        </div>
        <div className="mb-1 h-4 w-2/3 rounded bg-slate-100" />
        <div className="mb-5 h-3 w-1/3 rounded bg-slate-100" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center justify-between border-t border-slate-50 py-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-slate-100 shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-slate-200" />
                <div className="h-2.5 w-16 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-7 w-20 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-200/70 px-4 py-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Settlement Overview</span>
          </div>
          {displayStrategy && trait && (
            <div>
              {trait === 'ANCHOR_CONTRIBUTOR' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 select-none">
                  ⚓ Anchor Contributor
                </span>
              )}
              {trait === 'LIGHTNING_SETTLER' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 select-none">
                  ⚡ Lightning Settler
                </span>
              )}
              {trait === 'RELIABLE_CONTRIBUTOR' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 select-none">
                  🌱 Reliable Contributor
                </span>
              )}
            </div>
          )}
        </div>

        {displayStrategy ? (
          <p className="text-sm font-medium leading-6 text-slate-700">{explanation}</p>
        ) : !hasOwed ? (
          <div>
            <p className="text-sm font-semibold text-emerald-800">You're all settled</p>
            {hasIncoming ? (
              <p className="mt-1 text-xs text-emerald-700">
                {owedToYouCount} {owedToYouCount === 1 ? 'person still owes' : 'people still owe'} you{' '}
                <span className="font-semibold tabular-nums">{formatSettlementCurrency(totalOwedToYou)}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-emerald-600">No outstanding debts anywhere.</p>
            )}
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-600">Review the balance breakdown below.</p>
        )}
      </div>

      {optimizedPlan.length > 0 && (
        <div className="px-4 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">You owe</p>
          {visiblePlan.map((item: OptimizedPlanItem, i: number) => {
            const isMulti = item.debts.length > 1;
            const expanded = expandedIds.has(item.toUserId);

            return (
              <div key={item.toUserId} className={i > 0 ? 'border-t border-slate-50' : ''}>
                <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-slate-50">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 shrink-0 select-none">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Balance with {normalizeDisplayName(item.toUserName)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span>{isMulti ? `${item.debts.length} groups · settle each separately` : `(${item.debts[0].groupName})`}</span>
                      {item.hasReciprocal && (
                        <>
                          <span className="text-slate-300" aria-hidden>•</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100/60 select-none relative group cursor-help shrink-0">
                            <span>Reciprocal</span>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none whitespace-normal text-left font-normal leading-normal">
                              You owe each other across different groups. Tap to view the breakdown below.
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" aria-hidden />
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-base font-bold tabular-nums text-rose-600">
                      {formatSettlementCurrency(item.totalAmount)}
                    </span>
                    {isMulti && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.toUserId)}
                        aria-expanded={expanded}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all duration-150 hover:bg-slate-100"
                      >
                        <svg
                          className={`h-3.5 w-3.5 transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {isMulti && (
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <div className={`space-y-0.5 pb-2 pl-9 pr-2 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                        {item.debts.map(debt => (
                          <div key={debt.groupId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{debt.groupName}</span>
                            <span className="shrink-0 text-xs font-bold tabular-nums text-rose-600">
                              {formatSettlementCurrency(debt.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {optimizedPlan.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(s => !s)}
              className="mt-1 w-full border-t border-slate-50 pt-2.5 pb-0.5 text-center text-xs font-medium text-slate-400 transition-colors duration-150 hover:text-violet-600"
            >
              {showAll ? 'Show less' : `Show all ${optimizedPlan.length} balances`}
            </button>
          )}
        </div>
      )}

      {hasIncoming && (
        <div className={`bg-white/80 px-4 py-2.5 ${hasOwed ? 'border-t border-slate-100' : ''}`}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">People who owe you</p>
          {owedToYouDebts.slice(0, 3).map((debt, i) => (
            <div
              key={`${debt.groupId}-${debt.fromUserId}`}
              className={`flex items-center gap-3 rounded-xl px-2 py-2.5 ${i > 0 ? 'border-t border-slate-50' : ''}`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 shrink-0 select-none">
                {normalizeDisplayName(debt.fromUserName).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex flex-1 items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{normalizeDisplayName(debt.fromUserName)}</p>
                <span className="text-sm text-slate-300" aria-hidden>&mdash;</span>
              </div>
              <span className="shrink-0 text-base font-bold tabular-nums text-emerald-600">
                {formatSettlementCurrency(debt.amount)}
              </span>
            </div>
          ))}

          {owedToYouDebts.length > 3 && (
            <p className="mt-1 border-t border-slate-50 pt-2.5 text-center text-xs text-slate-400">
              +{owedToYouDebts.length - 3} more, see individual group cards below
            </p>
          )}
        </div>
      )}
    </div>
  );
}
