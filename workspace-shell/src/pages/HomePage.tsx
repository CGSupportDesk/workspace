import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ApplicationCard } from '../components/ApplicationCard'
import { Icon } from '../components/Icon'
import { workspaceApplications } from '../config/apps'
import { useAuth } from '../context/AuthContext'
import { useMouseMotion } from '../hooks/useMouseMotion'
import { useVideoScrub } from '../hooks/useVideoScrub'

const heroLine = 'Where should we begin today?'

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { openPalette } = useOutletContext<{ openPalette: () => void }>()
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

  const launch = (id: string) => {
    const app = workspaceApplications.find((item) => item.id === id)
    if (!app?.enabled) return
    if (app.route) navigate(app.route)
    else if (app.externalUrl) window.open(app.externalUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div ref={motionRef} className="home-page">
      <section className="hero-section">
        {videoEnabled && <video ref={videoRef} className="hero-video" muted playsInline preload="auto" tabIndex={-1} aria-hidden="true" src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260530_042513_df96a13b-6155-4f6e-8b93-c9dee66fba08.mp4" />}
        <div className="hero-wash" />
        <div className="retro-grid" />
        <div className="hero-decoration line-one" />
        <div className="hero-decoration line-two" />
        <span className="floating-tag tag-one">PROJECTS / 12</span>
        <span className="floating-tag tag-two">FINANCE / LIVE</span>
        <span className="floating-tag tag-three">VAULT / SECURE</span>
        <div className="hero-content">
          <div className="hero-intro">
            <span className="mono-label">Closing Gap Workspace</span>
            <p>Every part of the business, connected.</p>
          </div>
          <h1>{typed}<span className="type-caret" /></h1>
          <div className="hero-lower">
            <div className="hero-pills" aria-label="Quick launch applications">
              {workspaceApplications.map((app) => <button key={app.id} disabled={!app.enabled} onClick={() => launch(app.id)}>Open {app.name}<Icon name="arrow" size={14} /></button>)}
            </div>
            <button className="search-pill" onClick={openPalette}><Icon name="search" size={18} /><span>Search Workspace</span><kbd>⌘ K</kbd></button>
          </div>
        </div>
        <div className="hero-system-bar">
          <span><i /> System online</span>
          <span>Signed in as {user?.username}</span>
          <span>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</span>
          <span className="scroll-cue">Scroll to explore <b>↓</b></span>
        </div>
      </section>
      <section className="applications-section" id="applications">
        <header className="section-heading">
          <div><span className="mono-label">Connected systems / 06</span><h2>Your business,<br/><em>instruments ready.</em></h2></div>
          <p>One calm surface for the moving parts. Open a tool, pick up where you left off, and keep the work in motion.</p>
        </header>
        <div className="applications-grid">
          {workspaceApplications.map((app, index) => <ApplicationCard key={app.id} app={app} index={index} />)}
        </div>
      </section>
      <section className="workspace-footer-cta">
        <span className="mono-label">One operating system</span>
        <h2>Make the work<br/>feel connected.</h2>
        <button onClick={openPalette}>Find anything <Icon name="arrow" /></button>
      </section>
    </div>
  )
}

