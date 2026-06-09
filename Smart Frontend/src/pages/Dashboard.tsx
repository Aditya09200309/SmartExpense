import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { invalidate } from '../lib/invalidate';
import { useGroups } from '../hooks/useGroups';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSmartSettlement, type EnrichedDebt } from '../hooks/useSmartSettlement';
import { useToast } from '../hooks/useToast';
import GroupCard from '../components/GroupCard';
import ActivityFeed from '../components/ActivityFeed';
import BestStrategyCard from '../components/BestStrategyCard';
import SmartAssistantPanel from '../components/SmartAssistantPanel';
import ProUpsellBanner from '../components/ProUpsellBanner';
import GlobalOptimizerCard from '../components/GlobalOptimizerCard';
import { useGlobalBalance } from '../hooks/useGlobalBalance';
import type {
  DashboardActionContext,
  DashboardRouteState,
  RequestSentActionContext,
  SettleUpRouteState,
} from '../lib/actionContext';
import { readDashboardActionContext, writeDashboardActionContext } from '../lib/actionContext';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency } from '../lib/smartSettlementPresentation';

interface GroupFocusContext {
  groupId: string;
  personId: string;
  focusNonce: number;
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();
  const { groups, loading, error } = useGroups();
  const currentUser = useCurrentUser();
  const settlement = useSmartSettlement(groups, currentUser?.id ?? '');
  const { globalNets, loading: globalNetsLoading } = useGlobalBalance(currentUser?.id ?? '');
  const [actionContext, setActionContext] = useState<DashboardActionContext | null>(() => readDashboardActionContext());
  const [groupFocusContext, setGroupFocusContext] = useState<GroupFocusContext | null>(null);

  const firstName = normalizeDisplayName(currentUser?.name ?? '').split(' ')[0] ?? '';
  const greeting = firstName ? `Welcome back, ${firstName}` : 'Your Groups';

  useEffect(() => {
    const routeState = location.state as DashboardRouteState | null;
    if (!routeState?.actionContext) return;

    setActionContext(routeState.actionContext);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.key, location.pathname, location.state, navigate]);

  useEffect(() => {
    writeDashboardActionContext(actionContext);
  }, [actionContext]);

  useEffect(() => {
    if (!actionContext || actionContext.type !== 'request-sent' || settlement.loading) return;

    const stillOutstanding = settlement.owedToYouDebts.some(
      debt => debt.groupId === actionContext.groupId && debt.fromUserId === actionContext.personId
    );

    if (!stillOutstanding) {
      setActionContext({
        type: 'settled',
        groupId: actionContext.groupId,
        groupName: actionContext.groupName,
        personId: actionContext.personId,
        personName: actionContext.personName,
        amount: actionContext.amount,
        createdAt: Date.now(),
      });
    }
  }, [actionContext, settlement.loading, settlement.owedToYouDebts]);

  const handleSettleAction = (d: EnrichedDebt) => {
    showToast(`Settling with ${normalizeDisplayName(d.toUserName)}`);
    const settleUpState: SettleUpRouteState = {
      groupId: d.groupId,
      groupName: d.groupName,
      receiverId: d.toUserId,
      amount: d.amount.toFixed(2),
      source: 'dashboard-best-strategy',
    };
    navigate('/settle-up', { state: settleUpState });
  };
  const handleRequestAction = (d: EnrichedDebt) => {
    const nextActionContext: RequestSentActionContext = {
      type: 'request-sent',
      groupId: d.groupId,
      groupName: d.groupName,
      personId: d.fromUserId,
      personName: normalizeDisplayName(d.fromUserName),
      amount: d.amount,
      createdAt: Date.now(),
      debtView: 'raw',
      lockGroup: true,
    };

    setActionContext(nextActionContext);
    setGroupFocusContext(null);
    showToast(`Request sent to ${nextActionContext.personName} for ${formatSettlementCurrency(nextActionContext.amount)}`);
  };
  const handleMarkAsPaid = async (context: RequestSentActionContext) => {
    try {
      showToast(`Recording payment from ${context.personName}...`);
      await api.post('/settlements', {
        groupId: context.groupId,
        payerId: context.personId,
        receiverId: currentUser?.id,
        amount: context.amount,
      });

      showToast(`Payment of ${formatSettlementCurrency(context.amount)} from ${context.personName} recorded.`);

      // Clear the action context since it's now settled
      setActionContext({
        type: 'settled',
        groupId: context.groupId,
        groupName: context.groupName,
        personId: context.personId,
        personName: context.personName,
        amount: context.amount,
        createdAt: Date.now(),
      });

      invalidate({ resource: 'balances', groupId: context.groupId });
    } catch (err: unknown) {
      showToast('Failed to record payment. Please try from the group card below.');
      console.error('Quick settle error:', err);

      // Fallback: still focus the group card so they can try manually
      setGroupFocusContext({
        groupId: context.groupId,
        personId: context.personId,
        focusNonce: Date.now(),
      });
    }
  };
  const handleViewBalance = (context: DashboardActionContext) => {
    navigate('/balance', { state: { groupId: context.groupId, actionContext: context } });
  };
  const handleClearActionContext = () => {
    setActionContext(null);
  };
  const handleCreateGroupClick = () => {
    navigate('/create-group');
  };

