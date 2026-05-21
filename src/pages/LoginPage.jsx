import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { selectProfile } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('coach')
  const [saving, setSaving] = useState(false)

  const [pendingProfile, setPendingProfile] = useState(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  useEffect(() => { loadProfiles() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(profiles.filter(p => p.full_name.toLowerCase().includes(q)))
  }, [search, profiles])

  async function loadProfiles() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  function handleSelectProfile(p) {
    if (p.role === 'admin') {
      setPendingProfile(p)
      setPin('')
      setPinError('')
    } else {
      selectProfile(p)
    }
  }

  async function confirmPin() {
    if (!pin.trim()) return
    setPinLoading(true)
    setPinError('')
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', 'admin_pin').single()
    if (error || !data) { setPinError('Errore nel recupero del PIN'); setPinLoading(false); return }
    if (data.value === pin.trim()) {
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
      .from('profiles').insert({ full_name: newName.trim(), role: newRole }).select().single()
    setSaving(false)
    if (error || !data) { alert('Errore: ' + (error?.message || 'sconosciuto')); return }
    setShowAdd(false)
    setNewName('')
    setNewRole('coach')
    handleSelectProfile(data)
  }

  function copyUrl() {
    navigator.clipboard.writeText(window.location.origin)
      .then(() => alert('Link copiato!'))
      .catch(() => alert('URL: ' + window.location.origin))
  }

  const roleLabel = r => r === 'admin' ? 'Admin' : r === 'sostegno' ? 'Sostegno' : 'Allenatore'
  const roleBadgeClass = r => r === 'admin' ? 'badge-admin' : r === 'sostegno' ? 'badge-sostegno' : 'badge-coach'

  // Schermata PIN admin
  if (pendingProfile) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundImage: 'url(/ZAINO_SO.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          background: 'rgba(0,0,0,0.45)',
        }}>
          <div className="card" style={{ width: 320 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Accesso amministratore</h1>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Inserisci il PIN per accedere come <strong>{pendingProfile.full_name}</strong>
            </p>
            <div className="field">
              <label>PIN</label>
              <input
                type="password" value={pin}
                onChange={e => { setPin(e.target.value); setPinError('') }}
                onKeyDown={e => e.key === 'Enter' && confirmPin()}
                placeholder="••••" autoFocus
              />
              {pinError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{pinError}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={confirmPin} disabled={!pin.trim() || pinLoading}>
                {pinLoading ? 'Verifica...' : 'Accedi'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPendingProfile(null)}>
                Indietro
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundImage: 'url(/ZAINO_SO.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '16px 10%',
        background: 'rgba(0,0,0,0.45)',
      }}>

      <div className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Scuola Ovale</h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Chi sei?</p>

        {/* Barra di ricerca */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: 15, pointerEvents: 'none' }}>
            🔍
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca il tuo nome..."
            style={{
              width: '100%', padding: '8px 10px 8px 34px',
              border: '1.5px solid #ddd', borderRadius: 8,
              fontSize: 13, background: '#fff', color: '#1a1a1a',
            }}
            autoFocus
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14, padding: 0 }}
            >✕</button>
          )}
        </div>

        {/* Lista profili */}
        {loading ? (
          <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: 16 }}>Caricamento...</p>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 12, borderRadius: 8 }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '16px 0' }}>
                Nessun risultato per "{search}"
              </p>
            ) : filtered.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProfile(p)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '9px 10px',
                  border: 'none', borderBottom: '1px solid #f0f0f0',
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
        )}

        {/* Azioni extra */}
        {!showAdd ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', fontSize: 13 }}
              onClick={() => setShowAdd(true)}
            >
              + Non mi trovo nella lista
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
              onClick={copyUrl}
            >
              🔗 Condividi link app
            </button>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: 14 }}>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Aggiungi il tuo nome</p>
            <div className="field">
              <label>Nome e cognome</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="es. Mario Rossi" autoFocus />
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
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); setNewName(''); setNewRole('coach') }}>
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  )
}
