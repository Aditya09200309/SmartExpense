import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { invalidate } from '../lib/invalidate';
import { useGroups } from '../hooks/useGroups';
import { useUsers } from '../hooks/useUsers';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FormFields {
  groupId: string;
  userId: string;
}

interface FormErrors {
  groupId?: string;
  userId?: string;
}

interface SuccessState {
  groupId: string;
  message: string;
}

function validate(fields: FormFields): FormErrors {
  const errors: FormErrors = {};
  if (!fields.groupId) errors.groupId = 'Group is required.';
  if (!fields.userId) errors.userId = 'User is required.';
  return errors;
}

export default function AddMember() {
  useDocumentTitle('Add Member');
  const location = useLocation();
  const navigate = useNavigate();
  const { groups, loading: groupsLoading, error: groupsError } = useGroups();
  const { users, loading: usersLoading, error: usersError } = useUsers();

  const adminGroups = groups.filter(g => g.currentUserRole === 'ADMIN');

  const [fields, setFields] = useState<FormFields>(() => {
    const state = location.state as { groupId?: string } | null;
    return { groupId: state?.groupId ?? '', userId: '' };
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [apiError, setApiError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
    if (successState) {
      setSuccessState(null);
    }
  }

  function handleAddExpense(groupId: string) {
    const params = new URLSearchParams({ groupId });
    navigate(`/add-expense?${params.toString()}`, { state: { groupId } });
  }

  function handleViewGroup(groupId: string) {
    navigate(`/group/${groupId}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessState(null);
    setApiError('');
    const validationErrors = validate(fields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      const addedUser = users.find(u => u.id === fields.userId);
      await api.post(`/groups/${fields.groupId}/members`, { userId: fields.userId });
      setSuccessState({
        groupId: fields.groupId,
        message: `${addedUser?.name ?? 'Member'} added successfully.`,
      });
      // Refresh member lists and group balance (member count comes from balance endpoint).
      invalidate({ resource: 'members', groupId: fields.groupId });
      invalidate({ resource: 'balances', groupId: fields.groupId });
      setFields(prev => ({ ...prev, userId: '' }));
    } catch (err: unknown) {
      if (
        typeof err === 'object' && err !== null && 'response' in err &&
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

  const formDisabled = loading || groupsLoading || usersLoading;
  const selectCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <h1 className="text-2xl font-bold text-white tracking-tight">Add Member</h1>
          <p className="text-slate-400 mt-2 text-sm">Add a registered user to one of your groups. Admin access required.</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7">
        {!groupsLoading && !groupsError && adminGroups.length === 0 && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3 mb-5">
            You are not an admin of any group. Only group admins can add members.
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="groupId" className="block text-sm font-medium text-slate-700 mb-1.5">Group</label>
            {groupsError ? (
              <p role="alert" className="text-sm text-rose-600">{groupsError}</p>
            ) : (
              <select
                id="groupId" name="groupId" value={fields.groupId} onChange={handleChange}
                disabled={formDisabled || adminGroups.length === 0} className={selectCls}
              >
                <option value="">
                  {groupsLoading ? 'Loading groups…' : adminGroups.length === 0 ? 'No groups you can manage' : 'Select a group'}
                </option>
                {adminGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            )}
            {errors.groupId && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.groupId}</p>}
          </div>

          <div className="mb-6">
            <label htmlFor="userId" className="block text-sm font-medium text-slate-700 mb-1.5">User</label>
            {usersError ? (
              <p role="alert" className="text-sm text-rose-600">{usersError}</p>
            ) : (
              <select id="userId" name="userId" value={fields.userId} onChange={handleChange} disabled={formDisabled} className={selectCls}>
                <option value="">{usersLoading ? 'Loading users…' : 'Select a user'}</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                ))}
              </select>
            )}
            {errors.userId && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.userId}</p>}
          </div>

          {apiError && (
            <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3 mb-4">
              {apiError}
            </div>
          )}
          {successState && (
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl px-4 py-4 mb-5">
              <p role="status" className="text-sm text-emerald-700">
                {successState.message} Next step: add an expense for this group, or review the group details.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleAddExpense(successState.groupId)}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-violet-700 hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] active:scale-[0.99]"
                >
                  Add Expense
                </button>
                <button
                  type="button"
                  onClick={() => handleViewGroup(successState.groupId)}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all duration-150 hover:border-slate-300 hover:bg-slate-50"
                >
                  View Group
                </button>
              </div>
              <p className="mt-3 text-xs text-emerald-700/80">
                You can also add another member to the same group below.
              </p>
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
              disabled={formDisabled || adminGroups.length === 0}
              className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.99] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