  const handleToggleNudges = async () => {
    if (!currentUser) return;
    try {
      await api.patch('/users/preferences', { optOutNudges: !currentUser.optOutNudges });
      invalidate({ resource: 'users' });
      showToast(currentUser.optOutNudges ? 'Financial nudges enabled' : 'Financial nudges disabled');
    } catch (e) {
      showToast('Failed to update preferences');
    }
  };

  return (
    <div>
      {/* Hero - extends the dark nav aesthetic */}
      <div className="bg-slate-900 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{greeting}</h1>
              <p className="mt-2 text-sm text-slate-400">
                {loading ? '' :
                 error ? 'Could not load your groups.' :
                 groups.length > 0
                   ? `${groups.length} group${groups.length === 1 ? '' : 's'}`
                   : 'Create a group to start splitting expenses'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateGroupClick}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-violet-500 active:scale-[0.99] sm:px-5"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="hidden sm:inline">New Group</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-pulse">
                <div className="mb-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-200" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="mb-4 h-px bg-slate-100" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-7 rounded-lg bg-slate-100" />
                  <div className="h-7 rounded-lg bg-slate-100" />
                  <div className="h-7 rounded-lg bg-slate-100" />
                  <div className="h-7 rounded-lg bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && groups.length > 0 && (
          <>
            <BestStrategyCard
              result={settlement}
              actionContext={actionContext}
              onSettleAction={handleSettleAction}
              onRequestAction={handleRequestAction}
              onMarkAsPaid={handleMarkAsPaid}
              onViewBalance={handleViewBalance}
              onClearActionContext={handleClearActionContext}
            />

            <GlobalOptimizerCard
              globalNets={globalNets}
              loading={globalNetsLoading}
            />

            {currentUser && <ProUpsellBanner userId={currentUser.id} />}

            <SmartAssistantPanel result={settlement} />

            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-8">
              <div>
                <div className="mb-5 flex items-center gap-2">
                  <div className="h-5 w-1 rounded-full bg-violet-500" aria-hidden />
                  <h2 className="text-sm font-semibold text-slate-700">Your Groups</h2>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {groups.map(group => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      currentUserId={currentUser?.id ?? ''}
                      focusContext={groupFocusContext?.groupId === group.id
                        ? { personId: groupFocusContext.personId, focusNonce: groupFocusContext.focusNonce }
                        : null}
                    />
                  ))}
                </div>
              </div>
              {currentUser && (
                <div className="mt-8 lg:mt-0">
                  <ActivityFeed userId={currentUser.id} />
                </div>
              )}
            </div>
          </>
        )}

        {!loading && groups.length > 0 && currentUser && (
          <div className="mt-8 border-t border-slate-100 pt-4 pb-2 text-center">
            <button
              onClick={handleToggleNudges}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              {currentUser.optOutNudges ? 'Enable financial nudges' : 'Disable financial nudges'}
            </button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <>
            <div className="px-4 py-20 text-center">
              <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <h2 className="mb-2 text-lg font-bold text-slate-800">No groups yet</h2>
              <p className="mx-auto mb-7 max-w-xs text-sm leading-relaxed text-slate-400">
                Create a group, add members, and start tracking shared expenses together.
              </p>
              <button
                type="button"
                onClick={handleCreateGroupClick}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-violet-700 hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] active:scale-[0.99]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create your first group
              </button>
            </div>
            {currentUser && <ActivityFeed userId={currentUser.id} />}
          </>
        )}
      </div>
    </div>
  );
}
