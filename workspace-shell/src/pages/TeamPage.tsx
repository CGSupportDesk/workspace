import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, formatRelativeDate } from '../lib/api'
import type { WorkspaceRole, WorkspaceUser } from '../types'

type UserForm = { username: string; email: string; password: string; role: WorkspaceRole; active: boolean }
const emptyForm: UserForm = { username: '', email: '', password: '', role: 'member', active: true }

export function TeamPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [modal, setModal] = useState<'create' | 'edit' | 'password' | null>(null)
  const [selected, setSelected] = useState<WorkspaceUser | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (user?.role !== 'admin') return
    try { setUsers((await api<{ users: WorkspaceUser[] }>('users.list')).users) }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not load users.') }
  }, [user])
  useEffect(() => { void load() }, [load])

  const openCreate = () => { setSelected(null); setForm(emptyForm); setModal('create') }
  const openEdit = (target: WorkspaceUser) => { setSelected(target); setForm({ username: target.username, email: target.email, password: '', role: target.role, active: target.active }); setModal('edit') }
  const openPassword = (target: WorkspaceUser) => { setSelected(target); setForm({ ...emptyForm, password: '' }); setModal('password') }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true)
    try {
      const action = modal === 'create' ? 'users.create' : modal === 'password' ? 'users.reset-password' : 'users.update'
      const payload = modal === 'password' ? { id: selected?.id, password: form.password } : { ...form, id: selected?.id }
      await api(action, { method: 'POST', body: JSON.stringify(payload) })
      setMessage(modal === 'create' ? 'User created.' : 'User updated.'); setModal(null); await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not save user.') }
    finally { setBusy(false) }
  }

  const remove = async (target: WorkspaceUser) => {
    if (!window.confirm(`Delete ${target.username}? Their owned Vault records will be retained.`)) return
    try { await api('users.delete', { method: 'POST', body: JSON.stringify({ id: target.id }) }); setMessage('User deleted.'); await load() }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not delete user.') }
  }

  if (user?.role !== 'admin') return <section className="standard-page"><header className="page-header"><div><span className="mono-label">Team / directory</span><h1>People.</h1></div></header><div className="restricted-panel"><span><Icon name="users" size={28}/></span><h2>Team management is admin-only</h2><p>Your administrator can create accounts, change roles and manage access.</p></div></section>

  return <section className="standard-page team-page">
    <header className="page-header"><div><span className="mono-label">Administration / {users.length} accounts</span><h1>People & access.</h1></div><button className="primary-button" onClick={openCreate}>+ Create user</button></header>
    {message && <button className="notice" onClick={() => setMessage('')}>{message}<Icon name="close" size={14}/></button>}
    <div className="team-table">
      <div className="team-row team-head"><span>User</span><span>Role</span><span>Status</span><span>Created</span><span>Actions</span></div>
      {users.map((item) => <div className="team-row" key={item.id}>
        <span className="team-person"><i>{item.username.slice(0, 2).toUpperCase()}</i><span><strong>{item.username}</strong><small>{item.email}</small></span></span>
        <span><b className="role-badge">{item.role}</b></span><span><b className={`active-badge ${item.active ? '' : 'inactive'}`}><i/>{item.active ? 'Active' : 'Inactive'}</b></span><span>{formatRelativeDate(item.createdAt)}</span>
        <span className="row-actions"><button onClick={() => openEdit(item)} aria-label={`Edit ${item.username}`}><Icon name="edit" size={16}/></button><button onClick={() => openPassword(item)} aria-label={`Reset ${item.username} password`}><Icon name="settings" size={16}/></button><button disabled={item.id === user.id} onClick={() => void remove(item)} aria-label={`Delete ${item.username}`}><Icon name="trash" size={16}/></button></span>
      </div>)}
    </div>
    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="workspace-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="mono-label">Admin action</span><h2>{modal === 'create' ? 'Create a user' : modal === 'password' ? `Reset ${selected?.username}'s password` : `Edit ${selected?.username}`}</h2></div><button type="button" className="icon-button" onClick={() => setModal(null)}><Icon name="close"/></button></header>
      {modal !== 'password' && <><label><span>Username</span><input required minLength={2} maxLength={40} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}/></label><label><span>Email</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label></>}
      {(modal === 'create' || modal === 'password') && <label><span>{modal === 'create' ? 'Temporary password' : 'New password'}</span><input required type="password" minLength={10} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/><small>At least 10 characters with upper, lower and a number.</small></label>}
      {modal !== 'password' && <div className="form-split"><label><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as WorkspaceRole })}><option value="member">Member</option><option value="admin">Admin</option></select></label><label><span>Status</span><select value={form.active ? 'active' : 'inactive'} onChange={(event) => setForm({ ...form, active: event.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>}
      <footer><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button></footer>
    </form></div>}
  </section>
}

