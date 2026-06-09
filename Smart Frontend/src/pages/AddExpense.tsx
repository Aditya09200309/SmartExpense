import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useGroups } from '../hooks/useGroups';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { logActivity } from '../lib/activityLog';
import { invalidate } from '../lib/invalidate';
import { useToast } from '../hooks/useToast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSocialBalanceInsight } from '../hooks/useSocialBalanceInsight';
import { features } from '../lib/features';

interface Split {
  id: string;
  userId: string;
  amount: string;
}

interface FormFields {
  groupId: string;
  paidById: string;
  description: string;
  amount: string;
  currency: string;
  exchangeRate: string;
}

interface SplitRowError {
  userId?: string;
  amount?: string;
}

interface FormErrors {
  groupId?: string;
  paidById?: string;
  description?: string;
  amount?: string;
  splitRows?: SplitRowError[];
  splitTotal?: string;
}

function newSplit(): Split {
  return { id: crypto.randomUUID(), userId: '', amount: '' };
}

function validate(fields: FormFields, splits: Split[]): FormErrors {
  const errors: FormErrors = {};

  if (!fields.groupId) errors.groupId = 'Group is required.';
  if (!fields.paidById) errors.paidById = 'Payer is required.';
  if (!fields.description.trim()) errors.description = 'Description is required.';

  const totalAmount = parseFloat(fields.amount);
  if (!fields.amount.trim()) {
    errors.amount = 'Total amount is required.';
  } else if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    errors.amount = 'Total amount must be a positive number.';
  }

  const exchangeRate = parseFloat(fields.exchangeRate);
  if (fields.currency && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
    // Actually we only need to validate if currency is different from group base, but it's simpler to always validate
    // errors.exchangeRate = 'Exchange rate must be positive.'; // omitted from FormErrors type for simplicity
  }

  const splitRows: SplitRowError[] = splits.map(split => {
    const rowError: SplitRowError = {};
    if (!split.userId) rowError.userId = 'User is required.';
    const splitAmount = parseFloat(split.amount);
    if (!split.amount.trim()) {
      rowError.amount = 'Amount is required.';
    } else if (!Number.isFinite(splitAmount) || splitAmount <= 0) {
      rowError.amount = 'Amount must be a positive number.';
    }
    return rowError;
  });

  const hasSplitRowErrors = splitRows.some(e => Object.keys(e).length > 0);
  if (hasSplitRowErrors) errors.splitRows = splitRows;

  // Catch duplicate userId selections — marks every row beyond the first occurrence.
  const seenUserIds = new Set<string>();
  let hasDuplicates = false;
  const deduplicatedRows = splitRows.map((rowErr, i) => {
    const uid = splits[i].userId;
    if (!uid) return rowErr;
    if (seenUserIds.has(uid)) {
      hasDuplicates = true;
      return { ...rowErr, userId: 'Person already included in another split.' };
    }
    seenUserIds.add(uid);
    return rowErr;
  });
  if (hasDuplicates) errors.splitRows = deduplicatedRows;

  if (!errors.amount && !hasSplitRowErrors && !hasDuplicates) {
    const totalCents = Math.round(totalAmount * 100);
    const splitSumCents = splits.reduce((sum, s) => sum + Math.round(parseFloat(s.amount) * 100), 0);
    if (splitSumCents !== totalCents) {
      errors.splitTotal = `Split amounts must sum to ${fields.amount}. Current sum: ${(splitSumCents / 100).toFixed(2)}.`;
    }
  }

  return errors;
}

