import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AppShell() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isCalendar = location.pathname.startsWith('/calendario')
  const isAdminPage = location.pathname.startsWith('/admin')
  const isBacheca = location.pathname.startsWith('/bacheca')

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

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <span className="topbar-brand">GS Calendario</span>
        <div className="topbar-right">
          <span className="topbar-user">{profile?.full_name}</span>
          <span className={`badge ${roleBadgeClass(profile?.role)}`}>
            {roleLabel(profile?.role)}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={signOut}>Esci</button>
        </div>
      </header>

      <div className="main-layout">
        {/* Sidebar desktop */}
        <nav className="sidebar">
          <div className="nav-section-label">Viste</div>
          <button
            className={`nav-item ${isCalendar ? 'active' : ''}`}
            onClick={() => navigate('/calendario')}
          >
            📅 Calendario
          </button>
          <button
            className={`nav-item ${isBacheca ? 'active' : ''}`}
            onClick={() => navigate('/bacheca')}
          >
            📌 Bacheca
          </button>
          {isAdmin && (
            <button
              className={`nav-item ${isAdminPage ? 'active' : ''}`}
              onClick={() => navigate('/admin')}
            >
              ⚙️ Gestione
            </button>
          )}
        </nav>

        {/* Content */}
        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        <button
          className={`mobile-nav-item ${isCalendar ? 'active' : ''}`}
          onClick={() => navigate('/calendario')}
        >
          <span className="mobile-nav-icon">📅</span>
          Calendario
        </button>
        <button
          className={`mobile-nav-item ${isBacheca ? 'active' : ''}`}
          onClick={() => navigate('/bacheca')}
        >
          <span className="mobile-nav-icon">📌</span>
          Bacheca
        </button>
        {isAdmin && (
          <button
            className={`mobile-nav-item ${isAdminPage ? 'active' : ''}`}
            onClick={() => navigate('/admin')}
          >
            <span className="mobile-nav-icon">⚙️</span>
            Gestione
          </button>
        )}
      </nav>
    </div>
  )
}
