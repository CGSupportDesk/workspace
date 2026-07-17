import { useState } from 'react'
import { Icon } from '../components/Icon'
import { api, ApiError } from '../lib/api'

export function SettingsPage() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password !== confirm) { setMessage('The new passwords do not match.'); return }
    setBusy(true)
    try { await api('profile.password', { method: 'POST', body: JSON.stringify({ current, password }) }); setCurrent(''); setPassword(''); setConfirm(''); setMessage('Password updated.') }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not change password.') }
    finally { setBusy(false) }
  }

  return <section className="standard-page settings-page"><header className="page-header"><div><span className="mono-label">Workspace / settings</span><h1>Settings.</h1></div></header>
    {message && <button className="notice" onClick={() => setMessage('')}>{message}<Icon name="close" size={14}/></button>}
    <div className="settings-layout"><aside className="settings-nav"><button className="active"><Icon name="settings"/>Security</button><button disabled><Icon name="activity"/>Notifications <small>Soon</small></button><button disabled><Icon name="grid"/>Appearance <small>Soon</small></button></aside><form className="settings-card" onSubmit={submit}><span className="mono-label">Security / password</span><h2>Change password</h2><p>Use at least 10 characters, including uppercase, lowercase and a number.</p><label><span>Current password</span><input type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)}/></label><label><span>New password</span><input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)}/></label><label><span>Confirm new password</span><input type="password" autoComplete="new-password" required minLength={10} value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form></div>
  </section>
}

