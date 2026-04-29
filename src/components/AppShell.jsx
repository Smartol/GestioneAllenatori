import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AppShell() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isCalendar = location.pathname.startsWith('/calendario')
  const isAdmin_ = location.pathname.startsWith('/admin')

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <span className="topbar-brand">GS Calendario</span>
        <div className="topbar-right">
          <span className="topbar-user">{profile?.full_name}</span>
          <span className={`badge ${isAdmin ? 'badge-admin' : 'badge-coach'}`}>
            {isAdmin ? 'Admin' : 'Allenatore'}
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
          {isAdmin && (
            <button
              className={`nav-item ${isAdmin_ ? 'active' : ''}`}
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
        {isAdmin && (
          <button
            className={`mobile-nav-item ${isAdmin_ ? 'active' : ''}`}
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
