import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { VaultAsset, VaultAssetStatus, VaultAssetType, WorkspaceRole } from '../types'
import { Icon } from './Icon'

type AssetForm = {
  assetType: VaultAssetType
  name: string
  identifier: string
  registeredOwner: string
  currentOwner: string
  provider: string
  status: VaultAssetStatus
  monthlyCost: string
  renewalDay: string
  location: string
  notes: string
}

const emptyForm: AssetForm = { assetType: 'sim', name: '', identifier: '', registeredOwner: '', currentOwner: '', provider: '', status: 'active', monthlyCost: '', renewalDay: '', location: '', notes: '' }
const assetTypes: Array<{ value: VaultAssetType; label: string }> = [
  { value: 'sim', label: 'SIM' }, { value: 'phone', label: 'Phone' }, { value: 'laptop', label: 'Laptop' },
  { value: 'tablet', label: 'Tablet' }, { value: 'accessory', label: 'Accessory' }, { value: 'software', label: 'Software' }, { value: 'other', label: 'Other' },
]
const statuses: Array<{ value: VaultAssetStatus; label: string }> = [
  { value: 'active', label: 'Active' }, { value: 'spare', label: 'Spare' }, { value: 'inactive', label: 'Inactive' },
  { value: 'repair', label: 'Under repair' }, { value: 'lost', label: 'Lost' }, { value: 'retired', label: 'Retired' },
]

const typeLabel = (value: VaultAssetType) => assetTypes.find((item) => item.value === value)?.label || value
const statusLabel = (value: VaultAssetStatus) => statuses.find((item) => item.value === value)?.label || value
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function displayIdentifier(asset: VaultAsset) {
  if (asset.assetType !== 'sim' || !/^\+91\d{10}$/.test(asset.identifier)) return asset.identifier
  const digits = asset.identifier.slice(3)
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
}

