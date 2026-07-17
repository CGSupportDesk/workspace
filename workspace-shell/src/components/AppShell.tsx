import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CommandPalette } from './CommandPalette'
import { Icon } from './Icon'

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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

  useEffect(() => setMenuOpen(false), [location.pathname])

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return <div className="workspace-frame">
    <header className="workspace-nav">
      <NavLink className="brand" to="/" onClick={() => setMenuOpen(false)}><span className="brand-sigil">W</span><span>Workspace<sup>®</sup></span></NavLink>
      <nav className={menuOpen ? 'open' : ''} aria-label="Main navigation">
        <NavLink to="/apps">Apps</NavLink><NavLink to="/activity">Activity</NavLink><NavLink to="/team">Team</NavLink><NavLink to="/settings">Settings</NavLink>
      </nav>
      <div className="nav-actions">
        <button className="nav-search" onClick={() => setPaletteOpen(true)} aria-label="Search Workspace"><Icon name="search" size={17}/><span>Search</span><kbd>Ctrl K</kbd></button>
        <NavLink to="/profile" className="user-chip" aria-label="Open profile"><span className="avatar">{user?.username.slice(0, 2).toUpperCase()}</span><span className="user-copy"><strong>{user?.username}</strong><small>{user?.role}</small></span></NavLink>
        <button className="icon-button logout-button" onClick={() => void signOut()} aria-label="Log out"><Icon name="logout" size={18}/></button>
        <button className="icon-button mobile-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle menu" aria-expanded={menuOpen}><Icon name={menuOpen ? 'close' : 'menu'} size={20}/></button>
      </div>
    </header>
    <main><Outlet context={{ openPalette: () => setPaletteOpen(true) }}/></main>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <NavLink end to="/"><Icon name="home" size={20}/><span>Home</span></NavLink>
      <NavLink to="/apps"><Icon name="grid" size={20}/><span>Apps</span></NavLink>
      <NavLink to="/todo"><Icon name="check" size={20}/><span>To-Do</span></NavLink>
      <NavLink to="/vault"><Icon name="vault" size={20}/><span>Vault</span></NavLink>
      <button className={menuOpen ? 'active' : ''} onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}><Icon name="more" size={20}/><span>More</span></button>
    </nav>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}/>
  </div>
}
