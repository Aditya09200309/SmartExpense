import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Group } from '../hooks/useGroups';
import { useGroupBalance } from '../hooks/useGroupBalance';
import type { SimplifiedDebt } from '../hooks/useGroupBalance';
import { api } from '../api/client';
import { logActivity } from '../lib/activityLog';
import { invalidate } from '../lib/invalidate';
import { useToast } from '../hooks/useToast';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency } from '../lib/smartSettlementPresentation';
import GroupHealthIndicator from './GroupHealthIndicator';

interface Props {
  group: Group;
  currentUserId: string;
  focusContext?: {
    personId: string;
    focusNonce: number;
  } | null;
}

const GROUP_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-amber-500', 'bg-cyan-600', 'bg-pink-500', 'bg-indigo-500',
];

function getGroupColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

function BalanceBadge({ balance, loading }: { balance: number | null; loading: boolean }) {
  if (loading) return <div className="h-4 w-32 rounded-full bg-slate-100 animate-pulse" />;
  if (balance === null) return null;

  if (balance > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
        Owed {formatSettlementCurrency(balance)}
      </span>
    );
  }

  if (balance < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" aria-hidden />
        Owes {formatSettlementCurrency(Math.abs(balance))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
      Settled
    </span>
  );
}

interface SuggestionProps {
  suggestion: SimplifiedDebt | null;
  balanceLoading: boolean;
  settleLoading: boolean;
  settleError: string;
  currentUserId: string;
  receivablesCount: number;
  receivableDebts: SimplifiedDebt[];
  onSettle: () => void;
  settlingIds: Set<string>;
  settledIds: Set<string>;
  onItemSettle: (debt: SimplifiedDebt) => void;
  focusedReceivableId?: string | null;
}

