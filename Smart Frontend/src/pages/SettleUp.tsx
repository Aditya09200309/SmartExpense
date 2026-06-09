import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { invalidate, onInvalidate } from '../lib/invalidate';
import { useGroups } from '../hooks/useGroups';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { logActivity } from '../lib/activityLog';
import { useToast } from '../hooks/useToast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type {
  BalanceRouteState,
  DashboardRouteState,
  DashboardActionContext,
} from '../lib/actionContext';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency } from '../lib/smartSettlementPresentation';

interface SimplifiedDebt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

interface BalanceResponse {
  netBalances: unknown[];
  simplifiedDebts: SimplifiedDebt[];
}

interface FormFields {
  groupId: string;
  receiverId: string;
  amount: string;
}

interface FormErrors {
  groupId?: string;
  receiverId?: string;
  amount?: string;
}

interface SettlementFeedback {
  groupId: string;
  receiverId: string;
  receiverName: string;
  amountPaid: number;
  remainingAmount: number;
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function formatCurrencyLabel(amount: number): string {
  return formatSettlementCurrency(amount);
}

function validate(fields: FormFields, isGlobal: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!isGlobal && !fields.groupId) errors.groupId = 'Group is required.';
  if (!fields.receiverId) errors.receiverId = 'Receiver is required.';
  const amount = parseFloat(fields.amount);
  if (!fields.amount.trim()) {
    errors.amount = 'Amount is required.';
  } else if (isNaN(amount) || amount <= 0) {
    errors.amount = 'Amount must be a positive number.';
  }
  return errors;
}

