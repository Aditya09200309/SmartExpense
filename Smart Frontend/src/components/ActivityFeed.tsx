import { useState, useEffect } from 'react';
import { getActivity } from '../lib/activityLog';
import type { ActivityEvent } from '../lib/activityLog';
import { normalizeDisplayName } from '../lib/displayNames';
import { formatSettlementCurrency } from '../lib/smartSettlementPresentation';

function timeAgo(timestamp: number): string {
  const s = Math.floor((Date.now() - timestamp) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  const isExpense = event.type === 'expense';
  const receiverName = !isExpense ? normalizeDisplayName(event.receiverName) : '';

  return (
    <li className="flex items-start gap-3.5 px-5 py-3.5 animate-slide-down group hover:bg-slate-50/50 transition-colors duration-150">
      <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full shrink-0 shadow-sm ${
        isExpense ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
      }`}>
        {isExpense ? (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isExpense ? (
          <p className="text-sm leading-relaxed text-slate-600">
            You added <span className="font-bold text-slate-900">{formatSettlementCurrency(event.amount)}</span> for{' '}
            <span className="font-semibold text-slate-800 underline underline-offset-2 decoration-violet-200">{event.description}</span>
            <span className="text-slate-400"> in {event.groupName}</span>
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            You paid <span className="font-bold text-slate-900">{formatSettlementCurrency(event.amount)}</span> to{' '}
            <span className="font-bold text-slate-900">{receiverName}</span>
            <span className="text-slate-400"> in {event.groupName}</span>
          </p>
        )}
        <p className="mt-0.5 text-[10px] font-medium text-slate-400 uppercase tracking-tight">{timeAgo(event.timestamp)}</p>
      </div>
    </li>
  );
}

interface Props {
  userId: string;
}

export default function ActivityFeed({ userId }: Props) {
  const [items, setItems] = useState<ActivityEvent[]>(() => getActivity(userId));

  useEffect(() => {
    const refresh = () => setItems(getActivity(userId));
    window.addEventListener('se:activity', refresh);
    return () => {
      window.removeEventListener('se:activity', refresh);
    };
  }, [userId]);

  return (
    <section aria-label="Recent activity">
      <div className="mb-5 flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-violet-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">No activity yet</p>
            <p className="mt-1 text-xs text-slate-400">Add an expense or settle up to see your history</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {items.slice(0, 20).map(event => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
