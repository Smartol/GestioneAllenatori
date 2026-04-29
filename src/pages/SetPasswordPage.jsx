import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Le password non coincidono.'); return }
    if (password.length < 8) { setError('La password deve essere di almeno 8 caratteri.'); return }
    setError(''); setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setLoading(false)
    navigate('/calendario')
  }

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f4' }}>
      <div className="card" style={{ width: 340, textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: 13 }}>Verifica del link in corso...</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f4', padding: 16 }}>
      <div className="card" style={{ width: 340 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Imposta la password</h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Scegli una password per accedere all'app.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} required minLength={8} onChange={e => setPassword(e.target.value)} placeholder="Minimo 8 caratteri" />
          </div>
          <div className="field">
            <label>Conferma password</label>
            <input type="password" value={confirm} required onChange={e => setConfirm(e.target.value)} placeholder="Ripeti la password" />
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Salvataggio...' : 'Imposta password e accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
