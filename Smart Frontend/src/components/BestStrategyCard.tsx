import type { EnrichedDebt, SmartSettlementResult } from '../hooks/useSmartSettlement';
import type { DashboardActionContext, RequestSentActionContext } from '../lib/actionContext';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency, getDisplayStrategy } from '../lib/smartSettlementPresentation';
import TrustScoreBadge from './TrustScoreBadge';

interface Props {
  result: SmartSettlementResult;
  actionContext: DashboardActionContext | null;
  onSettleAction: (debt: EnrichedDebt) => void;
  onRequestAction: (debt: EnrichedDebt) => void;
  onMarkAsPaid: (actionContext: RequestSentActionContext) => void;
  onViewBalance: (actionContext: DashboardActionContext) => void;
  onClearActionContext: () => void;
}

function getRemainingOwedToYouLine(
  result: SmartSettlementResult,
  debt: EnrichedDebt,
  isPay: boolean,
  remainingTotalOwedToYou: number
): string {
  if (remainingTotalOwedToYou === 0) return 'No one will owe you.';

  const remainingDebts = isPay
    ? result.owedToYouDebts
    : result.owedToYouDebts.filter(item => item.fromUserId !== debt.fromUserId);

  const remainingPeople = Array.from(
    new Map(
      remainingDebts.map(item => [item.fromUserId, normalizeDisplayName(item.fromUserName)])
    ).values()
  );

  if (remainingPeople.length === 1) {
    return `${remainingPeople[0]} will still owe you ${formatSettlementCurrency(remainingTotalOwedToYou)}`;
  }

  return `${remainingPeople.length} people will still owe you ${formatSettlementCurrency(remainingTotalOwedToYou)}`;
}

