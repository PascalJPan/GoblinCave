import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (password) => {
    await api.login(password)
    setLoggedIn(true)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setLoggedIn(false)
  }, [])

  return { loggedIn, loading, login, logout }
}
