import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import AppShell from './components/AppShell'
import CalendarPage from './pages/CalendarPage'
import AdminPage from './pages/AdminPage'
import BachecaPage from './pages/BachecaPage'

function PrivateRoute({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="spinner">Caricamento...</div>
  return profile ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <div className="spinner">Caricamento...</div>
  return isAdmin ? children : <Navigate to="/calendario" replace />
}

export default function App() {
  const { profile } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={profile ? <Navigate to="/calendario" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><AppShell /></PrivateRoute>}>
        <Route index element={<Navigate to="/calendario" replace />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="bacheca" element={<BachecaPage />} />
        <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
