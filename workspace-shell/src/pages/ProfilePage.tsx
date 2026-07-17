import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../lib/api'

export function ProfilePage() {
  const { user, refresh } = useAuth()
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setUsername(user?.username || ''); setEmail(user?.email || '') }, [user])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true)
    try { await api('profile.update', { method: 'POST', body: JSON.stringify({ username, email }) }); await refresh(); setMessage('Profile updated.') }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not update profile.') }
    finally { setBusy(false) }
  }

  return <section className="standard-page profile-page"><header className="page-header"><div><span className="mono-label">Account / personal details</span><h1>Your profile.</h1></div></header>
    {message && <button className="notice" onClick={() => setMessage('')}>{message}<Icon name="close" size={14}/></button>}
    <div className="settings-layout"><aside><span className="large-avatar">{user?.username.slice(0, 2).toUpperCase()}</span><h2>{user?.username}</h2><p>{user?.email}</p><b>{user?.role}</b></aside><form className="settings-card" onSubmit={submit}><span className="mono-label">Identity</span><h2>Personal information</h2><p>Used across Workspace and Vault ownership records.</p><label><span>Username</span><input required minLength={2} value={username} onChange={(event) => setUsername(event.target.value)}/></label><label><span>Email address</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form></div>
  </section>
}