export function AssetsPanel({ role }: { role: WorkspaceRole }) {
  const [assets, setAssets] = useState<VaultAsset[]>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<VaultAsset | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<AssetForm>(emptyForm)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (role !== 'admin') return
    try {
      const params = new URLSearchParams({ q: query, type, status })
      const result = await api<{ assets: VaultAsset[] }>(`vault.assets.list&${params}`)
      setAssets(result.assets)
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not load the asset register.') }
  }, [query, role, status, type])

  useEffect(() => { const timer = window.setTimeout(() => { void load() }, 150); return () => window.clearTimeout(timer) }, [load])

  const summary = useMemo(() => ({
    total: assets.length,
    active: assets.filter((asset) => asset.status === 'active').length,
    unassigned: assets.filter((asset) => !asset.currentOwner).length,
    monthly: assets.reduce((sum, asset) => sum + asset.monthlyCost, 0),
  }), [assets])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true) }
  const openEdit = (asset: VaultAsset) => {
    setEditing(asset)
    setForm({ assetType:asset.assetType,name:asset.name,identifier:asset.identifier,registeredOwner:asset.registeredOwner,currentOwner:asset.currentOwner,provider:asset.provider,status:asset.status,monthlyCost:asset.monthlyCost ? String(asset.monthlyCost) : '',renewalDay:asset.renewalDay ? String(asset.renewalDay) : '',location:asset.location,notes:asset.notes })
    setFormOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();setBusy(true)
    try {
      await api(editing ? 'vault.assets.update' : 'vault.assets.create', { method: 'POST', body: JSON.stringify({ ...form, id: editing?.id, monthlyCost: form.monthlyCost || 0, renewalDay: form.renewalDay || null }) })
      setMessage(editing ? 'Asset updated.' : 'Asset added.');setFormOpen(false);setEditing(null);await load()
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not save the asset.') }
    finally { setBusy(false) }
  }

  const remove = async (asset: VaultAsset) => {
    if (!window.confirm(`Delete “${asset.name}” from the asset register?`)) return
    try { await api('vault.assets.delete', { method: 'POST', body: JSON.stringify({ id: asset.id }) });setMessage('Asset deleted.');await load() }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : 'Could not delete the asset.') }
  }

  if (role !== 'admin') return <div className="vault-content"><div className="restricted-panel"><span><Icon name="asset" size={27}/></span><h2>Administrator access required</h2><p>The Asset Register contains company identifiers and assignment details.</p></div></div>

  return <div className="vault-content asset-content">
    <header className="vault-header"><div><span className="mono-label">Workspace / Vault / Assets</span><h1>Asset Register</h1></div><div className="vault-header-actions"><button className="primary-button" onClick={openCreate}><Icon name="asset"/>Add asset</button></div></header>
    {message && <button className="notice" onClick={() => setMessage('')}>{message}<Icon name="close" size={14}/></button>}
    <div className="asset-summary">
      <div><small>Registered assets</small><strong>{summary.total}</strong></div><div><small>Active</small><strong>{summary.active}</strong></div><div><small>Unassigned</small><strong>{summary.unassigned}</strong></div><div><small>Monthly committed</small><strong>{money.format(summary.monthly)}</strong></div>
    </div>
    <div className="asset-toolbar">
      <label className="vault-search"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search number, owner, provider…"/></label>
      <select aria-label="Filter asset type" value={type} onChange={(event) => setType(event.target.value)}><option value="">All asset types</option>{assetTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <select aria-label="Filter asset status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </div>
    <div className="asset-table" role="table" aria-label="Company assets">
      <div className="asset-row asset-head" role="row"><span>Asset</span><span>Identifier</span><span>Registered owner</span><span>Current owner</span><span>Provider</span><span>Status</span><span>Monthly cost</span><span>Recharge</span><span>Actions</span></div>
      {assets.map((asset) => <div className="asset-row" role="row" key={asset.id}>
        <span className="asset-primary" data-label="Asset"><i><Icon name="asset" size={17}/></i><span><strong>{asset.name}</strong><small>{typeLabel(asset.assetType)}{asset.location ? ` · ${asset.location}` : ''}</small></span></span>
        <span className="asset-identifier" data-label="Identifier">{displayIdentifier(asset)}</span>
        <span data-label="Registered owner">{asset.registeredOwner || <em>Not recorded</em>}</span>
        <span data-label="Current owner">{asset.currentOwner || <em>Unassigned</em>}</span>
        <span data-label="Provider">{asset.provider || <em>Not recorded</em>}</span>
        <span data-label="Status"><b className={`asset-status status-${asset.status}`}><i/>{statusLabel(asset.status)}</b></span>
        <span data-label="Monthly cost">{asset.monthlyCost ? money.format(asset.monthlyCost) : <em>Not set</em>}</span>
        <span data-label="Recharge">{asset.renewalDay ? `Day ${asset.renewalDay}` : <em>Not set</em>}</span>
        <span className="row-actions" data-label="Actions"><button onClick={() => openEdit(asset)} aria-label={`Edit ${asset.name}`}><Icon name="edit" size={15}/></button><button onClick={() => void remove(asset)} aria-label={`Delete ${asset.name}`}><Icon name="trash" size={15}/></button></span>
      </div>)}
      {!assets.length && <div className="asset-empty"><Icon name="asset" size={25}/><h2>No matching assets</h2><p>Add an asset or change the active filters.</p></div>}
    </div>

    {formOpen && <div className="modal-backdrop" onMouseDown={() => setFormOpen(false)}><form className="workspace-modal asset-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="mono-label">Asset Register</span><h2>{editing ? `Edit ${editing.name}` : 'Add an asset'}</h2></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)}><Icon name="close"/></button></header>
      <div className="form-split"><label><span>Asset type</span><select value={form.assetType} onChange={(event) => setForm({ ...form, assetType:event.target.value as VaultAssetType })}>{assetTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status:event.target.value as VaultAssetStatus })}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
      <label><span>Asset name</span><input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name:event.target.value })} placeholder="e.g. Adithya SIM"/></label>
      <label><span>{form.assetType === 'sim' ? 'Phone number' : 'Serial number / identifier'}</span><input required maxLength={160} value={form.identifier} onChange={(event) => setForm({ ...form, identifier:event.target.value })} placeholder={form.assetType === 'sim' ? '+91 98765 43210' : 'Serial, IMEI or licence ID'}/></label>
      <div className="form-split"><label><span>Registered owner / SIM under whose name</span><input maxLength={120} value={form.registeredOwner} onChange={(event) => setForm({ ...form, registeredOwner:event.target.value })} placeholder="Legal or registered owner"/></label><label><span>Current owner</span><input maxLength={120} value={form.currentOwner} onChange={(event) => setForm({ ...form, currentOwner:event.target.value })} placeholder="Current user or team"/></label></div>
      <div className="form-split"><label><span>Provider / brand</span><input list="asset-providers" maxLength={80} value={form.provider} onChange={(event) => setForm({ ...form, provider:event.target.value })} placeholder="Airtel, Jio, Dell…"/><datalist id="asset-providers"><option value="Airtel"/><option value="Jio"/><option value="Vi"/><option value="BSNL"/></datalist></label><label><span>Location</span><input maxLength={160} value={form.location} onChange={(event) => setForm({ ...form, location:event.target.value })} placeholder="Office, remote, storage…"/></label></div>
      <div className="form-split"><label><span>Monthly recharge / cost (₹)</span><input type="number" min="0" max="100000000" step="0.01" value={form.monthlyCost} onChange={(event) => setForm({ ...form, monthlyCost:event.target.value })} placeholder="0.00"/></label><label><span>Recharge / renewal day</span><input type="number" min="1" max="31" step="1" value={form.renewalDay} onChange={(event) => setForm({ ...form, renewalDay:event.target.value })} placeholder="Day of month"/></label></div>
      <label><span>Notes</span><textarea rows={4} maxLength={5000} value={form.notes} onChange={(event) => setForm({ ...form, notes:event.target.value })} placeholder="Plan details, condition, handover notes or anything useful."/></label>
      <footer><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save asset'}</button></footer>
    </form></div>}
  </div>
}
