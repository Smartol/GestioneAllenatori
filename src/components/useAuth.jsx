import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('gs_profile')
    if (saved) {
      try { setProfile(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  function selectProfile(p) {
    setProfile(p)
    localStorage.setItem('gs_profile', JSON.stringify(p))
  }

  function signOut() {
    setProfile(null)
    localStorage.removeItem('gs_profile')
  }

  const isAdmin = profile?.role === 'admin'
  const isCoach = profile?.role === 'coach'
  const isSostegno = profile?.role === 'sostegno'

  return (
    <AuthContext.Provider value={{ profile, loading, isAdmin, isCoach, isSostegno, selectProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
