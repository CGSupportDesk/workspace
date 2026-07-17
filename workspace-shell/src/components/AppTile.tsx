import { categoryLabel } from '../config/apps'
import { useAppLauncher } from '../hooks/useAppLauncher'
import type { WorkspaceApplication } from '../types'
import { Icon } from './Icon'

export function AppTile({ app }: { app: WorkspaceApplication }) {
  const { favouriteIds, launch, toggleFavourite } = useAppLauncher()
  const favourite = favouriteIds.includes(app.id)

  return <article className={`app-tile ${app.enabled ? '' : 'is-disabled'}`} style={{ '--app-accent': app.accent } as React.CSSProperties}>
    <button className="app-tile-launch" disabled={!app.enabled} onClick={() => launch(app)} aria-label={`Open ${app.name}`}>
      <span className="app-tile-glyph">{app.glyph}</span>
      <span className="app-tile-copy"><strong>{app.name}</strong><small>{categoryLabel(app.category)}</small></span>
      <Icon name={app.externalUrl ? 'external' : 'chevron'} size={16}/>
    </button>
    <button disabled={!app.enabled} className={`app-favourite ${favourite ? 'is-favourite' : ''}`} onClick={() => toggleFavourite(app.id)} aria-label={`${favourite ? 'Remove' : 'Add'} ${app.name} ${favourite ? 'from' : 'to'} favourites`}>
      <Icon name="star" size={15} filled={favourite}/>
    </button>
  </article>
}
