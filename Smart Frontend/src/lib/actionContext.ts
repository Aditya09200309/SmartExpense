export type ActionDebtView = 'raw' | 'optimized';

interface BaseActionContext {
  groupId: string;
  groupName: string;
  personId: string;
  personName: string;
  amount: number;
  createdAt: number;
}

export interface RequestSentActionContext extends BaseActionContext {
  type: 'request-sent';
  debtView: 'raw';
  lockGroup: true;
}

export interface SettledActionContext extends BaseActionContext {
  type: 'settled';
}

export type DashboardActionContext = RequestSentActionContext | SettledActionContext;

export interface DashboardRouteState {
  actionContext?: DashboardActionContext;
}

export interface BalanceRouteState {
  groupId?: string;
  actionContext?: DashboardActionContext;
}

export interface SettleUpRouteState {
  groupId: string;
  receiverId?: string;
  amount?: string;
  groupName?: string;
  source?: 'dashboard-best-strategy' | 'balance' | 'group-card' | 'dashboard';
}

const DASHBOARD_ACTION_CONTEXT_STORAGE_KEY = 'smart-expense.dashboard-action-context';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDashboardActionContext(value: unknown): value is DashboardActionContext {
  if (!isRecord(value)) return false;

  const isBaseShape =
    (value.type === 'request-sent' || value.type === 'settled') &&
    typeof value.groupId === 'string' &&
    typeof value.groupName === 'string' &&
    typeof value.personId === 'string' &&
    typeof value.personName === 'string' &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt);

  if (!isBaseShape) return false;

  if (value.type === 'request-sent') {
    return value.debtView === 'raw' && value.lockGroup === true;
  }

  return true;
}

export function readDashboardActionContext(): DashboardActionContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_ACTION_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isDashboardActionContext(parsed)) return null;

    // Expire stale contexts after 30 minutes to prevent misleading banners
    // on page refresh or tab restore long after the action occurred.
    const MAX_AGE_MS = 30 * 60 * 1000;
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(DASHBOARD_ACTION_CONTEXT_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeDashboardActionContext(actionContext: DashboardActionContext | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (!actionContext) {
      window.sessionStorage.removeItem(DASHBOARD_ACTION_CONTEXT_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      DASHBOARD_ACTION_CONTEXT_STORAGE_KEY,
      JSON.stringify(actionContext)
    );
  } catch {
    // Ignore storage issues; this state is only for UX continuity.
  }
}
