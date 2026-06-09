import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function GroupDetailsPlaceholder() {
  useDocumentTitle('Group');
  const navigate = useNavigate();

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-bold tracking-tight text-white">Group</h1>
          <p className="mt-2 text-sm text-slate-400">Group details coming soon.</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
          <p className="text-sm leading-6 text-slate-600">
            Individual group management is available from your dashboard. Use the group cards to add expenses and view balances.
          </p>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mt-5 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-violet-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