function RequestSentState({
  actionContext,
  onMarkAsPaid,
}: {
  actionContext: RequestSentActionContext;
  onMarkAsPaid: (actionContext: RequestSentActionContext) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        Request sent
      </div>

      <div className="rounded-2xl border border-emerald-300/90 bg-emerald-50/80 p-5 shadow-md shadow-emerald-100/60">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-tight text-emerald-950 sm:text-[1.375rem]">
              Request sent to {actionContext.personName} for {formatSettlementCurrency(actionContext.amount)}
            </p>

            <div className="mt-5 space-y-2 border-t border-emerald-200/80 pt-4 text-sm text-emerald-900">
              <p>
                <span className="font-semibold">What changed:</span>
                {' '}this follow-up stays visible here so you do not send the same request twice.
              </p>
              <p>
                <span className="font-semibold">What next:</span>
                {' '}wait for payment, or mark it as paid manually in the matching group card below.
              </p>
            </div>
          </div>

          <div className="shrink-0 sm:pl-4">
            <button
              type="button"
              onClick={() => onMarkAsPaid(actionContext)}
              className="w-full rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition-all duration-150 hover:border-emerald-400 hover:bg-emerald-100/70 active:scale-[0.98] sm:w-auto"
            >
              Mark as paid
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettledState({
  actionContext,
  onViewBalance,
  onClearActionContext,
}: {
  actionContext: DashboardActionContext;
  onViewBalance: (actionContext: DashboardActionContext) => void;
  onClearActionContext: () => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        Settled
      </div>

      <div className="rounded-2xl border border-emerald-300/90 bg-emerald-50/80 p-5 shadow-md shadow-emerald-100/60">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-tight text-emerald-950 sm:text-[1.375rem]">
              Settled with {actionContext.personName} for {formatSettlementCurrency(actionContext.amount)}
            </p>

            <div className="mt-5 space-y-2 border-t border-emerald-200/80 pt-4 text-sm text-emerald-900">
              <p>
                <span className="font-semibold">What changed:</span>
                {' '}your balances were refreshed after this payment.
              </p>
              <p>
                <span className="font-semibold">What next:</span>
                {' '}review the updated balance, or continue to the next suggested action.
              </p>
            </div>
          </div>

          <div className="shrink-0 sm:pl-4">
            <button
              type="button"
              onClick={() => onViewBalance(actionContext)}
              className="w-full rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition-all duration-150 hover:border-emerald-400 hover:bg-emerald-100/70 active:scale-[0.98] sm:w-auto"
            >
              View updated balance
            </button>
            <button
              type="button"
              onClick={onClearActionContext}
              className="mt-2 w-full text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:text-emerald-900 sm:w-auto"
            >
              Show live strategy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BestStrategyCard({
  result,
  actionContext,
  onSettleAction,
  onRequestAction,
  onMarkAsPaid,
  onViewBalance,
  onClearActionContext,
}: Props) {
  const { loading, isFullySettled } = result;
  const displayStrategy = getDisplayStrategy(result);

  if (loading) {
    return (
      <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm animate-pulse">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-slate-200 shrink-0" />
          <div className="h-3 w-28 rounded bg-slate-200" />
        </div>
        <div className="mb-2 h-5 w-2/3 rounded bg-slate-100" />
        <div className="h-3 w-1/3 rounded bg-slate-100" />
      </div>
    );
  }

  if (actionContext?.type === 'request-sent') {
    return <RequestSentState actionContext={actionContext} onMarkAsPaid={onMarkAsPaid} />;
  }

  if (actionContext?.type === 'settled') {
    return (
      <SettledState
        actionContext={actionContext}
        onViewBalance={onViewBalance}
        onClearActionContext={onClearActionContext}
      />
    );
  }

  if (!displayStrategy && isFullySettled) {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-5 shadow-sm">
        <p className="text-sm font-semibold text-emerald-900">You're all settled</p>
        <p className="mt-1 text-xs text-emerald-700">No action needed right now.</p>
      </div>
    );
  }

  if (!displayStrategy) return null;

  const { amount, ctaText, personName, preview, strategy } = displayStrategy;
  const isPay = strategy.type === 'pay';
  const cardTone = isPay
    ? 'border-violet-300/90 bg-violet-50/80 shadow-md shadow-violet-100/60'
    : 'border-emerald-300/90 bg-emerald-50/80 shadow-md shadow-emerald-100/60';
  const textTone = isPay ? 'text-violet-950' : 'text-emerald-950';
  const helperTone = isPay ? 'text-violet-800' : 'text-emerald-800';
  const dividerTone = isPay ? 'border-violet-200/80' : 'border-emerald-200/80';
  const tagTone = isPay ? 'bg-violet-500' : 'bg-emerald-500';
  const buttonTone = isPay
    ? 'bg-violet-600 text-white hover:bg-violet-700'
    : 'bg-emerald-600 text-white hover:bg-emerald-700';
  const actionLine = `${isPay ? 'Pay' : 'Collect'} ${formatSettlementCurrency(amount)} ${isPay ? 'to' : 'from'} ${personName}`;
  const helperText = isPay ? null : `Send a reminder to ${personName}`;
  const remainingOwedLine = preview.remainingTotalOwed === 0
    ? "You won't owe anyone"
    : `You'll still owe ${formatSettlementCurrency(preview.remainingTotalOwed)}`;
  const remainingOwedToYouLine = getRemainingOwedToYouLine(
    result,
    strategy.debt,
    isPay,
    preview.remainingTotalOwedToYou
  );
  const crossGroupInsight =
    isPay && result.optimizedPlan[0]?.hasReciprocal && result.optimizedPlan[0]?.crossGroupNetAmount != null
      ? result.optimizedPlan[0].crossGroupNetAmount
      : null;

  const outcomeLines = [
    <span key="owed">{remainingOwedLine}</span>,
    ...(preview.remainingTotalOwedToYou > 0 ? [<span key="owedToYou">{remainingOwedToYouLine}</span>] : []),
    ...(crossGroupInsight !== null ? [
      <span key="insight" className="flex items-center gap-1 flex-wrap">
        <span>Relationship net position: {formatSettlementCurrency(crossGroupInsight!)} (across all groups)</span>
        <span className="relative inline-block group shrink-0 select-none">
          <span className="cursor-help text-slate-400 hover:text-slate-600 transition-colors px-1 text-xs font-semibold">ℹ</span>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none whitespace-normal text-left font-normal leading-normal">
            Smart Expense keeps each group’s ledger strictly separate to ensure historical accuracy. While you net {formatSettlementCurrency(crossGroupInsight!)} overall with {personName}, this payment settles your specific {strategy.debt.groupName} balance.
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" aria-hidden />
          </span>
        </span>
      </span>
    ] : []),
  ];

  const buttonText = isPay
    ? `Settle ${strategy.debt.groupName}`
    : 'Send request';

  return (
    <div className="mb-4">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
        <span className={`h-2 w-2 rounded-full ${tagTone}`} aria-hidden />
        Start here
      </div>

      <div className={`rounded-2xl border p-5 ${cardTone}`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className={`text-xl font-semibold leading-tight sm:text-[1.375rem] ${textTone}`}>{actionLine}</p>
              <TrustScoreBadge userId={isPay ? strategy.debt.toUserId : strategy.debt.fromUserId} />
            </div>

            <div className={`mt-5 border-t pt-4 ${dividerTone}`}>
              <p className="text-[11px] font-semibold text-slate-500">After this:</p>
              <ul className={`mt-2 space-y-1.5 text-sm ${helperTone}`}>
                {outcomeLines.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-40" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="shrink-0 sm:pl-4">
            <button
              type="button"
              onClick={() => (isPay ? onSettleAction(strategy.debt) : onRequestAction(strategy.debt))}
              className={`w-full rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-150 active:scale-[0.98] sm:w-auto ${buttonTone}`}
            >
              {buttonText}
            </button>
            {helperText && (
              <p className="mt-2 text-xs text-emerald-800">{helperText}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
