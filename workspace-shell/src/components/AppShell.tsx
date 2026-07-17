import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CommandPalette } from './CommandPalette'
import { Icon } from './Icon'

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="workspace-frame">
      <header className="workspace-nav">
        <NavLink className="brand" to="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-sigil">W</span>
          <span>Workspace<sup>®</sup></span>
        </NavLink>
        <nav className={menuOpen ? 'open' : ''} aria-label="Main navigation">
          <NavLink to="/apps" onClick={() => setMenuOpen(false)}>Apps</NavLink>
          <NavLink to="/activity" onClick={() => setMenuOpen(false)}>Activity</NavLink>
          <NavLink to="/team" onClick={() => setMenuOpen(false)}>Team</NavLink>
          <NavLink to="/settings" onClick={() => setMenuOpen(false)}>Settings</NavLink>
        </nav>
        <div className="nav-actions">
          <button className="nav-search" onClick={() => setPaletteOpen(true)} aria-label="Search Workspace"><Icon name="search" size={17} /><span>Search</span><kbd>⌘ K</kbd></button>
          <NavLink to="/profile" className="user-chip" aria-label="Open profile">
            <span className="avatar">{user?.username.slice(0, 2).toUpperCase()}</span>
            <span className="user-copy"><strong>{user?.username}</strong><small>{user?.role}</small></span>
          </NavLink>
          <button className="icon-button logout-button" onClick={() => void signOut()} aria-label="Log out"><Icon name="logout" size={18} /></button>
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle menu"><Icon name={menuOpen ? 'close' : 'menu'} size={20} /></button>
        </div>
      </header>
      <main><Outlet context={{ openPalette: () => setPaletteOpen(true) }} /></main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

