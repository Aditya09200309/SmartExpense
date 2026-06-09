import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useSetCurrentUser } from '../hooks/useCurrentUser'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface LoginResponse {
  token: string
  user: { id: string; name: string; email: string }
}

export default function Login() {
  useDocumentTitle('Sign In');
  const navigate = useNavigate()
  const setCurrentUser = useSetCurrentUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError('')

    let valid = true
    if (!email.trim()) { setEmailError('Email is required.'); valid = false }
    else setEmailError('')
    if (!password) { setPasswordError('Password is required.'); valid = false }
    else setPasswordError('')
    if (!valid) return

    setLoading(true)
    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password })
      localStorage.setItem('token', res.data.token)
      setCurrentUser(res.data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      if (
        typeof err === 'object' && err !== null && 'response' in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
      ) {
        setApiError((err as { response: { data: { error: string } } }).response.data.error)
      } else {
        setApiError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400 transition-[border-color,box-shadow] duration-150'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600 mb-5 shadow-[0_8px_24px_rgba(124,58,237,0.45)]">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Smart Expense</h1>
          <p className="text-slate-400 mt-1.5 text-sm">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-7">
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailError) setEmailError('') }}
                disabled={loading}
                autoComplete="email"
                className={inputCls}
                placeholder="you@example.com"
              />
              {emailError && <p role="alert" className="mt-1.5 text-xs text-rose-600">{emailError}</p>}
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError('') }}
                disabled={loading}
                autoComplete="current-password"
                className={inputCls}
              />
              {passwordError && <p role="alert" className="mt-1.5 text-xs text-rose-600">{passwordError}</p>}
            </div>

            {apiError && (
              <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-3 mb-4">
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.99] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-violet-600 hover:text-violet-700 font-semibold">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
