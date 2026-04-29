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

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles(data || [])
    setLoading(false)
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
      selectProfile(data)
    }
    setSaving(false)
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProfile(p)}
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
                  <span className={`badge ${p.role === 'admin' ? 'badge-admin' : 'badge-coach'}`}>
                    {p.role === 'admin' ? 'Admin' : 'Allenatore'}
                  </span>
                </button>
              ))}
            </div>

            {!showAdd
              ? <button
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}
                  onClick={() => setShowAdd(true)}
                >
                  + Non mi trovo nella lista
                </button>
              : <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: 16 }}>
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
            }
          </>
        }
      </div>
    </div>
  )
}
