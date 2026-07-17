import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { workspaceApplications } from '../config/apps'
import { api } from '../lib/api'
import type { VaultDocument, VaultFolder, WorkspaceUser } from '../types'
import { Icon } from './Icon'

type SearchData = { documents: VaultDocument[]; folders: VaultFolder[]; users: WorkspaceUser[] }
type Command = { id: string; label: string; meta: string; icon: 'grid' | 'file' | 'folder' | 'users' | 'upload'; action: () => void }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [remote, setRemote] = useState<SearchData>({ documents: [], folders: [], users: [] })

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      void api<SearchData>(`search&q=${encodeURIComponent(query)}`).then(setRemote).catch(() => undefined)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [open, query])

  const run = (action: () => void) => {
    action()
    onClose()
  }

  const commands = useMemo<Command[]>(() => {
    const appCommands = workspaceApplications.map((app) => ({
      id: `app-${app.id}`,
      label: `Open ${app.name}`,
      meta: app.status,
      icon: 'grid' as const,
      action: () => {
        if (app.route) navigate(app.route)
        else if (app.externalUrl) window.open(app.externalUrl, '_blank', 'noopener,noreferrer')
      },
    }))
    const actions: Command[] = [
      { id: 'upload', label: 'Upload a document', meta: 'Vault', icon: 'upload', action: () => navigate('/vault?upload=1') },
      { id: 'task', label: 'Create a task', meta: 'To-Do', icon: 'grid', action: () => navigate('/todo') },
      { id: 'invoice', label: 'Create an invoice', meta: 'Finora', icon: 'grid', action: () => workspaceApplications[2].externalUrl && window.open(workspaceApplications[2].externalUrl, '_blank') },
      { id: 'lead', label: 'Add a lead', meta: 'Growth Engine · coming soon', icon: 'grid', action: () => undefined },
      { id: 'candidate', label: 'Add a candidate', meta: 'TruHyre · coming soon', icon: 'users', action: () => undefined },
    ]
    const dynamic: Command[] = [
      ...remote.documents.map((document) => ({ id: `doc-${document.id}`, label: document.name, meta: `Document · ${document.category}`, icon: 'file' as const, action: () => navigate(`/vault?document=${document.id}`) })),
      ...remote.folders.map((folder) => ({ id: `folder-${folder.id}`, label: folder.name, meta: 'Vault folder', icon: 'folder' as const, action: () => navigate(`/vault/folders?folder=${folder.id}`) })),
      ...remote.users.map((user) => ({ id: `user-${user.id}`, label: user.username, meta: user.email, icon: 'users' as const, action: () => navigate('/team') })),
    ]
    const all = [...appCommands, ...actions, ...dynamic]
    if (!query) return all
    const needle = query.toLowerCase()
    return all.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(needle))
  }, [navigate, query, remote])

  useEffect(() => setActive(0), [query])

  if (!open) return null
  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search Workspace" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps, documents, people…"
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, commands.length - 1)) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)) }
              if (event.key === 'Enter' && commands[active]) run(commands[active].action)
            }}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-results">
          <span className="palette-heading">{query ? 'Search results' : 'Quick access'}</span>
          {commands.length ? commands.map((command, index) => (
            <button key={command.id} className={active === index ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => run(command.action)}>
              <span className="palette-icon"><Icon name={command.icon} size={17} /></span>
              <span><strong>{command.label}</strong><small>{command.meta}</small></span>
              <kbd>↵</kbd>
            </button>
          )) : <div className="empty-search">No matching tools or records.</div>}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span></footer>
      </section>
    </div>
  )
}