function SettlementSuggestion({
  suggestion,
  balanceLoading,
  settleLoading,
  settleError,
  currentUserId,
  receivablesCount,
  receivableDebts,
  onSettle,
  settlingIds,
  settledIds,
  onItemSettle,
  focusedReceivableId,
}: SuggestionProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);

  // Reset confirmation state whenever a settle operation resolves.
  useEffect(() => {
    if (!settleLoading) setConfirmPending(false);
  }, [settleLoading]);

  useEffect(() => {
    if (focusedReceivableId) {
      setExpanded(true);
    }
  }, [focusedReceivableId]);

  if (balanceLoading) return <div className="h-9 rounded-xl bg-slate-100 animate-pulse" />;
  if (!suggestion) return null;

  const youOwe = suggestion.fromUserId === currentUserId;
  const fromName = normalizeDisplayName(suggestion.fromUserName);
  const toName = normalizeDisplayName(suggestion.toUserName);
  const isFocusedSuggestion = suggestion.fromUserId === focusedReceivableId;

  if (youOwe) {
    return (
      <div className="space-y-1.5 rounded-xl border border-amber-200/80 bg-amber-50 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs leading-relaxed text-amber-900">
            You owe <span className="font-semibold">{toName}</span>
            {' '}
            <span className="font-bold">{formatSettlementCurrency(suggestion.amount)}</span>
          </p>
          {confirmPending ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setConfirmPending(false); onSettle(); }}
                className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-white transition-all hover:bg-amber-600 active:scale-95"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmPending(false)}
                className="text-[11px] font-semibold text-amber-600 transition-colors hover:text-amber-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmPending(true)}
              disabled={settleLoading}
              className="shrink-0 rounded-lg bg-amber-200/60 px-2.5 py-1 text-xs font-bold text-amber-800 transition-all hover:bg-amber-200 hover:text-amber-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {settleLoading ? 'Paying...' : 'Pay now'}
            </button>
          )}
        </div>
        {settleError && <p className="text-xs text-rose-600">{settleError}</p>}
      </div>
    );
  }

  const totalReceivable = receivableDebts.reduce((sum, d) => sum + d.amount, 0);
  const others = receivablesCount - 1;

  return (
    <div className={`overflow-hidden rounded-xl border bg-emerald-50 ${
      isFocusedSuggestion
        ? 'border-emerald-300 shadow-sm ring-1 ring-emerald-200'
        : 'border-emerald-200/80'
    }`}>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <p className="min-w-0 text-xs leading-relaxed text-emerald-800">
          <span className="font-semibold">{fromName}</span>
          {others > 0 ? (
            <>
              {' and '}
              <span className="font-semibold">{others} {others === 1 ? 'other' : 'others'}</span>
              {' owe you '}
              <span className="font-bold">{formatSettlementCurrency(totalReceivable)}</span>
            </>
          ) : (
            <>
              {' owes you '}
              <span className="font-bold">{formatSettlementCurrency(suggestion.amount)}</span>
            </>
          )}
        </p>

        {others > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="shrink-0 text-[11px] font-medium text-emerald-600 transition-colors duration-150 hover:text-emerald-800"
            aria-expanded={expanded}
          >
            <span className="inline-flex items-center gap-1">
              {expanded ? 'Hide' : 'Details'}
              <svg
                className={`h-3 w-3 transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onItemSettle(suggestion)}
            disabled={settlingIds.has(suggestion.fromUserId)}
            className="shrink-0 rounded-md bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-700 transition-all hover:bg-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {settlingIds.has(suggestion.fromUserId) ? 'Recording...' : 'Record payment'}
          </button>
        )}
      </div>

      {others > 0 && (
        <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className={`space-y-0.5 border-t border-emerald-200/60 px-3.5 pb-2.5 pt-2 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
              {receivableDebts.filter(d => !settledIds.has(d.fromUserId)).map(debt => {
                const isSettling = settlingIds.has(debt.fromUserId);
                const debtName = normalizeDisplayName(debt.fromUserName);

                return (
                  <div
                    key={debt.fromUserId}
                    className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-150 hover:bg-emerald-100/60 ${
                      debt.fromUserId === focusedReceivableId ? 'bg-emerald-100 ring-1 ring-emerald-300' : ''
                    }`}
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[9px] font-bold text-emerald-800 shrink-0 select-none">
                      {debtName.charAt(0).toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs text-emerald-800">{debtName}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-900">
                      {formatSettlementCurrency(debt.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onItemSettle(debt)}
                      disabled={isSettling}
                      className="shrink-0 rounded-md bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-700 transition-all hover:bg-emerald-300 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSettling ? 'Recording...' : 'Record payment'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupCard({ group, currentUserId, focusContext = null }: Props) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { summary, loading } = useGroupBalance(group.id, currentUserId);
  const showToast = useToast();
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [settlingIds, setSettlingIds] = useState<Set<string>>(new Set());
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set());

  const memberCount = loading || !summary ? '...' : summary.memberCount;
  const memberLabel = !loading && summary?.memberCount === 1 ? 'member' : 'members';
  const userNetBalance = summary ? summary.userNetBalance : null;
  const topSuggestion = summary?.topSuggestion ?? null;
  const receivablesCount = summary?.receivablesCount ?? 0;
  const receivableDebts = summary?.receivableDebts ?? [];
  const groupColor = getGroupColor(group.name);
  const focusedReceivableId = focusContext?.personId ?? null;

  const totalExpenses = summary?.totalExpenses ?? 0;
  const totalSettled = summary?.totalSettled ?? 0;
  const progressPercent = totalExpenses > 0 ? Math.min(100, Math.round((totalSettled / totalExpenses) * 100)) : 0;
  const isFullySettled = totalExpenses > 0 && totalSettled >= totalExpenses;

  useEffect(() => {
    if (!focusContext) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusContext?.focusNonce, focusContext?.personId]);

  async function handleItemSettle(debt: SimplifiedDebt) {
    setSettlingIds(prev => new Set(prev).add(debt.fromUserId));
    try {
      await api.post('/settlements', {
        groupId: group.id,
        payerId: debt.fromUserId,
        receiverId: currentUserId,
        amount: debt.amount,
      });
      logActivity(currentUserId, {
        type: 'settlement',
        id: crypto.randomUUID(),
        groupId: group.id,
        groupName: group.name,
        receiverName: debt.toUserName,
        amount: debt.amount,
        timestamp: Date.now(),
      });
      showToast(`${formatSettlementCurrency(debt.amount)} marked as collected from ${normalizeDisplayName(debt.fromUserName)}`);
      setSettledIds(prev => new Set(prev).add(debt.fromUserId));
      invalidate({ resource: 'balances', groupId: group.id });
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Settlement failed. Please try again.';
      showToast(message);
    } finally {
      setSettlingIds(prev => {
        const next = new Set(prev);
        next.delete(debt.fromUserId);
        return next;
      });
    }
  }

  async function handleQuickSettle() {
    if (!topSuggestion) return;
    setSettleLoading(true);
    setSettleError('');

    try {
      await api.post('/settlements', {
        groupId: group.id,
        receiverId: topSuggestion.toUserId,
        amount: topSuggestion.amount,
      });
      logActivity(currentUserId, {
        type: 'settlement',
        id: crypto.randomUUID(),
        groupId: group.id,
        groupName: group.name,
        receiverName: topSuggestion.toUserName,
        amount: topSuggestion.amount,
        timestamp: Date.now(),
      });
      showToast(`${formatSettlementCurrency(topSuggestion.amount)} paid to ${normalizeDisplayName(topSuggestion.toUserName)}`);
      invalidate({ resource: 'balances', groupId: group.id });
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Settlement failed. Please try again.';
      setSettleError(message);
    } finally {
      setSettleLoading(false);
    }
  }

  const actionBtn = 'rounded-lg px-3 py-2.5 text-center text-xs font-medium text-slate-600 transition-all duration-150 hover:bg-violet-50 hover:text-violet-700';

  return (
    <div
      ref={cardRef}
      className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        focusContext ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200/80'
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white shrink-0 select-none ${groupColor}`}>
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold leading-snug text-slate-900">{group.name}</h2>
            {group.currentUserRole === 'ADMIN' && (
              <span className="mt-0.5 shrink-0 rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600">
                Admin
              </span>
            )}
            <GroupHealthIndicator groupId={group.id} />
          </div>
          {group.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{group.description}</p>
          ) : (
            <p className="mt-0.5 text-xs italic text-slate-300">No description</p>
          )}
        </div>
      </div>
      
      {/* Settlement Progress Bar */}
      {!loading && totalExpenses > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold tracking-tight">
            {isFullySettled ? (
              <span className="text-emerald-600 flex items-center gap-1">
                Fully settled <span aria-hidden>✅</span>
              </span>
            ) : (
              <span className="text-slate-400 uppercase tracking-wider">{progressPercent}% settled</span>
            )}
            {!isFullySettled && (
              <span className="text-slate-300 tabular-nums font-medium">
                {formatSettlementCurrency(totalSettled)} / {formatSettlementCurrency(totalExpenses)}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/40">
            <div 
              className={`h-full transition-all duration-700 ease-out rounded-full ${
                isFullySettled ? 'bg-emerald-500' : 'bg-violet-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {loading ? (
            <span className="inline-block h-3 w-14 rounded bg-slate-100 animate-pulse" />
          ) : (
            <>
              <span className="font-medium text-slate-600">{memberCount}</span> {memberLabel}
            </>
          )}
        </p>
        <BalanceBadge balance={userNetBalance} loading={loading} />
      </div>

      <div className="mt-2">
        <SettlementSuggestion
          suggestion={topSuggestion}
          balanceLoading={loading}
          settleLoading={settleLoading}
          settleError={settleError}
          currentUserId={currentUserId}
          receivablesCount={receivablesCount}
          receivableDebts={receivableDebts}
          onSettle={handleQuickSettle}
          settlingIds={settlingIds}
          settledIds={settledIds}
          onItemSettle={handleItemSettle}
          focusedReceivableId={focusedReceivableId}
        />
      </div>

      <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-slate-100 pt-4">
        <button type="button" onClick={() => navigate('/balance', { state: { groupId: group.id } })} className={actionBtn}>
          View balances
        </button>
        <button type="button" onClick={() => navigate('/add-expense', { state: { groupId: group.id } })} className={actionBtn}>
          Add Expense
        </button>
        <button type="button" onClick={() => navigate('/add-member', { state: { groupId: group.id } })} className={actionBtn}>
          Add Member
        </button>
        <button
          type="button"
          onClick={() => navigate('/settle-up', { state: { groupId: group.id, groupName: group.name, source: 'group-card' } })}
          className={actionBtn}
        >
          Pay now
        </button>
      </div>
    </div>
  );
}
