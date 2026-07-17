import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, formatRelativeDate } from '../lib/api'
import type { VaultCredential, WorkspaceRole } from '../types'
import { Icon } from './Icon'

type CredentialForm = { serviceName: string; websiteUrl: string; loginUsername: string; loginEmail: string; password: string; notes: string }
const emptyForm: CredentialForm = { serviceName: '', websiteUrl: '', loginUsername: '', loginEmail: '', password: '', notes: '' }

export function CredentialsPanel({ role }: { role: WorkspaceRole }) {
  const [credentials, setCredentials] = useState<VaultCredential[]>([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<CredentialForm>(emptyForm)
  const [editing, setEditing] = useState<VaultCredential | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [revealTarget, setRevealTarget] = useState<VaultCredential | null>(null)
  const [accountPassword, setAccountPassword] = useState('')
  const [revealed, setRevealed] = useState<{ password: string; notes: string } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (role !== 'admin') return
    try {
      const result = await api<{ credentials: VaultCredential[] }>(`vault.credentials.list&q=${encodeURIComponent(query)}`)
      setCredentials(result.credentials)
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not load credentials.') }
  }, [query, role])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])

  if (role !== 'admin') return <div className="vault-content"><div className="restricted-panel"><span><Icon name="vault" size={27}/></span><h2>Administrator access required</h2><p>Stored credentials are restricted to Workspace administrators.</p></div></div>

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); setMessage('') }
  const openEdit = (credential: VaultCredential) => {
    setEditing(credential)
    setForm({ serviceName: credential.serviceName, websiteUrl: credential.websiteUrl, loginUsername: credential.loginUsername, loginEmail: credential.loginEmail, password: '', notes: '' })
    setFormOpen(true); setMessage('')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true)
    const payload: Record<string, unknown> = { serviceName: form.serviceName, websiteUrl: form.websiteUrl, loginUsername: form.loginUsername, loginEmail: form.loginEmail }
    if (!editing || form.password) payload.password = form.password
    if (!editing || form.notes) payload.notes = form.notes
    if (editing) payload.id = editing.id
    try {
      await api(editing ? 'vault.credentials.update' : 'vault.credentials.create', { method: 'POST', body: JSON.stringify(payload) })
      setFormOpen(false); setForm(emptyForm); setEditing(null); setMessage(editing ? 'Credential updated.' : 'Credential stored securely.'); await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not save credential.') }
    finally { setBusy(false) }
  }

  const reveal = async (event: React.FormEvent) => {
    event.preventDefault(); if (!revealTarget) return; setBusy(true)
    try {
      const result = await api<{ secret: { password: string; notes: string } }>('vault.credentials.reveal', { method: 'POST', body: JSON.stringify({ id: revealTarget.id, accountPassword }) })
      setRevealed(result.secret); setAccountPassword(''); setMessage('Credential revealed for 30 seconds.')
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => { setRevealed(null); setRevealTarget(null) }, 30000)
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not reveal credential.') }
    finally { setBusy(false) }
  }

  const remove = async (credential: VaultCredential) => {
    if (!window.confirm(`Delete the stored credential for “${credential.serviceName}”?`)) return
    try { await api('vault.credentials.delete', { method: 'POST', body: JSON.stringify({ id: credential.id }) }); setMessage('Credential deleted.'); await load() }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not delete credential.') }
  }

  const copyPassword = async () => {
    if (!revealed) return
    try { await navigator.clipboard.writeText(revealed.password); setMessage('Password copied to the clipboard.') }
    catch { setMessage('Clipboard access was blocked. Select and copy the password manually.') }
  }

  return <div className="vault-content credential-content">
    <header className="vault-header"><div><span className="mono-label">Workspace / Vault / Credentials</span><h1>Tool credentials</h1></div><div className="vault-header-actions"><button className="primary-button" onClick={openCreate}><Icon name="vault"/>Add credential</button></div></header>
    {message && <button className="notice" onClick={() => setMessage('')}>{message}<Icon name="close" size={14}/></button>}
    <div className="vault-toolbar"><label className="vault-search"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services, usernames or emails…"/></label><span className="credential-security-label">Admin only · encrypted fields</span></div>
    <div className="credential-list">
      {credentials.length ? credentials.map((credential) => <article className="credential-card" key={credential.id}>
        <div className="credential-mark"><Icon name="vault" size={20}/></div>
        <div className="credential-primary"><span className="mono-label">Service credential</span><h2>{credential.serviceName}</h2><p>{credential.loginUsername || 'No username'}{credential.loginEmail ? ` · ${credential.loginEmail}` : ''}</p>{credential.websiteUrl && <a href={credential.websiteUrl} target="_blank" rel="noreferrer">{credential.websiteUrl}</a>}</div>
        <div className="credential-meta"><span>Updated {formatRelativeDate(credential.updatedAt)}</span><small>{credential.hasNotes ? 'Secure notes included' : 'No secure notes'}</small></div>
        <div className="credential-actions"><button className="primary-button" onClick={() => { setRevealTarget(credential); setRevealed(null); setAccountPassword('') }}>Reveal</button><button className="icon-button" onClick={() => openEdit(credential)} aria-label={`Edit ${credential.serviceName}`}><Icon name="edit"/></button><button className="icon-button" onClick={() => void remove(credential)} aria-label={`Delete ${credential.serviceName}`}><Icon name="trash"/></button></div>
      </article>) : <div className="empty-vault"><span><Icon name="vault" size={27}/></span><h3>No credentials stored</h3><p>Add the first tool or website login.</p><button className="secondary-button" onClick={openCreate}>Add credential</button></div>}
    </div>

    {formOpen && <div className="modal-backdrop" onMouseDown={() => setFormOpen(false)}><form className="workspace-modal credential-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="mono-label">Encrypted record</span><h2>{editing ? 'Edit credential' : 'Add credential'}</h2></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)}><Icon name="close"/></button></header>
      <label><span>Tool or website</span><input autoFocus required maxLength={100} value={form.serviceName} onChange={(event) => setForm({...form,serviceName:event.target.value})} placeholder="e.g. Vercel"/></label>
      <label><span>Website URL</span><input type="url" maxLength={500} value={form.websiteUrl} onChange={(event) => setForm({...form,websiteUrl:event.target.value})} placeholder="https://example.com"/></label>
      <div className="form-split"><label><span>Username</span><input maxLength={320} value={form.loginUsername} onChange={(event) => setForm({...form,loginUsername:event.target.value})}/></label><label><span>Email</span><input type="email" maxLength={320} value={form.loginEmail} onChange={(event) => setForm({...form,loginEmail:event.target.value})}/></label></div>
      <label><span>Password {editing && '(leave blank to keep current)'}</span><input type="password" required={!editing} maxLength={2000} autoComplete="new-password" value={form.password} onChange={(event) => setForm({...form,password:event.target.value})}/></label>
      <label><span>Secure notes {editing && '(leave blank to keep current)'}</span><textarea maxLength={5000} rows={4} value={form.notes} onChange={(event) => setForm({...form,notes:event.target.value})} placeholder="Recovery codes, account context, or instructions"/></label>
      <footer><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Encrypting…' : 'Save encrypted credential'}</button></footer>
    </form></div>}

    {revealTarget && <div className="modal-backdrop" onMouseDown={() => { setRevealTarget(null); setRevealed(null) }}><form className="workspace-modal credential-modal" onSubmit={reveal} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="mono-label">Protected reveal</span><h2>{revealTarget.serviceName}</h2></div><button type="button" className="icon-button" onClick={() => { setRevealTarget(null); setRevealed(null) }}><Icon name="close"/></button></header>
      {revealed ? <><label><span>Password</span><div className="revealed-secret"><input readOnly value={revealed.password}/><button type="button" onClick={() => void copyPassword()}><Icon name="copy"/>Copy</button></div></label>{revealed.notes && <label><span>Secure notes</span><textarea readOnly rows={5} value={revealed.notes}/></label>}<p className="credential-warning">This view closes automatically after 30 seconds. Clear your clipboard after use.</p></>
      : <><p className="credential-explainer">Re-enter your Workspace password to reveal this credential. The reveal will be recorded in Vault activity.</p><label><span>Current Workspace password</span><input autoFocus required type="password" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)}/></label><footer><button type="button" className="secondary-button" onClick={() => setRevealTarget(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Verifying…' : 'Reveal for 30 seconds'}</button></footer></>}
    </form></div>}
  </div>
}
