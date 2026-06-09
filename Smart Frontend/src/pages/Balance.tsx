import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { onInvalidate } from '../lib/invalidate';
import { useGroups } from '../hooks/useGroups';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { BalanceRouteState, DashboardActionContext, SettleUpRouteState } from '../lib/actionContext';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency } from '../lib/smartSettlementPresentation';

interface NetBalance {
  userId: string;
  name: string;
  email: string;
  netBalance: number;
}

interface SimplifiedDebt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

interface RawDebt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

interface ActivityEvent {
  type: 'expense' | 'settlement';
  userName: string;
  receiverName?: string;
  description?: string;
  amount: number;
  date: string;
}

interface BalanceResponse {
  netBalances: NetBalance[];
  simplifiedDebts: SimplifiedDebt[];
  rawDebts: RawDebt[];
  totalExpenses: number;
  totalSettled: number;
  activity: ActivityEvent[];
}

type DebtView = 'raw' | 'optimized';

function formatSignedSettlementCurrency(amount: number): string {
  if (amount === 0) return formatSettlementCurrency(0);
  return `${amount > 0 ? '+' : '-'}${formatSettlementCurrency(Math.abs(amount))}`;
}

function matchesActionContextDebt(
  debt: RawDebt | SimplifiedDebt,
  actionContext: DashboardActionContext,
  currentUserId: string | undefined
): boolean {
  if (!currentUserId) return false;
  if (actionContext.type === 'request-sent') {
    return debt.fromUserId === actionContext.personId && debt.toUserId === currentUserId;
  }

  return debt.fromUserId === currentUserId && debt.toUserId === actionContext.personId;
}

