import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setCsrfToken } from '../lib/api'
import type { WorkspaceUser } from '../types'

type AuthContextValue = {
  user: WorkspaceUser | null
  loading: boolean
  login: (identity: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<WorkspaceUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: WorkspaceUser; csrfToken: string }>('auth.status')
      setCsrfToken(result.csrfToken)
      setUser(result.user)
    } catch {
      setCsrfToken('')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (identity: string, password: string) => {
    const result = await api<{ user: WorkspaceUser; csrfToken: string }>('auth.login', {
      method: 'POST',
      body: JSON.stringify({ identity, password }),
    })
    setCsrfToken(result.csrfToken)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    await api('auth.logout', { method: 'POST' })
    setCsrfToken('')
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}

