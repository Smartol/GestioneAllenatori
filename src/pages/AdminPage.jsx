import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ALL_CATS = ['U6', 'U8', 'U10', 'U12']
const DAYS = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

export default function AdminPage() {
  const [tab, setTab] = useState('trainings')
  const tabs = [
    { id: 'trainings', label: 'Allenamenti' },
    { id: 'festivals', label: 'Festival' },
    { id: 'groups', label: 'Gruppi categorie' },
    { id: 'coaches', label: 'Allenatori' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: 'transparent',
            color: tab === t.id ? '#1a1a1a' : '#888',
            borderBottom: tab === t.id ? '2px solid #1a1a1a' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'trainings' && <TrainingsTab />}
      {tab === 'festivals' && <FestivalsTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'coaches' && <CoachesTab />}
    </div>
  )
}

/* ---- ALLENAMENTI RICORRENTI ---- */
function TrainingsTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [dow, setDow] = useState(1)
  const [time, setTime] = useState('17:00')
  const [selCats, setSelCats] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('recurring_trainings').select(`*, recurring_training_categories(min_coaches, category:categories(id,name))`).eq('active', true)
    setItems(data || [])
  }

  function toggleCat(c) {
    setSelCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    if (!mins[c]) setMins(m => ({ ...m, [c]: 2 }))
  }

  async function save() {
    if (!selCats.length) return
    setSaving(true)
    const { data: tr } = await supabase.from('recurring_trainings').insert({ day_of_week: dow, start_time: time }).select().single()
    const { data: cats } = await supabase.from('categories').select('id,name').in('name', selCats)
    await supabase.from('recurring_training_categories').insert(
      selCats.map(name => ({ training_id: tr.id, category_id: cats.find(c => c.name === name)?.id, min_coaches: mins[name] || 2 }))
    )
    setSaving(false); setShowForm(false); setSelCats([]); setMins({}); load()
  }

  async function remove(id) {
    await supabase.from('recurring_trainings').update({ active: false }).eq('id', id)
    load()
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Allenamenti ricorrenti</div>
      {items.map(t => (
        <div className="card" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{DAYS[t.day_of_week]} — {t.start_time}</div>
            <div style={{ marginTop: 4 }}>
              {t.recurring_training_categories?.map(c => (
                <span key={c.category?.id} className="badge badge-gray" style={{ marginRight: 4 }}>{c.category?.name} min.{c.min_coaches}</span>
              ))}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>Rimuovi</button>
        </div>
      ))}

      {!showForm && <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>+ Nuovo allenamento</button>}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo allenamento ricorrente</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>Giorno</label>
              <select value={dow} onChange={e => setDow(+e.target.value)}>
                {[1,2,3,4,5,6].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Orario</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Categorie</label>
            <div className="chip-group">
              {ALL_CATS.map(c => <div key={c} className={`chip ${selCats.includes(c)?'selected':''}`} onClick={() => toggleCat(c)}>{c}</div>)}
            </div>
          </div>
          {selCats.length > 0 && (
            <div className="field">
              <label>Minimi per categoria</label>
              {selCats.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, width: 36 }}>{c}</span>
                  <input type="number" min={1} max={10} value={mins[c]||2} onChange={e => setMins(m=>({...m,[c]:+e.target.value}))} style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }} />
                  <span style={{ fontSize: 11, color: '#aaa' }}>min.</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!selCats.length||saving}>{saving?'Salvataggio...':'Salva'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- FESTIVAL ---- */
function FestivalsTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [selCats, setSelCats] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('festivals').select(`*, festival_categories(min_coaches, category:categories(id,name))`).order('date')
    setItems(data || [])
  }

  function toggleCat(c) {
    setSelCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    if (!mins[c]) setMins(m => ({ ...m, [c]: 2 }))
  }

  async function save() {
    if (!name || !date || !selCats.length) return
    setSaving(true)
    const { data: f } = await supabase.from('festivals').insert({ name, date, start_time: time }).select().single()
    const { data: cats } = await supabase.from('categories').select('id,name').in('name', selCats)
    await supabase.from('festival_categories').insert(
      selCats.map(n => ({ festival_id: f.id, category_id: cats.find(c => c.name === n)?.id, min_coaches: mins[n] || 2 }))
    )
    setSaving(false); setShowForm(false); setName(''); setDate(''); setSelCats([]); setMins({}); load()
  }

  async function remove(id) {
    await supabase.from('festivals').delete().eq('id', id); load()
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Festival</div>
      {items.map(f => (
        <div className="card" key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{f.name} <span className="badge badge-purple">Festival</span></div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{f.date} — {f.start_time}</div>
            <div style={{ marginTop: 4 }}>
              {f.festival_categories?.map(c => <span key={c.category?.id} className="badge badge-gray" style={{ marginRight: 4 }}>{c.category?.name} min.{c.min_coaches}</span>)}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => remove(f.id)}>Rimuovi</button>
        </div>
      ))}

      {!showForm && <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>+ Nuovo festival</button>}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo festival</div>
          <div className="field"><label>Nome</label><input value={name} onChange={e => setName(e.target.value)} placeholder="es. Torneo primavera" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field"><label>Data</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="field"><label>Orario</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Categorie</label>
            <div className="chip-group">
              {ALL_CATS.map(c => <div key={c} className={`chip ${selCats.includes(c)?'selected':''}`} onClick={() => toggleCat(c)}>{c}</div>)}
            </div>
          </div>
          {selCats.length > 0 && (
            <div className="field">
              <label>Minimi per categoria</label>
              {selCats.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, width: 36 }}>{c}</span>
                  <input type="number" min={1} max={10} value={mins[c]||2} onChange={e => setMins(m=>({...m,[c]:+e.target.value}))} style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }} />
                  <span style={{ fontSize: 11, color: '#aaa' }}>min.</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!name||!date||!selCats.length||saving}>{saving?'Salvataggio...':'Salva'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- GRUPPI CATEGORIE ---- */
function GroupsTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selCats, setSelCats] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('category_groups').select(`*, category_group_members(category:categories(id,name))`)
    setItems(data || [])
  }

  async function save() {
    if (selCats.length < 2) return
    setSaving(true)
    const { data: g } = await supabase.from('category_groups').insert({ name: groupName || null }).select().single()
    const { data: cats } = await supabase.from('categories').select('id,name').in('name', selCats)
    await supabase.from('category_group_members').insert(
      selCats.map(name => ({ group_id: g.id, category_id: cats.find(c => c.name === name)?.id }))
    )
    setSaving(false); setShowForm(false); setGroupName(''); setSelCats([]); load()
  }

  async function remove(id) {
    await supabase.from('category_groups').delete().eq('id', id); load()
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Gruppi di categorie</div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Categorie raggruppate vengono allenate insieme e condividono la copertura jolly.</p>
      {items.map(g => (
        <div className="card" key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name || g.category_group_members?.map(m => m.category?.name).join(' + ')}</div>
            <div style={{ marginTop: 4 }}>
              {g.category_group_members?.map(m => <span key={m.category?.id} style={{ display: 'inline-block', background: '#ede9fe', color: '#6d28d9', fontSize: 11, padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>{m.category?.name}</span>)}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => remove(g.id)}>Rimuovi</button>
        </div>
      ))}

      {!showForm && <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>+ Nuovo gruppo</button>}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo gruppo</div>
          <div className="field"><label>Nome gruppo (opzionale)</label><input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="es. Piccoli" /></div>
          <div className="field">
            <label>Categorie (seleziona almeno 2)</label>
            <div className="chip-group">
              {ALL_CATS.map(c => <div key={c} className={`chip ${selCats.includes(c)?'selected':''}`} onClick={() => setSelCats(p => p.includes(c)?p.filter(x=>x!==c):[...p,c])}>{c}</div>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={selCats.length<2||saving}>{saving?'Salvataggio...':'Salva'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- ALLENATORI ---- */
function CoachesTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('coach')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setItems(data || [])
  }

  async function toggleRole(item) {
    const newRole = item.role === 'admin' ? 'coach' : 'admin'
    await supabase.from('profiles').update({ role: newRole }).eq('id', item.id)
    load()
  }

  async function invite() {
    if (!fullName || !email) return
    setSaving(true)
    // Invita l'utente tramite Supabase Auth Admin API (da implementare server-side)
    // Per ora creiamo solo il profilo — l'utente riceverà un invite via email
    const { data, error } = await supabase.auth.admin?.inviteUserByEmail(email)
    if (!error && data?.user) {
      await supabase.from('profiles').insert({ id: data.user.id, full_name: fullName, role })
    }
    setSaving(false); setShowForm(false); setFullName(''); setEmail(''); load()
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Gestione allenatori</div>
      {items.map(c => (
        <div className="card" key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              {c.full_name} <span className={`badge ${c.role === 'admin' ? 'badge-admin' : 'badge-coach'}`}>{c.role === 'admin' ? 'Admin' : 'Allenatore'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => toggleRole(c)}>
              {c.role === 'admin' ? '→ Allenatore' : '→ Admin'}
            </button>
          </div>
        </div>
      ))}

      {!showForm && <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>+ Invita allenatore</button>}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Invita nuovo utente</div>
          <div className="field"><label>Nome e cognome</label><input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Mario Rossi" /></div>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mario@esempio.it" /></div>
          <div className="field">
            <label>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="coach">Allenatore</option>
              <option value="admin">Amministratore</option>
            </select>
          </div>
          <div className="info-banner">L'utente riceverà un'email per impostare la password.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={invite} disabled={!fullName||!email||saving}>{saving?'Invio...':'Invia invito'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}