export default function Balance() {
  useDocumentTitle('Balance');
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useCurrentUser();
  const { groups, loading: groupsLoading, error: groupsError } = useGroups();
  const debtSectionRef = useRef<HTMLDivElement | null>(null);
  const [groupId, setGroupId] = useState<string>(() => {
    const state = location.state as BalanceRouteState | null;
    return state?.groupId ?? '';
  });
  const [actionContext, setActionContext] = useState<DashboardActionContext | null>(() => {
    const state = location.state as BalanceRouteState | null;
    return state?.actionContext ?? null;
  });
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [balanceKey, setBalanceKey] = useState(0);
  const [debtView, setDebtView] = useState<DebtView>(() => {
    const state = location.state as BalanceRouteState | null;
    if (state?.actionContext?.type === 'request-sent') return 'raw';
    if (state?.actionContext?.type === 'settled') return 'optimized';
    return 'raw';
  });
  const [isGroupLocked, setIsGroupLocked] = useState(() => {
    const state = location.state as BalanceRouteState | null;
    return state?.actionContext?.type === 'request-sent' ? state.actionContext.lockGroup : false;
  });

  useEffect(() => {
    if (!groupId) return;
    return onInvalidate(({ resource, groupId: changedGroupId }) => {
      if (
        resource === 'balances' &&
        (!changedGroupId || changedGroupId === groupId)
      ) {
        setBalanceKey(k => k + 1);
      }
    });
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setApiError('');
      try {
        const res = await api.get<BalanceResponse>(`/groups/${groupId}/balances`, { signal: controller.signal });
        setData(res.data);
        setLoading(false);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'CanceledError') return;
        if (
          typeof err === 'object' && err !== null && 'response' in err &&
          typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
        ) {
          setApiError((err as { response: { data: { error: string } } }).response.data.error);
        } else {
          setApiError('Something went wrong. Please try again.');
        }
        setLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [groupId, balanceKey]);

  useEffect(() => {
    const state = location.state as BalanceRouteState | null;

    if (state?.groupId) {
      setGroupId(state.groupId);
    }

    if (state?.actionContext) {
      setActionContext(state.actionContext);
      setDebtView(state.actionContext.type === 'request-sent' ? 'raw' : 'optimized');
      setIsGroupLocked(state.actionContext.type === 'request-sent' ? state.actionContext.lockGroup : false);
      return;
    }

    setActionContext(null);
    setIsGroupLocked(false);
  }, [location.key, location.state]);

  const selectCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';
  const displayData = groupId ? data : null;

  // Derived reconciliation values for current user
  const myNetBalance = (displayData?.netBalances ?? []).find(b => b.userId === currentUser?.id)?.netBalance ?? 0;
  const myRawOut = (displayData?.rawDebts ?? []).filter(d => d.fromUserId === currentUser?.id).reduce((s, d) => s + d.amount, 0) ?? 0;
  const myOptOut = (displayData?.simplifiedDebts ?? []).filter(d => d.fromUserId === currentUser?.id).reduce((s, d) => s + d.amount, 0) ?? 0;
  const viewsInSync = Math.abs(myRawOut - myOptOut) < 0.01;

  const activeDebts: (RawDebt | SimplifiedDebt)[] = displayData
    ? (debtView === 'raw' ? (displayData.rawDebts ?? []) : (displayData.simplifiedDebts ?? []))
    : [];
  const highlightedDebtVisible = !!(
    actionContext &&
    currentUser?.id &&
    activeDebts.some(debt => matchesActionContextDebt(debt, actionContext, currentUser.id))
  );
  const actionBannerTone = actionContext?.type === 'request-sent'
    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-900'
    : 'border-violet-200/80 bg-violet-50 text-violet-950';

  useEffect(() => {
    if (!actionContext || loading || !displayData || !debtSectionRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      debtSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [actionContext, loading, displayData, debtView]);

  function handleGroupChange(nextGroupId: string) {
    setGroupId(nextGroupId);
    setActionContext(null);
    setIsGroupLocked(false);
  }

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-bold tracking-tight text-white">Balance</h1>
          <p className="mt-2 text-sm text-slate-400">See who owes what and the fastest path to settled.</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {actionContext && (
          <div role="status" className={`mb-5 rounded-2xl border px-4 py-4 shadow-sm ${actionBannerTone}`}>
            <p className="text-sm font-semibold">
              {actionContext.type === 'request-sent'
                ? `Request sent to ${actionContext.personName ?? 'User'} for ${formatSettlementCurrency(actionContext.amount ?? 0)}.`
                : `Settled with ${actionContext.personName ?? 'User'} for ${formatSettlementCurrency(actionContext.amount ?? 0)}.`}
            </p>
            <p className="mt-1 text-xs">
              {actionContext.type === 'request-sent'
                ? 'What changed: this group is focused for you and the related debt is highlighted below.'
                : 'What changed: this group is preselected and the updated debt section is in focus.'}
            </p>
            <p className="mt-1 text-xs">
              {actionContext.type === 'request-sent'
                ? 'What next: wait for payment or mark it as paid manually.'
                : 'What next: review the refreshed balance, or continue to another group when you are done.'}
            </p>
            {!loading && displayData && !highlightedDebtVisible && (
              <p className="mt-2 text-xs opacity-80">
                {actionContext.type === 'request-sent'
                  ? 'The highlighted debt will appear once the matching row is visible in the current view.'
                  : 'The matching debt no longer appears here, which usually means the payment has already been reflected.'}
              </p>
            )}
          </div>
        )}

        <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <div>
              <label htmlFor="groupId" className="block text-sm font-medium text-slate-700">Group</label>
              {isGroupLocked && actionContext && (
                <p className="mt-1 text-xs text-slate-500">
                  Locked to {actionContext.groupName} while you review this action.
                </p>
              )}
            </div>
            {isGroupLocked && (
              <button
                type="button"
                onClick={() => setIsGroupLocked(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
              >
                Change group
              </button>
            )}
          </div>
          {groupsError ? (
            <p role="alert" className="text-sm text-rose-600">{groupsError}</p>
          ) : (
            <select
              id="groupId"
              value={groupId}
              onChange={e => handleGroupChange(e.target.value)}
              disabled={groupsLoading || isGroupLocked}
              className={selectCls}
            >
              <option value="">{groupsLoading ? 'Loading groups...' : 'Select a group'}</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          )}
        </div>

        {loading && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-pulse">
              <div className="mb-4 h-4 w-1/3 rounded bg-slate-200" />
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between border-b border-slate-50 py-3 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-slate-200" />
                    <div className="h-3 w-24 rounded bg-slate-100" />
                  </div>
                  <div className="h-4 w-20 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        )}

        {apiError && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {apiError}
          </div>
        )}

        {!loading && displayData && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Net Balances</h2>
              </div>
              {(!displayData?.netBalances || displayData.netBalances.length === 0) ? (
                <p className="px-5 py-5 text-sm text-slate-400">No balances found.</p>
              ) : (
                <ul className="divide-y divide-slate-50 px-5">
                  {displayData.netBalances.map(entry => (
                    <li key={entry.userId} className="flex items-center justify-between py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 shrink-0 select-none">
                          {(entry.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-slate-800">{normalizeDisplayName(entry.name || 'User')}</span>
                          {entry.userId === currentUser?.id && (
                            <span className="ml-1.5 text-xs text-slate-400">(you)</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-base font-bold tabular-nums ${
                        (entry.netBalance ?? 0) > 0 ? 'text-emerald-600' :
                        (entry.netBalance ?? 0) < 0 ? 'text-rose-600' :
                        'text-slate-400'
                      }`}>
                        {formatSignedSettlementCurrency(entry.netBalance ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div ref={debtSectionRef} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Who Owes Whom</h2>
                <div className="flex items-center gap-0.5 rounded-lg bg-slate-200/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDebtView('raw')}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-all duration-150 ${
                      debtView === 'raw'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Direct
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtView('optimized')}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-all duration-150 ${
                      debtView === 'optimized'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Optimized
                  </button>
                </div>
              </div>

              <div className="px-5 pb-1 pt-4">
                {debtView === 'raw' ? (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                    <svg className="mt-0.5 h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-xs leading-relaxed text-slate-500">
                      <span className="font-semibold text-slate-600">Direct obligations from each expense.</span>
                      {' '}No payment is rerouted. Switch to{' '}
                      <button
                        type="button"
                        onClick={() => setDebtView('optimized')}
                        className="font-semibold text-violet-600 hover:underline"
                      >
                        Optimized
                      </button>
                      {' '}to settle debts.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3.5 py-2.5">
                    <svg className="mt-0.5 h-3.5 w-3.5 text-violet-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <p className="text-xs leading-relaxed text-slate-500">
                      <span className="font-semibold text-violet-700">Reduces number of payments</span>
                      {' '}by combining balances. Payment amounts may differ from the Direct view - both reflect the same net position.
                    </p>
                  </div>
                )}
              </div>

              {activeDebts.length === 0 ? (
                <div className="flex items-center gap-2.5 px-5 py-5 text-sm text-emerald-700">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 shrink-0">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="font-semibold">Settled in this group</span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-50 px-5 pt-2">
                  {activeDebts.map((debt, index) => {
                    const isFromMe = debt.fromUserId === currentUser?.id;
                    const isToMe = debt.toUserId === currentUser?.id;
                    const isHighlighted = !!(
                      actionContext &&
                      currentUser?.id &&
                      matchesActionContextDebt(debt, actionContext, currentUser.id)
                    );
                    return (
                      <li
                        key={`${debt.fromUserId}-${debt.toUserId}-${debt.amount}-${index}`}
                        className={`flex items-center justify-between gap-4 py-3.5 transition-colors duration-150 ${
                          isHighlighted ? 'rounded-xl bg-amber-50/80 px-3 ring-1 ring-amber-200' : ''
                        }`}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className={`text-sm font-semibold ${isFromMe ? 'text-rose-600' : 'text-slate-700'}`}>
                            {isFromMe ? 'You' : normalizeDisplayName(debt.fromUserName || 'User')}
                          </span>
                          <span className="select-none text-sm text-slate-300" aria-hidden>→</span>
                          <span className={`text-sm font-semibold ${isToMe ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {isToMe ? 'you' : normalizeDisplayName(debt.toUserName || 'User')}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-base font-bold tabular-nums text-slate-900">
                            {formatSettlementCurrency(debt.amount)}
                          </span>
                          {/* Settle only available in optimized view - raw debts may not map 1:1 to settleable paths */}
                          {debtView === 'optimized' && isFromMe && (
                            <button
                              type="button"
                              onClick={() => {
                                const settleUpState: SettleUpRouteState = {
                                  groupId,
                                  groupName: groups.find(group => group.id === groupId)?.name,
                                  receiverId: debt.toUserId,
                                  amount: debt.amount.toFixed(2),
                                  source: 'balance',
                                };
                                navigate('/settle-up', { state: settleUpState });
                              }}
                              className="rounded-lg border border-violet-200 px-2.5 py-1 text-xs font-semibold text-violet-600 transition-all hover:bg-violet-50 hover:text-violet-800"
                            >
                              Pay now
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {(myNetBalance !== 0 || activeDebts.length > 0) && (
                <div className={`mx-5 mb-4 mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 ${
                  viewsInSync ? 'border border-emerald-100 bg-emerald-50' : 'border border-amber-200 bg-amber-50'
                }`}>
                  {viewsInSync ? (
                    <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                    </svg>
                  )}
                  <span className={`flex-1 text-xs ${viewsInSync ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {viewsInSync
                      ? 'Direct and Optimized views reflect the same net position'
                      : 'Views appear out of sync - please report this'}
                  </span>
                  {myNetBalance !== 0 && (
                    <span className={`shrink-0 text-xs font-bold tabular-nums ${myNetBalance > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      Your net: {formatSignedSettlementCurrency(myNetBalance)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && data && data.totalExpenses > 0 && (
          <div className="mt-8 space-y-8 animate-fade-in">
            {/* Group Progress Section */}
            <section aria-label="Settlement progress" className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Settlement Progress</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tracking overall group completion</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">
                    {data.totalExpenses > 0 ? Math.round((data.totalSettled / data.totalExpenses) * 100) : 0}%
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Complete</p>
                </div>
              </div>
              
              <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <div 
                  className={`h-full transition-all duration-1000 ease-out rounded-full ${
                    data.totalSettled >= data.totalExpenses ? 'bg-emerald-500' : 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                  }`}
                  style={{ width: `${data.totalExpenses > 0 ? (data.totalSettled / data.totalExpenses) * 100 : 0}%` }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400">Total Spent</span>
                  <span className="font-bold text-slate-700">{formatSettlementCurrency(data.totalExpenses)}</span>
                </div>
                <div className="flex flex-col gap-0.5 text-right">
                  <span className="text-slate-400">Total Settled</span>
                  <span className="font-bold text-emerald-600">{formatSettlementCurrency(data.totalSettled)}</span>
                </div>
              </div>
            </section>

            {/* History Timeline Section */}
            <section aria-label="Settlement history">
              <div className="mb-4 flex items-center gap-2 px-1">
                <div className="h-4 w-1 rounded-full bg-violet-500" aria-hidden />
                <h3 className="text-sm font-bold text-slate-900">Group Activity History</h3>
              </div>

              <div className="relative space-y-4">
                {/* Vertical Line */}
                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-100 rounded-full" aria-hidden />

                {data.activity.length === 0 ? (
                  <div className="py-10 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400">No activity recorded for this group yet.</p>
                  </div>
                ) : (
                  data.activity.map((event, idx) => {
                    const isExpense = event.type === 'expense';
                    const dateObj = new Date(event.date);
                    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div key={`${event.type}-${idx}`} className="relative flex items-start gap-4 pl-4 group">
                        {/* Timeline Dot */}
                        <div className={`absolute left-[13px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ring-2 ${
                          isExpense ? 'bg-violet-500 ring-violet-100' : 'bg-emerald-500 ring-emerald-100'
                        }`} aria-hidden />

                        <div className="flex-1 rounded-xl border border-slate-200/60 bg-white p-3.5 shadow-sm transition-all duration-200 group-hover:border-slate-300 group-hover:shadow-md">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug text-slate-700">
                                <span className="font-bold text-slate-900">{event.userName}</span>
                                {isExpense ? (
                                  <> added <span className="font-semibold text-slate-900">"{event.description}"</span></>
                                ) : (
                                  <> settled with <span className="font-bold text-slate-900">{event.receiverName}</span></>
                                )}
                              </p>
                              <p className="mt-1 text-[10px] font-medium text-slate-400 uppercase tracking-tight">
                                {dateStr} • {timeStr}
                              </p>
                            </div>
                            <div className={`shrink-0 text-sm font-bold tabular-nums ${isExpense ? 'text-slate-900' : 'text-emerald-600'}`}>
                              {isExpense ? '-' : '+'}{formatSettlementCurrency(event.amount)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {!loading && !data && !apiError && !groupId && (
          <div className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">Choose a group to see balances</p>
            <p className="mt-1 text-xs text-slate-400">Select a group above to view who owes what</p>
          </div>
        )}
      </div>
    </div>
  );
}
