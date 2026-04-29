import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { selectProfile } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('coach')
  const [saving, setSaving] = useState(false)

  // PIN admin
  const [pendingProfile, setPendingProfile] = useState(null)
  const [showPin, setShowPin] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles(data || [])
    setLoading(false)
  }

  async function handleSelectProfile(p) {
    if (p.role === 'admin') {
      setPendingProfile(p)
      setPin('')
      setPinError('')
      setShowPin(true)
    } else {
      selectProfile(p)
    }
  }

  async function confirmPin() {
    if (!pin.trim()) return
    setPinLoading(true)
    setPinError('')
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_pin')
      .single()
    if (data?.value === pin.trim()) {
      selectProfile(pendingProfile)
    } else {
      setPinError('PIN non corretto')
    }
    setPinLoading(false)
  }

  async function addProfile() {
    if (!newName.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .insert({ full_name: newName.trim(), role: newRole })
      .select()
      .single()
    if (!error && data) {
      if (data.role === 'admin') {
        setPendingProfile(data)
        setPin('')
        setPinError('')
        setShowPin(true)
        setShowAdd(false)
        setNewName('')
        setNewRole('coach')
      } else {
        selectProfile(data)
      }
    }
    setSaving(false)
  }

  function copyUrl() {
    navigator.clipboard.writeText(window.location.origin)
      .then(() => alert('Link copiato negli appunti!'))
      .catch(() => alert('Impossibile copiare automaticamente. URL: ' + window.location.origin))
  }

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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f5f5f4', padding: 16
    }}>
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>GS Calendario</h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Chi sei?</p>

        {loading
          ? <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: 16 }}>Caricamento...</p>
          : <>
            {/* PIN modal overlay */}
            {showPin && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
              }}>
                <div className="card" style={{ width: 300, padding: 24 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Accesso amministratore</div>
                  <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                    Inserisci il PIN per accedere come <strong>{pendingProfile?.full_name}</strong>
                  </p>
                  <div className="field">
                    <label>PIN</label>
                    <input
                      type="password"
                      value={pin}
                      onChange={e => { setPin(e.target.value); setPinError('') }}
                      onKeyDown={e => e.key === 'Enter' && confirmPin()}
                      placeholder="••••"
                      autoFocus
                    />
                    {pinError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{pinError}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={confirmPin}
                      disabled={!pin.trim() || pinLoading}
                    >
                      {pinLoading ? 'Verifica...' : 'Accedi'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setShowPin(false); setPendingProfile(null) }}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProfile(p)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: 10,
                    background: '#fff', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f8f7'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>{p.full_name}</span>
                  <span className={`badge ${roleBadgeClass(p.role)}`}>{roleLabel(p.role)}</span>
                </button>
              ))}
            </div>

            {!showAdd
              ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}
                    onClick={() => setShowAdd(true)}
                  >
                    + Non mi trovo nella lista
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={copyUrl}
                  >
                    🔗 Condividi link app
                  </button>
                </div>
              )
              : (
                <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: 16 }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Aggiungi il tuo nome</p>
                  <div className="field">
                    <label>Nome e cognome</label>
                    <input
                      value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="es. Mario Rossi" autoFocus
                    />
                  </div>
                  <div className="field">
                    <label>Ruolo</label>
                    <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                      <option value="coach">Allenatore</option>
                      <option value="sostegno">Sostegno</option>
                      <option value="admin">Amministratore</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={addProfile} disabled={!newName.trim() || saving}>
                      {saving ? 'Salvataggio...' : 'Accedi'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Annulla</button>
                  </div>
                </div>
              )
            }
          </>
        }
      </div>
    </div>
  )
}
