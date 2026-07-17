import { useMemo, useState } from 'react'
import { AppTile } from '../components/AppTile'
import { Icon } from '../components/Icon'
import { applicationCategories, workspaceApplications } from '../config/apps'
import { useAppLauncher } from '../hooks/useAppLauncher'
import type { ApplicationCategory } from '../types'

export function AppsPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ApplicationCategory | 'all' | 'favourites'>('all')
  const { favouriteIds } = useAppLauncher()
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return workspaceApplications.filter((app) => {
      if (filter === 'favourites' && !favouriteIds.includes(app.id)) return false
      if (filter !== 'all' && filter !== 'favourites' && app.category !== filter) return false
      return !needle || `${app.name} ${app.description} ${app.metric}`.toLowerCase().includes(needle)
    })
  }, [favouriteIds, filter, query])

  const groups = filter === 'all'
    ? applicationCategories.map((category) => ({ ...category, apps: visible.filter((app) => app.category === category.id) }))
    : [{ id: filter, label: filter === 'favourites' ? 'Favourites' : applicationCategories.find((item) => item.id === filter)?.label || 'Applications', description: '', apps: visible }]

  return <section className="standard-page apps-page">
    <header className="page-header"><div><span className="mono-label">Application directory / {workspaceApplications.length}</span><h1>All systems.</h1></div><p>Open every connected tool, Workspace service and Closing Gap destination from one directory.</p></header>
    <div className="app-directory-toolbar">
      <label className="directory-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications…"/></label>
      <div className="directory-filters" aria-label="Filter applications">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'favourites' ? 'active' : ''} onClick={() => setFilter('favourites')}><Icon name="star" size={14}/>Favourites</button>
        {applicationCategories.map((category) => <button key={category.id} className={filter === category.id ? 'active' : ''} onClick={() => setFilter(category.id)}>{category.label}</button>)}
      </div>
    </div>
    <div className="app-directory-groups">
      {groups.filter((group) => group.apps.length).map((group) => <section className="app-directory-group" key={group.id}>
        <header><div><h2>{group.label}</h2>{group.description && <p>{group.description}</p>}</div><span>{group.apps.length}</span></header>
        <div className="app-tile-grid">{group.apps.map((app) => <AppTile key={app.id} app={app}/>)}</div>
      </section>)}
      {!visible.length && <div className="directory-empty"><Icon name="search" size={26}/><h2>No matching applications</h2><p>Try another search or application group.</p></div>}
    </div>
  </section>
}
