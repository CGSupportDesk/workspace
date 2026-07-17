import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { Icon } from '../components/Icon'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => setError(''), [identity, password])
  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!identity.trim() || !password) {
      setError('Enter your username or email and password.')
      return
    }
    setSubmitting(true)
    try {
      await login(identity.trim(), password)
      const destination = (location.state as { from?: string } | null)?.from || '/'
      navigate(destination, { replace: true })
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Unable to sign in. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <div className="login-grid" />
        <div className="login-orbit orbit-one" />
        <div className="login-orbit orbit-two" />
        <div className="login-wordmark"><span>W</span></div>
        <div className="login-caption"><i /> SYSTEM ACCESS / 01</div>
        <div className="login-statement">Everything your team needs,<br/><em>in one orbit.</em></div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <header>
            <div className="login-brand"><span className="brand-sigil">W</span> Workspace<sup>®</sup></div>
            <span className="secure-label">Secure gateway <i /></span>
          </header>
          <div className="login-copy">
            <span className="mono-label">Welcome back / Closing Gap</span>
            <h1>Sign in to<br/>your workspace.</h1>
            <p>One account for projects, finance, knowledge and everything that comes next.</p>
          </div>
          <form onSubmit={submit} noValidate>
            <label>
              <span>Username or email</span>
              <input autoComplete="username" value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="you@theclosinggap.net" />
            </label>
            <label>
              <span>Password</span>
              <div className="password-field">
                <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
                <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Enter Workspace <Icon name="arrow" size={18} /></>}</button>
          </form>
          <footer><span>Protected by encrypted, HttpOnly sessions.</span><span>© {new Date().getFullYear()} Closing Gap</span></footer>
        </div>
      </section>
    </main>
  )
}

