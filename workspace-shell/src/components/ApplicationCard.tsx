import { useAppLauncher } from '../hooks/useAppLauncher'
import type { WorkspaceApplication } from '../types'
import { Icon } from './Icon'

export function ApplicationCard({ app, index }: { app: WorkspaceApplication; index: number }) {
  const { favouriteIds, launch, toggleFavourite } = useAppLauncher()
  const favourite = favouriteIds.includes(app.id)

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--card-x', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--card-y', `${event.clientY - rect.top}px`)
  }

  return <article className={`app-card ${app.enabled ? '' : 'is-disabled'}`} style={{ '--app-accent': app.accent } as React.CSSProperties} onPointerMove={onPointerMove}>
    <div className="app-card-glow"/>
    <button disabled={!app.enabled} className={`app-favourite app-card-favourite ${favourite ? 'is-favourite' : ''}`} onClick={() => toggleFavourite(app.id)} aria-label={`${favourite ? 'Remove' : 'Add'} ${app.name} ${favourite ? 'from' : 'to'} favourites`}><Icon name="star" size={16} filled={favourite}/></button>
    <button className="app-card-launch" disabled={!app.enabled} onClick={() => launch(app)}>
      <div className="app-card-top"><span className="app-glyph">{app.glyph}</span><span className="status-tag"><i/>{app.status}</span></div>
      <div className="app-card-body"><span className="mono-label">{String(index + 1).padStart(2, '0')} / Application</span><h3>{app.name}</h3><p>{app.description}</p></div>
      <div className="app-card-footer"><span>{app.metric}</span><span className="round-arrow"><Icon name={app.externalUrl ? 'external' : 'arrow'} size={17}/></span></div>
    </button>
  </article>
}
