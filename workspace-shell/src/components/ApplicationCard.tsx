import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import type { WorkspaceApplication } from '../types'

export function ApplicationCard({ app, index }: { app: WorkspaceApplication; index: number }) {
  const navigate = useNavigate()

  const open = () => {
    if (!app.enabled) return
    if (app.route) navigate(app.route)
    else if (app.externalUrl) window.open(app.externalUrl, '_blank', 'noopener,noreferrer')
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--card-x', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--card-y', `${event.clientY - rect.top}px`)
  }

  return (
    <article
      className={`app-card app-card-${index + 1} ${app.enabled ? '' : 'is-disabled'}`}
      style={{ '--app-accent': app.accent } as React.CSSProperties}
      onPointerMove={onPointerMove}
      onClick={open}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') open() }}
      role={app.enabled ? 'link' : undefined}
      tabIndex={app.enabled ? 0 : -1}
      aria-disabled={!app.enabled}
    >
      <div className="app-card-glow" />
      <div className="app-card-top">
        <span className="app-glyph">{app.glyph}</span>
        <span className="status-tag"><i />{app.status}</span>
      </div>
      <div className="app-card-body">
        <span className="mono-label">0{index + 1} / Application</span>
        <h3>{app.name}</h3>
        <p>{app.description}</p>
      </div>
      <div className="app-card-footer">
        <span>{app.metric}</span>
        <span className="round-arrow"><Icon name="arrow" size={17} /></span>
      </div>
    </article>
  )
}

