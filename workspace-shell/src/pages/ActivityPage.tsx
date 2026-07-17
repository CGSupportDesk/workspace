import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { api, formatRelativeDate } from '../lib/api'
import type { VaultActivity } from '../types'

export function ActivityPage() {
  const [activity, setActivity] = useState<VaultActivity[]>([])
  useEffect(() => { void api<{ activity: VaultActivity[] }>('vault.activity').then((value) => setActivity(value.activity)).catch(() => undefined) }, [])
  return <section className="standard-page activity-page"><header className="page-header"><div><span className="mono-label">System log / recent work</span><h1>Activity.</h1></div><p>A clear record of changes made across the shared Vault.</p></header><div className="activity-ledger">{activity.length ? activity.map((item, index) => <div key={item.id}><span className="activity-number">{String(index + 1).padStart(2, '0')}</span><span className="activity-symbol"><Icon name="activity"/></span><span><strong>{item.actorName}</strong><p>{item.action} <b>{item.entityName}</b></p></span><time>{formatRelativeDate(item.createdAt)}</time></div>) : <div className="restricted-panel"><span><Icon name="activity" size={28}/></span><h2>No activity yet</h2><p>Your Workspace history will appear here.</p></div>}</div></section>
}

