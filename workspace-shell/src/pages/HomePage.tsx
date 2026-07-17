import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AppTile } from '../components/AppTile'
import { Icon } from '../components/Icon'
import { workspaceApplications } from '../config/apps'
import { useAuth } from '../context/AuthContext'
import { useAppLauncher } from '../hooks/useAppLauncher'
import { useMouseMotion } from '../hooks/useMouseMotion'
import { useVideoScrub } from '../hooks/useVideoScrub'

const heroLine = 'Where should we begin today?'

export function HomePage() {
  const { user } = useAuth()
  const { openPalette } = useOutletContext<{ openPalette: () => void }>()
  const { favourites, recents, launch } = useAppLauncher()
  const motionRef = useMouseMotion<HTMLDivElement>()
  const videoEnabled = import.meta.env.VITE_ENABLE_HERO_VIDEO !== 'false'
  const videoRef = useVideoScrub(videoEnabled)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setTyped(heroLine.slice(0, index))
      if (index >= heroLine.length) window.clearInterval(timer)
    }, 52)
    return () => window.clearInterval(timer)
  }, [])

  const quickApps = favourites.length ? favourites.slice(0, 6) : workspaceApplications.filter((app) => app.featured && app.enabled).slice(0, 6)
  const todo = workspaceApplications.find((app) => app.id === 'todo')!
  const vault = workspaceApplications.find((app) => app.id === 'vault')!

  return <div ref={motionRef} className="home-page">
    <section className="hero-section home-hero">
      {videoEnabled && <video ref={videoRef} className="hero-video" muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260530_042513_df96a13b-6155-4f6e-8b93-c9dee66fba08.mp4"/>}
      <div className="hero-wash"/><div className="retro-grid"/>
      <div className="hero-content">
        <div className="hero-intro"><span className="mono-label">Closing Gap Workspace</span><p>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.username}.</p></div>
        <h1>{typed}<span className="type-caret"/></h1>
        <div className="hero-lower">
          <div className="hero-pills" aria-label="Quick launch applications">{quickApps.slice(0, 4).map((app) => <button key={app.id} onClick={() => launch(app)}>Open {app.name}<Icon name={app.externalUrl ? 'external' : 'arrow'} size={14}/></button>)}</div>
          <button className="search-pill" onClick={openPalette}><Icon name="search" size={18}/><span>Search Workspace</span><kbd>Ctrl K</kbd></button>
        </div>
      </div>
      <div className="hero-system-bar"><span><i/>System online</span><span>{workspaceApplications.filter((app) => app.enabled).length} connected destinations</span><span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</span><span className="scroll-cue">Your day <b>↓</b></span></div>
    </section>

    <section className="home-operations">
      <header className="home-section-heading"><div><span className="mono-label">Start here</span><h2>Your work, within reach.</h2></div><Link to="/apps">View all {workspaceApplications.length} apps <Icon name="arrow" size={16}/></Link></header>
      <div className="home-action-grid">
        <button onClick={() => launch(todo)}><span><Icon name="check" size={20}/></span><div><small>Plan the day</small><strong>Open To-Do</strong><p>Priorities, ownership and deadlines.</p></div><Icon name="arrow"/></button>
        <button onClick={() => launch(vault)}><span><Icon name="vault" size={20}/></span><div><small>Find company knowledge</small><strong>Open Vault</strong><p>Documents, credentials and shared files.</p></div><Icon name="arrow"/></button>
        <button onClick={openPalette}><span><Icon name="search" size={20}/></span><div><small>Search everywhere</small><strong>Find anything</strong><p>Apps, files, people and quick actions.</p></div><Icon name="arrow"/></button>
      </div>
      <section className="home-app-section">
        <header><div><span className="mono-label">{favourites.length ? 'Your favourites' : 'Recommended'}</span><h2>{favourites.length ? 'Pinned for quick access.' : 'Useful places to begin.'}</h2></div><p>{favourites.length ? 'Your pinned applications stay on top across Workspace.' : 'Tap the star on any application to make this space yours.'}</p></header>
        <div className="app-tile-grid home-app-grid">{quickApps.map((app) => <AppTile key={app.id} app={app}/>)}</div>
      </section>
      {recents.length > 0 && <section className="home-app-section recent-section"><header><div><span className="mono-label">Recent</span><h2>Pick up where you left off.</h2></div></header><div className="app-tile-grid home-app-grid">{recents.slice(0, 4).map((app) => <AppTile key={app.id} app={app}/>)}</div></section>}
    </section>
    <section className="workspace-footer-cta"><span className="mono-label">One operating system</span><h2>Make the work<br/>feel connected.</h2><button onClick={openPalette}>Find anything <Icon name="arrow"/></button></section>
  </div>
}