export default function AddExpense() {
  useDocumentTitle('Add Expense');
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const showToast = useToast();
  const { groups, loading: groupsLoading, error: groupsError } = useGroups();

  const [fields, setFields] = useState<FormFields>(() => {
    const state = location.state as { groupId?: string } | null;
    return {
      groupId: state?.groupId ?? '',
      paidById: currentUser?.id ?? '',
      description: '',
      amount: '',
      currency: 'USD',
      exchangeRate: '1.0',
    };
  });

  const { members, loading: membersLoading, error: membersError, loadedForGroupId } = useGroupMembers(fields.groupId);
  const balanceInsight = useSocialBalanceInsight(fields.groupId);
  const [splits, setSplits] = useState<Split[]>([newSplit()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const effectivePaidById = fields.paidById || currentUser?.id || '';
  const autoPopulatedFor = useRef('');
  const [fetchingRate, setFetchingRate] = useState(false);
  const [showCurrencyOptions, setShowCurrencyOptions] = useState(false);

  const fetchLiveExchangeRate = async () => {
    const selectedGroup = groups.find(g => g.id === fields.groupId);
    const baseCurrency = selectedGroup?.baseCurrency || 'USD';
    const fromCurrency = fields.currency;

    if (!fromCurrency || !baseCurrency) return;
    if (fromCurrency === baseCurrency) {
      setFields(prev => ({ ...prev, exchangeRate: '1.0' }));
      return;
    }

    setFetchingRate(true);
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`).then(r => r.json());
      if (res.result === 'success' && res.rates?.[baseCurrency]) {
        const rate = res.rates[baseCurrency];
        setFields(prev => ({ ...prev, exchangeRate: rate.toFixed(4) }));
        showToast(`Exchange rate updated: 1 ${fromCurrency} = ${rate.toFixed(4)} ${baseCurrency}`);
      } else {
        throw new Error('Invalid rate response');
      }
    } catch (err) {
      console.warn('[AddExpense] Failed to fetch live exchange rate:', err);
      showToast('Could not fetch live rate. Please enter manually.');
    } finally {
      setFetchingRate(false);
    }
  };

  useEffect(() => {
    if (
      fields.groupId
      && loadedForGroupId === fields.groupId  // only use members that belong to the current group
      && members.length > 0
      && autoPopulatedFor.current !== fields.groupId
    ) {
      autoPopulatedFor.current = fields.groupId;
      setSplits(members.map(m => ({ id: crypto.randomUUID(), userId: m.id, amount: '' })));
    }
  }, [members, fields.groupId, loadedForGroupId]);

  function handleGroupChange(e: React.ChangeEvent<HTMLSelectElement>) {
    autoPopulatedFor.current = '';
    setFields(prev => ({
      groupId: e.target.value,
      paidById: prev.paidById || currentUser?.id || '',
      description: '',
      amount: '',
      currency: groups.find(g => g.id === e.target.value)?.baseCurrency ?? 'USD',
      exchangeRate: '1.0',
    }));
    setSplits([newSplit()]);
    setErrors({});
  }

  function splitEqually() {
    const total = parseFloat(fields.amount);
    if (isNaN(total) || total <= 0 || splits.length === 0) return;
    const each = Math.floor((total / splits.length) * 100) / 100;
    const remainder = parseFloat((total - each * splits.length).toFixed(2));
    setSplits(prev => prev.map((s, i) => ({
      ...s,
      amount: i === prev.length - 1 ? (each + remainder).toFixed(2) : each.toFixed(2),
    })));
    setErrors(prev => ({ ...prev, splitRows: undefined, splitTotal: undefined }));
  }

  function handleFieldChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }

  function handleSplitChange(index: number, field: keyof Omit<Split, 'id'>, value: string) {
    setSplits(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
    if (errors.splitRows?.[index]?.[field]) {
      setErrors(prev => {
        const updated = [...(prev.splitRows ?? [])];
        updated[index] = { ...updated[index], [field]: undefined };
        return { ...prev, splitRows: updated };
      });
    }
  }

  function addSplit() {
    setSplits(prev => [...prev, newSplit()]);
  }

  function removeSplit(index: number) {
    setSplits(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError('');
    const validationErrors = validate({ ...fields, paidById: effectivePaidById }, splits);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      const groupId = fields.groupId;
      const paidById = effectivePaidById;
      const description = fields.description.trim();
      const amount = parseFloat(fields.amount);
      await api.post('/expenses', {
        groupId,
        paidById,
        amount,
        description,
        currency: fields.currency,
        exchangeRate: parseFloat(fields.exchangeRate) || 1.0,
        splits: splits.map(s => ({ userId: s.userId, amount: parseFloat(s.amount) })),
      });
      // Reset form immediately after the API call succeeds so that a side-effect
      // error below cannot leave the form populated and invite a duplicate submit.
      setFields(prev => ({ ...prev, description: '', amount: '' }));
      setSplits(members.map(m => ({ id: crypto.randomUUID(), userId: m.id, amount: '' })));
      setErrors({});
      if (currentUser) {
        logActivity(currentUser.id, {
          type: 'expense',
          id: crypto.randomUUID(),
          groupId,
          groupName: groups.find(g => g.id === groupId)?.name ?? groupId,
          description,
          amount,
          timestamp: Date.now(),
        });
      }
      showToast('Expense added');
      // Notify all mounted balance hooks for this group to refetch.
      invalidate({ resource: 'balances', groupId });
      navigate('/dashboard');
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

  const formDisabled = loading || groupsLoading || membersLoading;

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';
  const selectCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150';

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <h1 className="text-2xl font-bold text-white tracking-tight">Add Expense</h1>
          <p className="text-slate-400 mt-2 text-sm">Record a shared expense and split it among group members.</p>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7">
        <form onSubmit={handleSubmit} noValidate>

          {/* Group */}
          <div className="mb-4">
            <label htmlFor="groupId" className="block text-sm font-medium text-slate-700 mb-1.5">Group</label>
            {groupsError ? (
              <p role="alert" className="text-sm text-rose-600">{groupsError}</p>
            ) : (
              <select id="groupId" value={fields.groupId} onChange={handleGroupChange} disabled={formDisabled} className={selectCls}>
                <option value="">{groupsLoading ? 'Loading groups…' : 'Select a group'}</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            )}
            {errors.groupId && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.groupId}</p>}
          </div>

          {/* Paid by */}
          {fields.groupId && members.length > 0 && (
            <div className="mb-4">
              <label htmlFor="paidById" className="block text-sm font-medium text-slate-700 mb-1.5">Paid by</label>
              <select
                id="paidById" name="paidById" value={effectivePaidById}
                onChange={handleFieldChange} disabled={formDisabled} className={selectCls}
              >
                <option value="">Select payer</option>
                {members.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.id === currentUser?.id ? `${member.name} (you)` : member.name}
                  </option>
                ))}
              </select>
              {errors.paidById && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.paidById}</p>}
              
              {features.ENABLE_BURDEN_NUDGES && balanceInsight?.message && (
                <div className="mt-3 flex items-start gap-2.5 bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-sm text-slate-700 shadow-sm">
                  <span className="shrink-0 mt-0.5 text-indigo-500" aria-hidden>✨</span>
                  <p className="leading-relaxed font-medium">{balanceInsight.message}</p>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <input
              id="description" name="description" type="text" value={fields.description}
              onChange={handleFieldChange} disabled={formDisabled} className={inputCls}
              placeholder="e.g. Dinner, Groceries, Cab"
            />
            {errors.description && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.description}</p>}
          </div>

          {/* Total Amount */}
          <div className="mb-6">
            <label htmlFor="amount" className="block text-sm font-medium text-slate-700 mb-1.5">Total Amount</label>
            <input
              id="amount" name="amount" type="number" min="0.01" step="0.01" value={fields.amount}
              onChange={handleFieldChange} onWheel={(e) => e.currentTarget.blur()} disabled={formDisabled} className={inputCls}
              placeholder="0.00"
            />
            {errors.amount && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.amount}</p>}
          </div>

          {/* Multi-currency (collapsed by default) */}
          {!showCurrencyOptions ? (
            <div className="mb-6 -mt-3">
              <button
                type="button"
                onClick={() => setShowCurrencyOptions(true)}
                className="text-xs font-medium text-slate-400 hover:text-violet-600 transition-colors"
              >
                + Multi-currency expense?
              </button>
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-700">Currency options</span>
                <button
                  type="button"
                  onClick={() => setShowCurrencyOptions(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Hide
                </button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label htmlFor="currency" className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
                  <select id="currency" name="currency" value={fields.currency} onChange={handleFieldChange} disabled={formDisabled} className={selectCls}>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="INR">INR (₹)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <label htmlFor="exchangeRate" className="block text-sm font-medium text-slate-700">Exchange Rate</label>
                    {fields.groupId && fields.currency !== (groups.find(g => g.id === fields.groupId)?.baseCurrency ?? 'USD') && (
                      <button
                        type="button"
                        onClick={fetchLiveExchangeRate}
                        disabled={formDisabled || fetchingRate}
                        className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors"
                      >
                        {fetchingRate ? 'Fetching...' : 'Get live rate'}
                      </button>
                    )}
                  </div>
                  <input
                    id="exchangeRate" name="exchangeRate" type="number" step="0.0001" value={fields.exchangeRate}
                    onChange={handleFieldChange} disabled={formDisabled || fetchingRate} className={inputCls}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Conversion to group base currency</p>
                </div>
              </div>
            </div>
          )}

          {/* Splits */}
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-700">Splits</h3>
              <button
                type="button"
                onClick={splitEqually}
                disabled={formDisabled || !fields.groupId || parseFloat(fields.amount) <= 0 || splits.length === 0}
                className="text-xs font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Split equally
              </button>
            </div>

            <div className="p-5 space-y-4">
              {splits.map((split, index) => {
                const usedInOtherRows = new Set(
                  splits.filter((_, i) => i !== index).map(s => s.userId).filter(Boolean)
                );
                return (
                  <div key={split.id} className="flex gap-3 items-start">
                    <div className="flex-1 min-w-0">
                      <label htmlFor={`split-userId-${index}`} className="block text-xs font-medium text-slate-600 mb-1.5">
                        Person
                      </label>
                      <select
                        id={`split-userId-${index}`}
                        value={split.userId}
                        onChange={e => handleSplitChange(index, 'userId', e.target.value)}
                        disabled={formDisabled || membersLoading || !fields.groupId}
                        className={selectCls}
                      >
                        <option value="">
                          {!fields.groupId ? 'Select a group first' : membersError ? 'Error loading' : 'Select person'}
                        </option>
                        {members
                          .filter(m => !usedInOtherRows.has(m.id))
                          .map(member => (
                            <option key={member.id} value={member.id}>
                              {member.id === currentUser?.id ? `${member.name} (you)` : member.name}
                            </option>
                          ))}
                      </select>
                      {errors.splitRows?.[index]?.userId && (
                        <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.splitRows[index].userId}</p>
                      )}
                    </div>

                    <div className="w-28 shrink-0">
                      <label htmlFor={`split-amount-${index}`} className="block text-xs font-medium text-slate-600 mb-1.5">
                        Amount
                      </label>
                      <input
                        id={`split-amount-${index}`}
                        type="number" min="0.01" step="0.01" value={split.amount}
                        onChange={e => handleSplitChange(index, 'amount', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        disabled={formDisabled} className={inputCls} placeholder="0.00"
                      />
                      {errors.splitRows?.[index]?.amount && (
                        <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.splitRows[index].amount}</p>
                      )}
                    </div>

                    {splits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSplit(index)}
                        disabled={formDisabled}
                        className="mt-[22px] text-xs font-medium text-rose-500 hover:text-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 pb-4">
              <button
                type="button" onClick={addSplit}
                disabled={formDisabled || !fields.groupId || splits.length >= members.length}
                className="text-sm font-semibold text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add split
              </button>

              {errors.splitTotal && (
                <p role="alert" className="mt-3 text-xs text-rose-600">{errors.splitTotal}</p>
              )}
            </div>
          </div>

          {apiError && (
            <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3 mb-4">
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
              type="submit" disabled={formDisabled}
              className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.99] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding…' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
