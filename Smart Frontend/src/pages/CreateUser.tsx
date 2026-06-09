import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { invalidate } from '../lib/invalidate';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FormFields {
  name: string;
  email: string;
  password: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(fields: FormFields): FormErrors {
  const errors: FormErrors = {};
  if (!fields.name.trim()) errors.name = 'Name is required.';
  if (!fields.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_REGEX.test(fields.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!fields.password) {
    errors.password = 'Password is required.';
  } else if (fields.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  return errors;
}

export default function CreateUser() {
  const location = useLocation();
  const isPublicRegister = location.pathname === '/register';

  useDocumentTitle(isPublicRegister ? 'Create Account' : 'New User');

  const [fields, setFields] = useState<FormFields>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [apiError, setApiError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFields(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess('');
    setApiError('');
    const validationErrors = validate(fields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      await api.post('/users', fields);
      setSuccess(isPublicRegister ? 'Account created! You can now sign in.' : 'User account created successfully.');
      // New user should appear in the AddMember user selector immediately.
      if (!isPublicRegister) invalidate({ resource: 'users' });
      setFields({ name: '', email: '', password: '' });
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

  const form = (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
        <input id="name" name="name" type="text" value={fields.name} onChange={handleChange}
          disabled={loading} autoComplete="name" className={inputCls} placeholder="Jane Smith" />
        {errors.name && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.name}</p>}
      </div>

      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
        <input id="email" name="email" type="email" value={fields.email} onChange={handleChange}
          disabled={loading} autoComplete="email" className={inputCls} placeholder="jane@example.com" />
        {errors.email && <p role="alert" className="mt-1.5 text-xs text-rose-600">{errors.email}</p>}
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
        <input id="password" name="password" type="password" value={fields.password} onChange={handleChange}
          disabled={loading} autoComplete={isPublicRegister ? 'new-password' : 'off'} className={inputCls} />
        <p className="mt-1.5 text-xs text-slate-400">At least 8 characters.</p>
        {errors.password && <p role="alert" className="mt-1 text-xs text-rose-600">{errors.password}</p>}
      </div>

      {apiError && (
        <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3 mb-4">
          {apiError}
        </div>
      )}
      {success && (
        <div role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-xl px-4 py-3 mb-4">
          <p>{success}</p>
          {isPublicRegister && (
            <Link to="/login" className="mt-1.5 inline-block font-semibold text-emerald-800 underline underline-offset-2">
              Go to Sign In →
            </Link>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.99] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating…' : isPublicRegister ? 'Create Account' : 'Create User'}
      </button>
    </form>
  );

  if (isPublicRegister) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600 mb-5 shadow-[0_8px_24px_rgba(124,58,237,0.45)]">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Smart Expense</h1>
            <p className="text-slate-400 mt-1.5 text-sm">Create your account</p>
          </div>
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-7">
            {form}
            <p className="mt-5 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="text-violet-600 hover:text-violet-700 font-semibold">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-slate-900 border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <h1 className="text-2xl font-bold text-white tracking-tight">New User</h1>
          <p className="text-slate-400 mt-2 text-sm">Create an account for a team member or colleague.</p>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7">
          {form}
        </div>
      </div>
    </div>
  );
}
