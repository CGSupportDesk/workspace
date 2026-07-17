import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { workspaceApplications } from '../config/apps'
import type { WorkspaceApplication } from '../types'

const favouritesKey = 'workspace:favourite-apps'
const recentsKey = 'workspace:recent-apps'
const preferenceEvent = 'workspace:app-preferences'

function readIds(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function useAppLauncher() {
  const navigate = useNavigate()
  const [favouriteIds, setFavouriteIds] = useState<string[]>(() => readIds(favouritesKey))
  const [recentIds, setRecentIds] = useState<string[]>(() => readIds(recentsKey))

  useEffect(() => {
    const sync = () => { setFavouriteIds(readIds(favouritesKey)); setRecentIds(readIds(recentsKey)) }
    window.addEventListener('storage', sync)
    window.addEventListener(preferenceEvent, sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(preferenceEvent, sync) }
  }, [])

  const save = useCallback((key: string, ids: string[]) => {
    window.localStorage.setItem(key, JSON.stringify(ids))
    window.dispatchEvent(new Event(preferenceEvent))
  }, [])

  const toggleFavourite = useCallback((id: string) => {
    const current = readIds(favouritesKey)
    save(favouritesKey, current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }, [save])

  const markOpened = useCallback((id: string) => {
    save(recentsKey, [id, ...readIds(recentsKey).filter((item) => item !== id)].slice(0, 6))
  }, [save])

  const launch = useCallback((app: WorkspaceApplication) => {
    if (!app.enabled) return
    markOpened(app.id)
    if (app.route) navigate(app.route)
    else if (app.externalUrl) window.open(app.externalUrl, '_blank', 'noopener,noreferrer')
  }, [markOpened, navigate])

  const favourites = useMemo(() => favouriteIds.map((id) => workspaceApplications.find((app) => app.id === id)).filter((app): app is WorkspaceApplication => Boolean(app?.enabled)), [favouriteIds])
  const recents = useMemo(() => recentIds.map((id) => workspaceApplications.find((app) => app.id === id)).filter((app): app is WorkspaceApplication => Boolean(app?.enabled)), [recentIds])

  return { favouriteIds, favourites, recents, launch, toggleFavourite }
}