export default function SettleUp() {
  useDocumentTitle('Pay now');
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as any;
  const currentUser = useCurrentUser();
  const showToast = useToast();
  const { groups, loading: groupsLoading, error: groupsError } = useGroups();

  const isGlobal = !!routeState?.isGlobal;
  const globalReceiverId = routeState?.receiverId ?? '';
  const globalReceiverName = routeState?.receiverName ?? '';
  const globalNetAmount = routeState?.netAmount ?? 0;
  const globalCurrency = routeState?.currency ?? 'EUR';
  const globalBreakdown = routeState?.breakdown ?? [];

  const [fields, setFields] = useState<FormFields>(() => {
    if (isGlobal) {
      return {
        groupId: 'GLOBAL_NETTING',
        receiverId: globalReceiverId,
        amount: globalNetAmount.toFixed(2),
      };
    }
    if (routeState?.groupId) {
      return {
        groupId: routeState.groupId,
        receiverId: routeState.receiverId ?? '',
        amount: routeState.amount ?? '',
      };
    }
    return { groupId: '', receiverId: '', amount: '' };
  });
  const { members, loading: membersLoading, error: membersError } = useGroupMembers(fields.groupId);
  const [allDebts, setAllDebts] = useState<SimplifiedDebt[]>([]);
  const [debtsLoading, setDebtsLoading] = useState(() => !!routeState?.groupId);
  const [debtsKey, setDebtsKey] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [settlementFeedback, setSettlementFeedback] = useState<SettlementFeedback | null>(null);
  const [apiError, setApiError] = useState('');

  const myDebts = allDebts.filter(d => d.fromUserId === currentUser?.id);
  const validReceiverIds = new Set(myDebts.map(d => d.toUserId));
  const effectiveReceiverId = isGlobal
    ? globalReceiverId
    : debtsLoading
    ? fields.receiverId
    : validReceiverIds.has(fields.receiverId) ? fields.receiverId : '';

  // Re-fetch the debt panel whenever this group's balance is invalidated externally
  // (e.g. by a quick pay action from a GroupCard while this page is mounted).
  useEffect(() => {
    if (!fields.groupId) return;
    return onInvalidate(({ resource, groupId: changedGroupId }) => {
      if (
        resource === 'balances' &&
        (!changedGroupId || changedGroupId === fields.groupId)
      ) {
        setDebtsLoading(true);
        setDebtsKey(k => k + 1);
      }
    });
  }, [fields.groupId]);

  useEffect(() => {
    if (!settlementFeedback || debtsLoading || settlementFeedback.groupId !== fields.groupId) return;

    const refreshedRemainingAmount = roundCurrency(
      myDebts.find(d => d.toUserId === settlementFeedback.receiverId)?.amount ?? 0
    );

    setSettlementFeedback(prev => {
      if (!prev || prev.groupId !== settlementFeedback.groupId || prev.receiverId !== settlementFeedback.receiverId) {
        return prev;
      }
      return prev.remainingAmount === refreshedRemainingAmount
        ? prev
        : { ...prev, remainingAmount: refreshedRemainingAmount };
    });

    setFields(prev => {
      if (prev.groupId !== settlementFeedback.groupId) return prev;

      if (refreshedRemainingAmount > 0) {
        const nextAmount = refreshedRemainingAmount.toFixed(2);
        if (prev.receiverId === settlementFeedback.receiverId && prev.amount === nextAmount) return prev;
        return { ...prev, receiverId: settlementFeedback.receiverId, amount: nextAmount };
      }

      if (!prev.receiverId && !prev.amount) return prev;
      return { ...prev, receiverId: '', amount: '' };
    });
  }, [debtsLoading, fields.groupId, myDebts, settlementFeedback]);

  // Fetch outstanding debts - runs on group change or debtsKey increment.
  useEffect(() => {
    if (!fields.groupId) return;
    const controller = new AbortController();
    api.get<BalanceResponse>(`/groups/${fields.groupId}/balances`, { signal: controller.signal })
      .then(res => {
        setAllDebts(res.data.simplifiedDebts);
        setDebtsLoading(false);
      })
      .catch(err => {
        if (err?.name !== 'CanceledError') {
          setAllDebts([]);
          setDebtsLoading(false);
        }
      });
    return () => controller.abort();
  }, [fields.groupId, debtsKey]);

  function handleGroupChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFields({ groupId: e.target.value, receiverId: '', amount: '' });
    setAllDebts([]);
    setDebtsLoading(!!e.target.value);
    setErrors({});
    setSettlementFeedback(null);
    setApiError('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
    setSettlementFeedback(null);
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }

  function handleQuickAmount(fraction: number) {
    const currentDebt = myDebts.find(d => d.toUserId === effectiveReceiverId);
    if (!currentDebt) return;
    setFields(prev => ({ ...prev, amount: (currentDebt.amount * fraction).toFixed(2) }));
    setErrors(prev => ({ ...prev, amount: undefined }));
  }

  function fillFromDebt(debt: SimplifiedDebt) {
    setFields(prev => ({
      ...prev,
      receiverId: debt.toUserId,
      amount: debt.amount.toFixed(2),
    }));
    setErrors({});
    setSettlementFeedback(null);
    setApiError('');
  }

  function buildSettledActionContext(): DashboardActionContext | null {
    if (!settlementFeedback) return null;

    return {
      type: 'settled',
      groupId: settlementFeedback.groupId,
      groupName: groups.find(group => group.id === settlementFeedback.groupId)?.name ?? routeState?.groupName ?? settlementFeedback.groupId,
      personId: settlementFeedback.receiverId,
      personName: settlementFeedback.receiverName,
      amount: settlementFeedback.amountPaid,
      createdAt: Date.now(),
    };
  }

  function handleViewUpdatedBalance() {
    const nextActionContext = buildSettledActionContext();
    const balanceState: BalanceRouteState = {
      groupId: settlementFeedback?.groupId ?? fields.groupId,
      actionContext: nextActionContext ?? undefined,
    };
    navigate('/balance', { state: balanceState });
  }

  function handleBackToDashboard() {
    const nextActionContext = buildSettledActionContext();
    const dashboardState: DashboardRouteState = {
      actionContext: nextActionContext ?? undefined,
    };
    navigate('/dashboard', { state: dashboardState });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSettlementFeedback(null);
    setApiError('');
    const validationErrors = validate({ ...fields, receiverId: effectiveReceiverId }, isGlobal);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      if (isGlobal) {
        const payload = {
          receiverId: globalReceiverId,
          amount: globalNetAmount,
          targetCurrency: globalCurrency,
          breakdown: globalBreakdown.map((item: any) => ({
            groupId: item.groupId,
            originalAmount: item.originalAmount,
            payerId: item.originalAmount < 0 ? currentUser?.id : globalReceiverId,
            receiverId: item.originalAmount < 0 ? globalReceiverId : currentUser?.id,
            amount: Math.abs(item.originalAmount)
          }))
        };
        await api.post('/settlements/global', payload);

        setSettlementFeedback({
          groupId: 'GLOBAL_NETTING',
          receiverId: globalReceiverId,
          receiverName: normalizeDisplayName(globalReceiverName),
          amountPaid: globalNetAmount,
          remainingAmount: 0
        });

        if (currentUser) {
          logActivity(currentUser.id, {
            type: 'settlement',
            id: crypto.randomUUID(),
            groupId: 'GLOBAL_NETTING',
            groupName: 'Global Netting Offset',
            receiverName: normalizeDisplayName(globalReceiverName),
            amount: globalNetAmount,
            timestamp: Date.now()
          });
        }
        showToast(`Global settlement of ${formatCurrencyLabel(globalNetAmount)} successfully recorded!`);
        invalidate({ resource: 'balances' });
        return;
      }

      const groupId = fields.groupId;
      const receiverId = effectiveReceiverId;
      const amount = parseFloat(fields.amount);
      const receiverName = normalizeDisplayName(members.find(m => m.id === receiverId)?.name ?? receiverId);
      const currentDebt = myDebts.find(d => d.toUserId === receiverId);
      const remainingAmount = roundCurrency(Math.max((currentDebt?.amount ?? 0) - amount, 0));
      await api.post('/settlements', { groupId, receiverId, amount });
      setSettlementFeedback({
        groupId,
        receiverId,
        receiverName,
        amountPaid: amount,
        remainingAmount,
      });
      setFields(prev => ({
        ...prev,
        receiverId: remainingAmount > 0 ? receiverId : '',
        amount: remainingAmount > 0 ? remainingAmount.toFixed(2) : '',
      }));
      setDebtsLoading(true);
      if (currentUser) {
        logActivity(currentUser.id, {
          type: 'settlement',
          id: crypto.randomUUID(),
          groupId,
          groupName: groups.find(g => g.id === groupId)?.name ?? groupId,
          receiverName,
          amount,
          timestamp: Date.now(),
        });
      }
      showToast(`${formatCurrencyLabel(amount)} paid to ${receiverName}`);
      invalidate({ resource: 'balances', groupId });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
      ) {
        setApiError((err as { response: { data: { error: string } } }).response.data.error);
      } else {
        setApiError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const formDisabled = loading || groupsLoading;
  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';
  const selectCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <h1 className="text-2xl font-bold text-white tracking-tight">Pay now</h1>
          <p className="mt-2 text-sm text-slate-400">Settle what you owe — or confirm a payment you've received.</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <form onSubmit={handleSubmit} noValidate>
            {isGlobal ? (
              <div className="mb-6 rounded-2xl border border-violet-100 bg-violet-50/50 p-5 select-none">
                <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-2">⚡ Multi-Group Netting Active</p>
                <h3 className="text-sm font-semibold text-slate-800">Global Settlement with {normalizeDisplayName(globalReceiverName)}</h3>
                <p className="text-xs text-slate-500 mt-1">This transaction will automatically settle balances across {globalBreakdown.length} shared groups at live exchange rates.</p>
              </div>
            ) : (
              <div className="mb-4">
                <label htmlFor="groupId" className="mb-1.5 block text-sm font-medium text-slate-700">Group</label>
                {groupsError ? (
                  <p role="alert" className="text-sm text-rose-600">{groupsError}</p>
                ) : (
                  <select id="groupId" name="groupId" value={fields.groupId} onChange={handleGroupChange} disabled={formDisabled} className={selectCls}>
                    <option value="">{groupsLoading ? 'Loading groups...' : 'Select a group'}</option>
                    {groups.map(group => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                )}
                {errors.groupId && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.groupId}</p>}
              </div>
            )}

            {!isGlobal && fields.groupId && (
              <>
                {debtsLoading && (
                  <div className="mb-5 h-16 rounded-xl bg-slate-100 animate-pulse" />
                )}

                {!debtsLoading && myDebts.length > 0 && (
                  <div className="mb-5 rounded-xl border border-amber-200/80 bg-amber-50 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-800">Your outstanding debts</p>
                    <ul className="space-y-2">
                      {myDebts.map((debt, index) => (
                        <li key={index} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 text-sm leading-relaxed text-amber-900">
                            You owe <span className="font-semibold">{normalizeDisplayName(debt.toUserName)}</span>
                            {' - '}
                            <span className="font-bold">{formatCurrencyLabel(debt.amount)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => fillFromDebt(debt)}
                            disabled={formDisabled}
                            className="shrink-0 rounded-lg bg-amber-200/60 px-2.5 py-1 text-xs font-bold text-amber-800 transition-all hover:bg-amber-200 hover:text-amber-900 disabled:opacity-40"
                          >
                            Fill
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!debtsLoading && myDebts.length === 0 && fields.groupId && (
                  <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-3.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-200 shrink-0 mt-0.5">
                      <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">No outstanding debts in this group.</p>
                      <p className="mt-0.5 text-xs text-emerald-600">If you expect a pending payment, check your other groups.</p>
                    </div>
                  </div>
                )}

                {settlementFeedback && settlementFeedback.groupId === fields.groupId && (
                  <div role="status" className="mb-5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-3.5">
                    <p className="text-sm font-semibold text-emerald-800">
                      {settlementFeedback.remainingAmount > 0 && <span className="font-bold text-amber-600 mr-1">Partially Settled:</span>}
                      {formatCurrencyLabel(settlementFeedback.amountPaid)} paid to {settlementFeedback.receiverName}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      What changed: balances were refreshed for this group.
                    </p>
                    {settlementFeedback.remainingAmount > 0 && (
                      <>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          {debtsLoading
                            ? 'Refreshing balance…'
                            : `${formatCurrencyLabel(settlementFeedback.remainingAmount)} remaining`}
                        </p>
                        {!debtsLoading && (
                          <p className="mt-0.5 text-xs text-emerald-700">
                            Next: Pay {formatCurrencyLabel(settlementFeedback.remainingAmount)} to {settlementFeedback.receiverName}
                          </p>
                        )}
                      </>
                    )}
                    {settlementFeedback.remainingAmount === 0 && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Next: Review the updated balance or head back to your dashboard.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleViewUpdatedBalance}
                        className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-all hover:border-emerald-400 hover:bg-emerald-100/70"
                      >
                        View updated balance
                      </button>
                      {(routeState?.source === 'dashboard-best-strategy' || isGlobal) && (
                        <button
                          type="button"
                          onClick={handleBackToDashboard}
                          className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-all hover:border-emerald-400 hover:bg-emerald-100/70"
                        >
                          Back to Dashboard
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {isGlobal ? (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Pay To</label>
                <div className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 bg-slate-50 font-semibold select-none">
                  {normalizeDisplayName(globalReceiverName)}
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <label htmlFor="receiverId" className="mb-1.5 block text-sm font-medium text-slate-700">Pay To</label>
                {membersError ? (
                  <p role="alert" className="text-sm text-rose-600">{membersError}</p>
                ) : (
                  <select
                    id="receiverId"
                    name="receiverId"
                    value={effectiveReceiverId}
                    onChange={handleChange}
                    disabled={formDisabled || membersLoading || debtsLoading || !fields.groupId}
                    className={selectCls}
                  >
                    <option value="">
                      {!fields.groupId ? 'Select a group first'
                        : (membersLoading || debtsLoading) ? 'Loading...'
                        : validReceiverIds.size === 0 ? 'No outstanding debts'
                        : 'Select recipient'}
                    </option>
                    {members
                      .filter(m => validReceiverIds.has(m.id))
                      .map(member => (
                        <option key={member.id} value={member.id}>{normalizeDisplayName(member.name)}</option>
                      ))}
                  </select>
                )}
                {errors.receiverId && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.receiverId}</p>}
              </div>
            )}

            <div className="mb-6">
              <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-slate-700">Amount ({isGlobal ? globalCurrency : '₹'})</label>
              <input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={fields.amount}
                onChange={handleChange}
                onWheel={(e) => e.currentTarget.blur()}
                disabled={formDisabled || isGlobal}
                placeholder="0.00"
                className={inputCls}
              />
              {errors.amount && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.amount}</p>}
              
              {effectiveReceiverId && myDebts.some(d => d.toUserId === effectiveReceiverId) && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(1)}
                    disabled={formDisabled}
                    className="flex-1 rounded-lg border border-violet-200 bg-violet-50 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
                  >
                    Pay Full
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(0.5)}
                    disabled={formDisabled}
                    className="flex-1 rounded-lg border border-violet-200 bg-violet-50 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
                  >
                    Pay Half
                  </button>
                </div>
              )}
            </div>

            {apiError && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {apiError}
              </div>
            )}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formDisabled}
                className="w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-violet-700 hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Recording...' : 'Record payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
