import { useCallback } from 'react'

import { create } from 'zustand'

import { getApi, parseSession } from '@/bridges/auth/auth-bridge'

export type AuthUser = {
  name?: string
  email?: string
  image?: string | null
}

type AuthState = {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user })
}))

export function useAuth() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const api = getApi()
    if (!api) {
      setUser(null)
      return null
    }

    const result = await api.auth.getSession()
    if (!result.ok) {
      setUser(null)
      return null
    }

    const parsed = parseSession(result.data)
    const nextUser = parsed?.user ?? null
    setUser(nextUser)
    return nextUser
  }, [setUser])

  const signInWithGitHub = useCallback(async (): Promise<AuthUser | null> => {
    const api = getApi()
    if (!api) return null
    await api.auth.signInWithGithub()
    return refreshSession()
  }, [refreshSession])

  const signOut = useCallback(async (): Promise<boolean> => {
    const api = getApi()
    if (!api) {
      setUser(null)
      return false
    }
    const result = await api.auth.signOut()
    setUser(null)
    return result.ok
  }, [setUser])

  return {
    user,
    isAuthenticated: Boolean(user?.email || user?.name || user?.image),
    setUser,
    refreshSession,
    signInWithGitHub,
    signOut
  }
}
