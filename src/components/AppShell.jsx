import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import NextEventPopup from './NextEventPopup'

function useTheme(profile) {
  const themeClass = profile?.theme_color ? `theme-${profile.theme_color}` : 'theme-brown'
  return themeClass
}

export default function AppShell() {
  const { profile, isAdmin, signOut, selectProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isCalendar = location.pathname.startsWith('/calendario')
  const isAdminPage = location.pathname.startsWith('/admin')
  const isBacheca = location.pathname.startsWith('/bacheca')

  const [showPopup, setShowPopup] = useState(true)
  const [showProfile, setShowProfile] = useState(false)

  const roleLabel = (role) => {
    if (role === 'admin') return 'Admin'
    if (role === 'sostegno') return 'Sostegno'
    return 'Allenatore'
  }

  const roleBadgeClass = (role) => {
    if (role === 'admin') return 'badge-admin'
    if (role === 'sostegno') return 'badge-sostegno'
    return 'badge-coach'
  }

  function handleSignOut() {
    setShowProfile(false)
    signOut()
  }

  function handleChangeUser() {
    setShowProfile(false)
    signOut()
  }

  return (
    <div className={`app-shell ${useTheme(profile)}`}>
      {showPopup && <NextEventPopup onClose={() => setShowPopup(false)} />}
      {showProfile && (
        <ProfilePopup
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSignOut={handleSignOut}
          onChangeUser={handleChangeUser}
          onProfileUpdated={(updated) => { selectProfile(updated); setShowProfile(false) }}
          roleLabel={roleLabel}
          roleBadgeClass={roleBadgeClass}
        />
      )}

      {/* Topbar */}
      <header className="topbar">
        <span className="topbar-brand">Scuola Ovale - Gestione attività</span>
        <div className="topbar-right">
          <button
            onClick={() => setShowProfile(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: '1px solid #e5e5e5',
              borderRadius: 20, padding: '4px 12px', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{profile?.full_name}</span>
            <span className={`badge ${roleBadgeClass(profile?.role)}`}>{roleLabel(profile?.role)}</span>
          </button>
        </div>
      </header>

      <div className="main-layout">
        <nav className="sidebar">
          <div className="nav-section-label">Viste</div>
          <button className={`nav-item ${isCalendar ? 'active' : ''}`} onClick={() => navigate('/calendario')}>
            📅 Calendario
          </button>
          <button className={`nav-item ${isBacheca ? 'active' : ''}`} onClick={() => navigate('/bacheca')}>
            📌 Bacheca
          </button>
          {isAdmin && (
            <button className={`nav-item ${isAdminPage ? 'active' : ''}`} onClick={() => navigate('/admin')}>
              ⚙️ Gestione
            </button>
          )}
          <div style={{ marginTop: 12, borderTop: '1px solid #e5e5e5', paddingTop: 12 }}>
            <button className="nav-item" onClick={() => setShowPopup(true)}>
              🔔 Prossimi impegni
            </button>
          </div>
        </nav>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav">
        <button className={`mobile-nav-item ${isCalendar ? 'active' : ''}`} onClick={() => navigate('/calendario')}>
          <span className="mobile-nav-icon">📅</span>
          Calendario
        </button>
        <button className={`mobile-nav-item ${isBacheca ? 'active' : ''}`} onClick={() => navigate('/bacheca')}>
          <span className="mobile-nav-icon">📌</span>
          Bacheca
        </button>
        <button className="mobile-nav-item" onClick={() => setShowPopup(true)}>
          <span className="mobile-nav-icon">🔔</span>
          Impegni
        </button>
        {isAdmin && (
          <button className={`mobile-nav-item ${isAdminPage ? 'active' : ''}`} onClick={() => navigate('/admin')}>
            <span className="mobile-nav-icon">⚙️</span>
            Gestione
          </button>
        )}
      </nav>
    </div>
  )
}

/* ============================================================
   PROFILE POPUP
   ============================================================ */
function ProfilePopup({ profile, onClose, onSignOut, onChangeUser, onProfileUpdated, roleLabel, roleBadgeClass }) {
  const [editName, setEditName] = useState(false)
  const [newName, setNewName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveName() {
    if (!newName.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: newName.trim() })
      .eq('id', profile.id)
      .select()
      .single()
    setSaving(false)
    if (error) { setError('Errore nel salvataggio'); return }
    onProfileUpdated(data)
  }

  async function updateTheme(colorId) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ theme_color: colorId })
      .eq('id', profile.id)
      .select()
      .single()
    
    if (error) console.error('Errore update tema:', error)
    else onProfileUpdated(data)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.3)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        position: 'absolute', top: 60, right: 16,
        background: '#fff', borderRadius: 14, width: 280,
        boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}>
        {/* Header profilo */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{profile?.full_name}</span>
            <span className={`badge ${roleBadgeClass(profile?.role)}`}>{roleLabel(profile?.role)}</span>
          </div>
        </div>

        {/* Modifica nome */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          {!editName ? (
            <button
              onClick={() => setEditName(true)}
              style={{ fontSize: 13, color: '#1a1a1a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              ✏️ Modifica nome
            </button>
          ) : (
            <div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Nuovo nome</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                />
              </div>
              {error && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 6 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveName}
                  disabled={!newName.trim() || saving}
                >
                  {saving ? 'Salvataggio...' : 'Salva'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditName(false); setNewName(profile?.full_name || '') }}>
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Selettore tema */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 13, color: '#1a1a1a', marginBottom: 8 }}>🎨 Tema:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {[
              { id: 'brown', name: '🟤', label: 'Marrone' },
              { id: 'purple', name: '🟣', label: 'Viola' },
              { id: 'green', name: '🟢', label: 'Verde' },
              { id: 'black', name: '⬛', label: 'Nero' },
              { id: 'red', name: '🔴', label: 'Rosso' },
            ].map(theme => (
              <button
                key={theme.id}
                onClick={() => updateTheme(theme.id)}
                title={theme.label}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: profile?.theme_color === theme.id ? '2px solid #1a1a1a' : '1px solid #e5e5e5',
                  background: '#f5f5f4',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        {/* Azioni */}
        <div style={{ padding: '8px 8px' }}>
          <button
            onClick={onChangeUser}
            style={{ width: '100%', padding: '9px 12px', textAlign: 'left', fontSize: 13, color: '#1a1a1a', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f4'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            🔄 Cambia utente
          </button>
          <button
            onClick={onSignOut}
            style={{ width: '100%', padding: '9px 12px', textAlign: 'left', fontSize: 13, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            🚪 Esci
          </button>
        </div>
      </div>
    </div>
  )
}
