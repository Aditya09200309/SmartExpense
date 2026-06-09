import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { invalidate } from '../lib/invalidate';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FormFields {
  name: string;
  description: string;
  baseCurrency: string;
}

interface FormErrors {
  name?: string;
}

function validate(fields: FormFields): FormErrors {
  const errors: FormErrors = {};
  if (!fields.name.trim()) errors.name = 'Group name is required.';
  return errors;
}

export default function CreateGroup() {
  useDocumentTitle('New Group');
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormFields>({ name: '', description: '', baseCurrency: 'USD' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [createdGroupName, setCreatedGroupName] = useState('');
  const [apiError, setApiError] = useState('');

  function handleAddMembersClick() {
    navigate('/add-member');
  }

  function handleDashboardClick() {
    navigate('/dashboard');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreatedGroupName('');
    setApiError('');
    const validationErrors = validate(fields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      await api.post('/groups', {
        name: fields.name,
        description: fields.description || undefined,
        baseCurrency: fields.baseCurrency,
      });
      setCreatedGroupName(fields.name);
      // Notify all useGroups instances to refetch so the new group appears immediately.
      invalidate({ resource: 'groups' });
      setFields({ name: '', description: '', baseCurrency: 'USD' });
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

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <h1 className="text-2xl font-bold text-white tracking-tight">New Group</h1>
          <p className="text-slate-400 mt-2 text-sm">Create a group to start tracking shared expenses.</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7">
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Group Name
            </label>
            <input
              id="name" name="name" type="text" value={fields.name} onChange={handleChange}
              disabled={loading} autoComplete="off" className={inputCls}
              placeholder="e.g. Goa Trip, Office Lunch"
            />
            {errors.name && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.name}</p>}
          </div>

          <div className="mb-6">
            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1.5">
              Description{' '}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="description" name="description" type="text" value={fields.description}
              onChange={handleChange} disabled={loading} autoComplete="off" className={inputCls}
              placeholder="A short note about this group"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="baseCurrency" className="block text-sm font-medium text-slate-700 mb-1.5">
              Group Base Currency
            </label>
            <select
              id="baseCurrency" name="baseCurrency" value={fields.baseCurrency}
              onChange={handleChange} disabled={loading} className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
            </select>
            <p className="mt-1.5 text-xs text-slate-400">All expenses will be standardized to this currency.</p>
          </div>

          {apiError && (
            <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3 mb-4">
              {apiError}
            </div>
          )}

          {createdGroupName && (
            <div role="status" className="bg-emerald-50 border border-emerald-200/80 rounded-xl px-4 py-3.5 mb-4">
              <p className="text-sm font-semibold text-emerald-800 mb-2.5">
                "{createdGroupName}" created successfully
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleAddMembersClick}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 transition-colors"
                >
                  Add members →
                </button>
                <button
                  type="button"
                  onClick={handleDashboardClick}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 transition-colors"
                >
                  Go to Dashboard →
                </button>
              </div>
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
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.99] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
