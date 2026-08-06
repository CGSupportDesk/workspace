import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { CredentialsPanel } from '../components/CredentialsPanel'
import { AssetsPanel } from '../components/AssetsPanel'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, formatBytes, formatRelativeDate } from '../lib/api'
import type { VaultActivity, VaultDocument, VaultFolder, VaultVersion, VaultVisibility } from '../types'

type VaultData = { documents: VaultDocument[]; folders: VaultFolder[]; owners: { id: string; username: string }[] }
const categories = ['SOP', 'Contract', 'Template', 'Policy', 'Proposal', 'Brand asset', 'Company record', 'Client', 'Recruitment', 'Financial', 'Operational']

export function VaultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const uploadRef = useRef<HTMLInputElement>(null)
  const versionRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<VaultData>({ documents: [], folders: [], owners: [] })
  const [activity, setActivity] = useState<VaultActivity[]>([])
  const [versions, setVersions] = useState<VaultVersion[]>([])
  const [selected, setSelected] = useState<VaultDocument | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [owner, setOwner] = useState('')
  const [modified, setModified] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('list')
  const [modal, setModal] = useState<'folder' | 'upload' | null>(null)
  const [folderName, setFolderName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState('SOP')
  const [uploadVisibility, setUploadVisibility] = useState<VaultVisibility>('workspace')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const section = location.pathname.split('/')[2] || 'documents'
  const queryString = new URLSearchParams({ section, q: query, category, owner, modified }).toString()

  const load = useCallback(async () => {
    try {
      const [records, logs] = await Promise.all([
        api<VaultData>(`vault.list&${queryString}`),
        api<{ activity: VaultActivity[] }>('vault.activity'),
      ])
      setData(records)
      setActivity(logs.activity)
      const requested = searchParams.get('document')
      if (requested) setSelected(records.documents.find((item) => item.id === requested) || null)
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : 'Could not load Vault.')
    }
  }, [queryString, searchParams])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (searchParams.get('upload') === '1') setModal('upload') }, [searchParams])
  useEffect(() => {
    if (!selected) { setVersions([]); return }
    void api<{ versions: VaultVersion[] }>(`vault.versions&id=${selected.id}`).then((result) => setVersions(result.versions)).catch(() => setVersions([]))
  }, [selected])

  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!folderName.trim()) return
    setBusy(true)
    try {
      await api('vault.folder.create', { method: 'POST', body: JSON.stringify({ name: folderName.trim(), visibility: uploadVisibility }) })
      setFolderName(''); setModal(null); setMessage('Folder created.'); await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not create folder.') }
    finally { setBusy(false) }
  }

  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!uploadFile) return
    const body = new FormData()
    body.append('file', uploadFile)
    body.append('category', uploadCategory)
    body.append('visibility', uploadVisibility)
    setBusy(true)
    try {
      await api('vault.document.upload', { method: 'POST', body })
      setUploadFile(null); setModal(null); setMessage('Document uploaded securely.'); await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not upload document.') }
    finally { setBusy(false) }
  }

  const documentAction = async (action: string, document: VaultDocument, payload: Record<string, unknown> = {}) => {
    if (action === 'download' || action === 'preview') {
      window.open(`/api/index.php?action=vault.document.${action}&id=${encodeURIComponent(document.id)}`, '_blank', 'noopener,noreferrer')
      return
    }
    if (action === 'delete' && !window.confirm(`Delete “${document.name}”? This cannot be undone.`)) return
    try {
      await api(`vault.document.${action}`, { method: 'POST', body: JSON.stringify({ id: document.id, ...payload }) })
      setSelected(null); setMessage(action === 'copy' ? 'Document copied.' : 'Vault updated.'); await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Action failed.') }
  }

  const folderAction = async (action: 'rename' | 'delete', folder: VaultFolder) => {
    const name = action === 'rename' ? window.prompt('New folder name', folder.name) : null
    if (action === 'rename' && !name?.trim()) return
    if (action === 'delete' && !window.confirm(`Delete “${folder.name}”? The folder must be empty.`)) return
    try {
      await api(`vault.folder.${action}`, { method: 'POST', body: JSON.stringify({ id: folder.id, name: name?.trim() }) })
      setMessage(action === 'rename' ? 'Folder renamed.' : 'Folder deleted.'); await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Folder action failed.') }
  }

  const uploadVersion = async (file: File | null) => {
    if (!file || !selected) return
    const body = new FormData(); body.append('id', selected.id); body.append('file', file)
    try { await api('vault.document.version', { method: 'POST', body }); setMessage('New document version uploaded.'); setSelected(null); await load() }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not upload the new version.') }
  }

  const visibleFolders = useMemo(() => data.folders, [data.folders])
  const visibleDocuments = useMemo(() => data.documents, [data.documents])

  if (section === 'credentials' || section === 'assets') return <section className="vault-page">
    <aside className="vault-sidebar">
      <div className="vault-title"><span className="vault-mark"><Icon name="vault" size={19}/></span><div><strong>Vault</strong><small>Knowledge system</small></div></div>
      <nav>
        <span className="sidebar-label">Library</span>
        <NavLink to="/vault/documents"><Icon name="file"/>Documents</NavLink><NavLink to="/vault/folders"><Icon name="folder"/>Folders</NavLink><NavLink to="/vault/favourites"><Icon name="star"/>Favourites</NavLink><NavLink to="/vault/recent"><Icon name="clock"/>Recent</NavLink><NavLink to="/vault/shared"><Icon name="share"/>Shared</NavLink>
        <span className="sidebar-label">Manage</span>
        {user?.role === 'admin' && <><NavLink to="/vault/assets"><Icon name="asset"/>Assets</NavLink><NavLink to="/vault/credentials"><Icon name="vault"/>Credentials</NavLink></>}
        <NavLink to="/vault/users"><Icon name="users"/>People & access</NavLink><NavLink to="/vault/settings"><Icon name="settings"/>Vault settings</NavLink>
      </nav>
      <div className="storage-meter"><div><span>{section === 'assets' ? 'Asset control' : 'Credential security'}</span><strong>ADMIN</strong></div><i><b style={{width:'100%'}}/></i><small>{section === 'assets' ? 'Company property register' : 'Encrypted application fields'}</small></div>
    </aside>
    {section === 'assets' ? <AssetsPanel role={user?.role || 'member'}/> : <CredentialsPanel role={user?.role || 'member'}/>}
  </section>

  return <section className="vault-page">
    <aside className="vault-sidebar">
      <div className="vault-title"><span className="vault-mark"><Icon name="vault" size={19}/></span><div><strong>Vault</strong><small>Knowledge system</small></div></div>
      <nav>
        <span className="sidebar-label">Library</span>
        <NavLink to="/vault/documents"><Icon name="file"/>Documents</NavLink>
        <NavLink to="/vault/folders"><Icon name="folder"/>Folders</NavLink>
        <NavLink to="/vault/favourites"><Icon name="star"/>Favourites</NavLink>
        <NavLink to="/vault/recent"><Icon name="clock"/>Recent</NavLink>
        <NavLink to="/vault/shared"><Icon name="share"/>Shared</NavLink>
        <span className="sidebar-label">Manage</span>
        {user?.role === 'admin' && <><NavLink to="/vault/assets"><Icon name="asset"/>Assets</NavLink><NavLink to="/vault/credentials"><Icon name="vault"/>Credentials</NavLink></>}
        <NavLink to="/vault/users"><Icon name="users"/>People & access</NavLink>
        <NavLink to="/vault/settings"><Icon name="settings"/>Vault settings</NavLink>
      </nav>
      <div className="storage-meter"><div><span>Workspace storage</span><strong>{formatBytes(data.documents.reduce((sum, item) => sum + item.fileSize, 0))}</strong></div><i><b style={{ width: `${Math.min(100, data.documents.reduce((sum, item) => sum + item.fileSize, 0) / 1024 / 1024 / 10)}%` }}/></i><small>Secure local storage</small></div>
    </aside>
    <div className="vault-content">
      <header className="vault-header">
        <div><span className="mono-label">Workspace / Vault / {section}</span><h1>{section === 'documents' ? 'All documents' : section[0].toUpperCase() + section.slice(1)}</h1></div>
        <div className="vault-header-actions"><button className="secondary-button" onClick={() => setModal('folder')}><Icon name="folder"/>New folder</button><button className="primary-button" onClick={() => setModal('upload')}><Icon name="upload"/>Upload document</button></div>
      </header>
      {message && <button className="notice" onClick={() => setMessage('')}>{message}<Icon name="close" size={14}/></button>}
      <div className="vault-toolbar">
        <label className="vault-search"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Vault…"/></label>
        <select aria-label="Filter category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filter owner" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">All owners</option>{data.owners.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select>
        <select aria-label="Filter modified date" value={modified} onChange={(event) => setModified(event.target.value)}><option value="">Any time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>
        <div className="view-switch"><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view">☷</button><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Icon name="grid" size={15}/></button></div>
      </div>

      {section === 'users' ? <VaultRedirect title="People & access" copy="Workspace users and roles are managed centrally." action="Open team management" onClick={() => navigate('/team')}/>
      : section === 'settings' ? <VaultRedirect title="Vault settings" copy="Account security and Workspace preferences live in one place." action="Open Workspace settings" onClick={() => navigate('/settings')}/>
      : section === 'recent' ? <ActivityPanel activity={activity}/>
      : <>
        {visibleFolders.length > 0 && <div className="vault-block"><div className="block-heading"><h2>Folders</h2><span>{visibleFolders.length} total</span></div><div className="folder-grid">{visibleFolders.map((folder) => <div className="folder-card" key={folder.id}><button className="folder-open" onClick={() => navigate(`/vault/folders?folder=${folder.id}`)}><span className="folder-icon"><Icon name="folder" size={24}/></span><span><strong>{folder.name}</strong><small>{folder.visibility} · {folder.ownerName}</small></span></button>{(folder.ownerId === user?.id || user?.role === 'admin') && <span className="folder-actions"><button aria-label={`Rename ${folder.name}`} onClick={() => void folderAction('rename', folder)}><Icon name="edit" size={14}/></button><button aria-label={`Delete ${folder.name}`} onClick={() => void folderAction('delete', folder)}><Icon name="trash" size={14}/></button></span>}</div>)}</div></div>}
        <div className="vault-block"><div className="block-heading"><h2>Documents</h2><span>{visibleDocuments.length} total</span></div>
          {visibleDocuments.length ? <div className={`document-${view}`}>
            <div className="document-head"><span>Name</span><span>Category</span><span>Owner</span><span>Modified</span><span>Size</span><span/></div>
            {visibleDocuments.map((document) => <button className="document-row" key={document.id} onClick={() => setSelected(document)}>
              <span className="document-name"><i className={`file-badge type-${document.fileType.split('/').pop()?.replace(/[^a-z]/gi, '')}`}><Icon name="file" size={18}/></i><span><strong>{document.name}</strong><small>v{document.version} · {document.visibility}</small></span></span>
              <span><b className="category-pill">{document.category}</b></span><span>{document.ownerName}</span><span>{formatRelativeDate(document.updatedAt)}</span><span>{formatBytes(document.fileSize)}</span><span>{document.favourite && <Icon name="star" size={15} filled/>}<Icon name="chevron" size={15}/></span>
            </button>)}
          </div> : <EmptyVault onUpload={() => setModal('upload')}/>}</div>
      </>}
    </div>

    {selected && <div className="drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="document-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <header><div className="drawer-file-icon"><Icon name="file" size={25}/></div><button className="icon-button" onClick={() => setSelected(null)}><Icon name="close"/></button></header>
      <span className="mono-label">Document details</span><h2>{selected.name}</h2><p>{selected.fileType} · {formatBytes(selected.fileSize)}</p>
      <div className="drawer-actions"><button onClick={() => void documentAction('preview', selected)}><Icon name="file"/>Preview</button><button onClick={() => void documentAction('download', selected)}><Icon name="download"/>Download</button><button onClick={() => void documentAction('copy', selected)}><Icon name="copy"/>Copy</button><button onClick={() => void documentAction('update', selected, { favourite: !selected.favourite })}><Icon name="star"/>{selected.favourite ? 'Unfavourite' : 'Favourite'}</button>{(selected.ownerId === user?.id || user?.role === 'admin') && <button onClick={() => versionRef.current?.click()}><Icon name="upload"/>New version</button>}<input ref={versionRef} hidden type="file" onChange={(event) => void uploadVersion(event.target.files?.[0] || null)}/></div>
      {(selected.ownerId === user?.id || user?.role === 'admin') && <label className="drawer-move"><span>Move to folder</span><select value={selected.folderId || ''} onChange={(event) => void documentAction('update', selected, { folderId: event.target.value || null })}><option value="">Vault root</option>{data.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
      <dl><div><dt>Category</dt><dd>{selected.category}</dd></div><div><dt>Owner</dt><dd>{selected.ownerName}</dd></div><div><dt>Visibility</dt><dd>{selected.visibility}</dd></div><div><dt>Modified</dt><dd>{new Date(selected.updatedAt.replace(' ', 'T') + 'Z').toLocaleString()}</dd></div></dl>
      <div className="version-list"><h3>Version history</h3>{versions.map((version) => <div key={version.id}><i/><span><strong>Version {version.version}</strong><small>{version.createdByName} · {formatRelativeDate(version.createdAt)}</small></span><small>{formatBytes(version.fileSize)}</small></div>)}</div>
      {(selected.ownerId === user?.id || user?.role === 'admin') && <button className="danger-button" onClick={() => void documentAction('delete', selected)}><Icon name="trash"/>Delete document</button>}
    </aside></div>}

    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="workspace-modal" onSubmit={modal === 'folder' ? createFolder : upload} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="mono-label">Vault action</span><h2>{modal === 'folder' ? 'Create a folder' : 'Upload a document'}</h2></div><button type="button" className="icon-button" onClick={() => setModal(null)}><Icon name="close"/></button></header>
      {modal === 'folder' ? <label><span>Folder name</span><input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder="e.g. Client contracts" required/></label>
      : <><button type="button" className="upload-drop" onClick={() => uploadRef.current?.click()}><Icon name="upload" size={26}/><strong>{uploadFile ? uploadFile.name : 'Choose a document'}</strong><small>PDF, Office, text, CSV, images or archives · max 20 MB</small></button><input ref={uploadRef} hidden type="file" onChange={(event) => setUploadFile(event.target.files?.[0] || null)}/><label><span>Category</span><select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></>}
      <label><span>Visibility</span><select value={uploadVisibility} onChange={(event) => setUploadVisibility(event.target.value as VaultVisibility)}><option value="workspace">Entire workspace</option><option value="private">Private to me</option><option value="restricted">Owner and admins</option></select></label>
      <footer><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={busy || (modal === 'upload' && !uploadFile)}>{busy ? 'Working…' : modal === 'folder' ? 'Create folder' : 'Upload securely'}</button></footer>
    </form></div>}
  </section>
}

function EmptyVault({ onUpload }: { onUpload: () => void }) {
  return <div className="empty-vault"><span><Icon name="file" size={27}/></span><h3>No documents here yet</h3><p>Upload your first document or change the active filters.</p><button className="secondary-button" onClick={onUpload}>Upload document</button></div>
}

function ActivityPanel({ activity }: { activity: VaultActivity[] }) {
  return <div className="activity-panel"><div className="block-heading"><h2>Recent Vault activity</h2><span>{activity.length} events</span></div>{activity.length ? activity.map((item) => <div className="activity-line" key={item.id}><i/><span><strong>{item.actorName}</strong> {item.action} <b>{item.entityName}</b></span><time>{formatRelativeDate(item.createdAt)}</time></div>) : <p className="empty-inline">Activity will appear as your team works in Vault.</p>}</div>
}

function VaultRedirect({ title, copy, action, onClick }: { title: string; copy: string; action: string; onClick: () => void }) {
  return <div className="vault-redirect"><span><Icon name="users" size={26}/></span><h2>{title}</h2><p>{copy}</p><button className="primary-button" onClick={onClick}>{action}<Icon name="arrow"/></button></div>
}
