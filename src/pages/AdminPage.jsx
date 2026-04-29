import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

export default function AdminPage() {
  const [tab, setTab] = useState('trainings')
  const tabs = [
    { id: 'trainings', label: 'Allenamenti' },
    { id: 'activities', label: 'Attività' },
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
      {tab === 'activities' && <ActivitiesTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'coaches' && <CoachesTab />}
    </div>
  )
}

/* ============================================================
   SELETTORE CATEGORIE + GRUPPI
   Componente riutilizzabile per scegliere categorie singole
   o gruppi di categorie, con il minimo allenatori per ognuno
   ============================================================ */
function CategoryGroupSelector({ selected, setSelected, mins, setMins }) {
  const [allCats, setAllCats] = useState([])
  const [allGroups, setAllGroups] = useState([])

  useEffect(() => {
    supabase.from('categories').select('id,name').then(({ data }) => setAllCats(data || []))
    supabase.from('category_groups').select(`id, name, category_group_members(category:categories(id,name))`).then(({ data }) => setAllGroups(data || []))
  }, [])

  function toggleItem(key) {
    setSelected(prev => {
      const exists = prev.find(x => x.key === key)
      if (exists) return prev.filter(x => x.key !== key)
      const isCat = key.startsWith('cat_')
      const id = parseInt(key.split('_')[1])
      return [...prev, { key, type: isCat ? 'category' : 'group', id }]
    })
    if (!mins[key]) setMins(m => ({ ...m, [key]: 2 }))
  }

  function isSelected(key) { return !!selected.find(x => x.key === key) }

  function labelFor(key) {
    if (key.startsWith('cat_')) {
      const id = parseInt(key.split('_')[1])
      return allCats.find(c => c.id === id)?.name || key
    } else {
      const id = parseInt(key.split('_')[1])
      const g = allGroups.find(g => g.id === id)
      return g?.name || g?.category_group_members?.map(m => m.category?.name).join('+') || key
    }
  }

  return (
    <div>
      {allCats.length > 0 && (
        <div className="field">
          <label>Categorie singole</label>
          <div className="chip-group">
            {allCats.map(c => (
              <div
                key={`cat_${c.id}`}
                className={`chip ${isSelected(`cat_${c.id}`) ? 'selected' : ''}`}
                onClick={() => toggleItem(`cat_${c.id}`)}
              >
                {c.name}
              </div>
            ))}
          </div>
        </div>
      )}
      {allGroups.length > 0 && (
        <div className="field">
          <label>Gruppi di categorie</label>
          <div className="chip-group">
            {allGroups.map(g => (
              <div
                key={`grp_${g.id}`}
                className={`chip ${isSelected(`grp_${g.id}`) ? 'selected' : ''}`}
                onClick={() => toggleItem(`grp_${g.id}`)}
              >
                {g.name || g.category_group_members?.map(m => m.category?.name).join('+')}
              </div>
            ))}
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div className="field">
          <label>Minimi per categoria/gruppo</label>
          {selected.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, minWidth: 60 }}>{labelFor(s.key)}</span>
              <input
                type="number" min={1} max={10}
                value={mins[s.key] || 2}
                onChange={e => setMins(m => ({ ...m, [s.key]: +e.target.value }))}
                style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              />
              <span style={{ fontSize: 11, color: '#aaa' }}>min.</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ALLENAMENTI RICORRENTI
   ============================================================ */
function TrainingsTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [dow, setDow] = useState(1)
  const [startTime, setStartTime] = useState('17:00')
  const [endTime, setEndTime] = useState('')
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selected, setSelected] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)

  // Stato per eliminazione singola istanza
  const [showException, setShowException] = useState(null) // training id
  const [exceptionDate, setExceptionDate] = useState('')
  const [savingException, setSavingException] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('recurring_trainings')
      .select(`
        *,
        recurring_training_categories(
          min_coaches,
          category_id,
          group_id,
          category:categories(id,name),
          group:category_groups(id,name,category_group_members(category:categories(id,name)))
        ),
        training_instance_exceptions(id, instance_date)
      `)
      .eq('active', true)
      .order('day_of_week')
    setItems(data || [])
  }

  function resetForm() {
    setShowForm(false); setDow(1); setStartTime('17:00'); setEndTime(''); setTitle('')
    setStartDate(''); setEndDate(''); setSelected([]); setMins({})
  }

  async function save() {
    if (!selected.length) return
    setSaving(true)
    const { data: tr } = await supabase.from('recurring_trainings').insert({
      day_of_week: dow,
      start_time: startTime,
      end_time: endTime || null,
      title: title.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
    }).select().single()

    const rows = selected.map(s => ({
      training_id: tr.id,
      category_id: s.type === 'category' ? s.id : null,
      group_id: s.type === 'group' ? s.id : null,
      min_coaches: mins[s.key] || 2,
    }))
    await supabase.from('recurring_training_categories').insert(rows)
    setSaving(false); resetForm(); load()
  }

  async function remove(id) {
    if (!window.confirm('Rimuovere questo allenamento ricorrente?')) return
    await supabase.from('recurring_trainings').update({ active: false }).eq('id', id)
    load()
  }

  async function addException(trainingId) {
    if (!exceptionDate) return
    setSavingException(true)
    await supabase.from('training_instance_exceptions').insert({
      training_id: trainingId,
      instance_date: exceptionDate,
    })
    setSavingException(false)
    setShowException(null)
    setExceptionDate('')
    load()
  }

  async function removeException(id) {
    await supabase.from('training_instance_exceptions').delete().eq('id', id)
    load()
  }

  function slotLabel(rtc) {
    if (rtc.category) return rtc.category.name
    if (rtc.group) return rtc.group.name || rtc.group.category_group_members?.map(m => m.category?.name).join('+')
    return '?'
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Allenamenti ricorrenti</div>

      {items.map(t => (
        <div className="card" key={t.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {t.title && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t.title}</div>}
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {DAYS[t.day_of_week]} — {t.start_time}{t.end_time ? ` → ${t.end_time}` : ''}
              </div>
              {(t.start_date || t.end_date) && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {t.start_date && `Dal ${t.start_date}`}{t.end_date && ` al ${t.end_date}`}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                {t.recurring_training_categories?.map((c, i) => (
                  <span key={i} className="badge badge-gray" style={{ marginRight: 4 }}>
                    {slotLabel(c)} min.{c.min_coaches}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowException(showException === t.id ? null : t.id); setExceptionDate('') }}
              >
                🚫 Salta data
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>Rimuovi</button>
            </div>
          </div>

          {/* Eccezioni esistenti */}
          {t.training_instance_exceptions?.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Date saltate:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {t.training_instance_exceptions.map(ex => (
                  <span key={ex.id} style={{
                    fontSize: 11, background: '#fee2e2', color: '#991b1b',
                    padding: '2px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    {ex.instance_date}
                    <span
                      style={{ cursor: 'pointer', fontWeight: 700 }}
                      onClick={() => removeException(ex.id)}
                    >×</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Form aggiunta eccezione */}
          {showException === t.id && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <label>Data da saltare</label>
                <input type="date" value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => addException(t.id)}
                disabled={!exceptionDate || savingException}
              >
                {savingException ? 'Salvataggio...' : 'Aggiungi'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowException(null)}>Annulla</button>
            </div>
          )}
        </div>
      ))}

      {!showForm && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={() => setShowForm(true)}
        >
          + Nuovo allenamento
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo allenamento ricorrente</div>

          <div className="field">
            <label>Titolo (opzionale)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="es. Allenamento portieri" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>Giorno</label>
              <select value={dow} onChange={e => setDow(+e.target.value)}>
                {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Ora inizio</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="field">
              <label>Data inizio (opzionale)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Data fine (opzionale)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Ora fine (opzionale)</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>

          <CategoryGroupSelector
            selected={selected} setSelected={setSelected}
            mins={mins} setMins={setMins}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!selected.length || saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ATTIVITÀ (ex Festival)
   ============================================================ */
function ActivitiesTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('festival')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [hostingTeam, setHostingTeam] = useState('')
  const [selected, setSelected] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('activities')
      .select(`
        *,
        activity_categories(
          min_coaches,
          category_id,
          group_id,
          category:categories(id,name),
          group:category_groups(id,name,category_group_members(category:categories(id,name)))
        )
      `)
      .order('date')
    setItems(data || [])
  }

  function resetForm() {
    setShowForm(false); setType('festival'); setTitle(''); setDate('')
    setStartTime('09:00'); setEndTime(''); setLocation(''); setHostingTeam('')
    setSelected([]); setMins({})
  }

  async function save() {
    if (!date || !selected.length) return
    if (type === 'other' && !title.trim()) return
    setSaving(true)
    const { data: act } = await supabase.from('activities').insert({
      type,
      title: title.trim() || null,
      date,
      start_time: startTime,
      end_time: endTime || null,
      location: location.trim() || null,
      hosting_team: hostingTeam.trim() || null,
    }).select().single()

    const rows = selected.map(s => ({
      activity_id: act.id,
      category_id: s.type === 'category' ? s.id : null,
      group_id: s.type === 'group' ? s.id : null,
      min_coaches: mins[s.key] || 2,
    }))
    await supabase.from('activity_categories').insert(rows)
    setSaving(false); resetForm(); load()
  }

  async function remove(id) {
    if (!window.confirm('Rimuovere questa attività?')) return
    await supabase.from('activities').delete().eq('id', id)
    load()
  }

  function slotLabel(ac) {
    if (ac.category) return ac.category.name
    if (ac.group) return ac.group.name || ac.group.category_group_members?.map(m => m.category?.name).join('+')
    return '?'
  }

  function activityLabel(act) {
    if (act.type === 'festival') return act.title || 'Festival'
    return act.title
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Attività</div>

      {items.map(act => (
        <div className="card" key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              {activityLabel(act)}{' '}
              <span className={`badge ${act.type === 'festival' ? 'badge-purple' : 'badge-coach'}`}>
                {act.type === 'festival' ? 'Festival' : 'Attività'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {act.date} — {act.start_time}{act.end_time ? ` → ${act.end_time}` : ''}
            </div>
            {act.location && <div style={{ fontSize: 12, color: '#888' }}>📍 {act.location}</div>}
            {act.hosting_team && <div style={{ fontSize: 12, color: '#888' }}>🏠 Ospitante: {act.hosting_team}</div>}
            <div style={{ marginTop: 4 }}>
              {act.activity_categories?.map((c, i) => (
                <span key={i} className="badge badge-gray" style={{ marginRight: 4 }}>
                  {slotLabel(c)} min.{c.min_coaches}
                </span>
              ))}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => remove(act.id)}>Rimuovi</button>
        </div>
      ))}

      {!showForm && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={() => setShowForm(true)}
        >
          + Nuova attività
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuova attività</div>

          <div className="field">
            <label>Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="festival">Festival</option>
              <option value="other">Altra attività</option>
            </select>
          </div>

          <div className="field">
            <label>{type === 'festival' ? 'Nome (opzionale)' : 'Titolo *'}</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={type === 'festival' ? 'es. Torneo primavera' : 'es. Amichevole'}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Ora inizio</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Ora fine (opzionale)</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>

          <div className="field">
            <label>Luogo (opzionale)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="es. Campo sportivo via Roma" />
          </div>

          {type === 'festival' && (
            <div className="field">
              <label>Squadra ospitante (opzionale)</label>
              <input value={hostingTeam} onChange={e => setHostingTeam(e.target.value)} placeholder="es. ASD Juventus" />
            </div>
          )}

          <CategoryGroupSelector
            selected={selected} setSelected={setSelected}
            mins={mins} setMins={setMins}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={!date || !selected.length || (type === 'other' && !title.trim()) || saving}
            >
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   GRUPPI CATEGORIE (invariato)
   ============================================================ */
function GroupsTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [allCats, setAllCats] = useState([])
  const [selCats, setSelCats] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: groups } = await supabase.from('category_groups').select(`*, category_group_members(category:categories(id,name))`)
    const { data: cats } = await supabase.from('categories').select('id,name')
    setItems(groups || [])
    setAllCats(cats || [])
  }

  async function save() {
    if (selCats.length < 2) return
    setSaving(true)
    const { data: g } = await supabase.from('category_groups').insert({ name: groupName || null }).select().single()
    await supabase.from('category_group_members').insert(
      selCats.map(id => ({ group_id: g.id, category_id: id }))
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
              {g.category_group_members?.map(m => (
                <span key={m.category?.id} style={{ display: 'inline-block', background: '#ede9fe', color: '#6d28d9', fontSize: 11, padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
                  {m.category?.name}
                </span>
              ))}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => remove(g.id)}>Rimuovi</button>
        </div>
      ))}

      {!showForm && (
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>
          + Nuovo gruppo
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo gruppo</div>
          <div className="field">
            <label>Nome gruppo (opzionale)</label>
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="es. Piccoli" />
          </div>
          <div className="field">
            <label>Categorie (seleziona almeno 2)</label>
            <div className="chip-group">
              {allCats.map(c => (
                <div
                  key={c.id}
                  className={`chip ${selCats.includes(c.id) ? 'selected' : ''}`}
                  onClick={() => setSelCats(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}
                >
                  {c.name}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={selCats.length < 2 || saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ALLENATORI
   ============================================================ */
function CoachesTab() {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('coach')
  const [saving, setSaving] = useState(false)

  // PIN admin
  const [showPinForm, setShowPinForm] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinMsg, setPinMsg] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setItems(data || [])
  }

  async function toggleRole(item) {
    const roles = ['coach', 'sostegno', 'admin']
    const next = roles[(roles.indexOf(item.role) + 1) % roles.length]
    await supabase.from('profiles').update({ role: next }).eq('id', item.id)
    load()
  }

  async function removeProfile(id) {
    if (!window.confirm('Rimuovere questo utente?')) return
    await supabase.from('profiles').delete().eq('id', id)
    load()
  }

  async function addProfile() {
    if (!fullName.trim()) return
    setSaving(true)
    await supabase.from('profiles').insert({ full_name: fullName.trim(), role })
    setSaving(false); setShowForm(false); setFullName(''); setRole('coach'); load()
  }

  function copyUrl() {
    navigator.clipboard.writeText(window.location.origin)
      .then(() => alert('Link copiato negli appunti!'))
      .catch(() => alert('Impossibile copiare automaticamente. URL: ' + window.location.origin))
  }

  async function savePin() {
    if (!newPin || newPin !== confirmPin) { setPinMsg('I PIN non coincidono'); return }
    if (newPin.length < 4) { setPinMsg('Il PIN deve essere di almeno 4 caratteri'); return }
    setSavingPin(true)
    setPinMsg('')
    // Verifica PIN corrente
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_pin').single()
    if (data?.value !== currentPin) { setPinMsg('PIN attuale non corretto'); setSavingPin(false); return }
    await supabase.from('app_settings').update({ value: newPin }).eq('key', 'admin_pin')
    setPinMsg('PIN aggiornato con successo!')
    setSavingPin(false)
    setCurrentPin(''); setNewPin(''); setConfirmPin('')
    setTimeout(() => { setShowPinForm(false); setPinMsg('') }, 1500)
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
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Gestione allenatori</div>

      {items.map(c => (
        <div className="card" key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              {c.full_name}{' '}
              <span className={`badge ${roleBadgeClass(c.role)}`}>{roleLabel(c.role)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => toggleRole(c)}>
              Cambia ruolo
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => removeProfile(c.id)}>
              Rimuovi
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {!showForm && (
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowForm(true)}
          >
            + Aggiungi utente
          </button>
        )}

        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={copyUrl}
        >
          🔗 Condividi link app
        </button>

        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => setShowPinForm(!showPinForm)}
        >
          🔑 Modifica PIN amministratore
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Aggiungi utente</div>
          <div className="field">
            <label>Nome e cognome</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Mario Rossi" autoFocus />
          </div>
          <div className="field">
            <label>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="coach">Allenatore</option>
              <option value="sostegno">Sostegno</option>
              <option value="admin">Amministratore</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={addProfile} disabled={!fullName.trim() || saving}>
              {saving ? 'Salvataggio...' : 'Aggiungi'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annulla</button>
          </div>
        </div>
      )}

      {showPinForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Modifica PIN amministratore</div>
          <div className="field">
            <label>PIN attuale</label>
            <input type="password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} placeholder="••••" />
          </div>
          <div className="field">
            <label>Nuovo PIN</label>
            <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="••••" />
          </div>
          <div className="field">
            <label>Conferma nuovo PIN</label>
            <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="••••" />
          </div>
          {pinMsg && (
            <p style={{ fontSize: 12, color: pinMsg.includes('successo') ? '#16a34a' : '#ef4444', marginBottom: 8 }}>
              {pinMsg}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={savePin} disabled={!currentPin || !newPin || !confirmPin || savingPin}>
              {savingPin ? 'Salvataggio...' : 'Salva PIN'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowPinForm(false); setPinMsg('') }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}
