import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

export default function AdminPage() {
  const [tab, setTab] = useState('trainings')
  const [allCats, setAllCats] = useState([])
  const [allGroups, setAllGroups] = useState([])

  // Carica categorie e gruppi una volta sola qui, poi li passa ai tab
  useEffect(() => {
    supabase.from('categories').select('id,name').order('name')
      .then(({ data }) => setAllCats(data || []))
    supabase.from('category_groups')
      .select('id, name, category_group_members(category:categories(id,name))')
      .then(({ data }) => setAllGroups(data || []))
  }, [])

  const tabs = [
    { id: 'trainings', label: 'Allenamenti' },
    { id: 'activities', label: 'Attività' },
    { id: 'groups', label: 'Gruppi categorie' },
    { id: 'coaches', label: 'Allenatori' },
  ]

  function reloadGroups() {
    supabase.from('category_groups')
      .select('id, name, category_group_members(category:categories(id,name))')
      .then(({ data }) => setAllGroups(data || []))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: 'transparent', color: tab === t.id ? '#1a1a1a' : '#888',
            borderBottom: tab === t.id ? '2px solid #1a1a1a' : '2px solid transparent', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'trainings' && <TrainingsTab allCats={allCats} allGroups={allGroups} />}
      {tab === 'activities' && <ActivitiesTab allCats={allCats} allGroups={allGroups} />}
      {tab === 'groups' && <GroupsTab allCats={allCats} onGroupsChanged={reloadGroups} />}
      {tab === 'coaches' && <CoachesTab />}
    </div>
  )
}

/* ============================================================
   SELETTORE CATEGORIE + GRUPPI
   Riceve allCats e allGroups come props — nessuna query interna
   ============================================================ */
function CategoryGroupSelector({ allCats, allGroups, selected, onToggle, mins, onMinChange }) {
  function isSelected(key) { return !!selected.find(s => s.key === key) }

  return (
    <div>
      {allCats.length > 0 && (
        <div className="field">
          <label>Categorie singole</label>
          <div className="chip-group">
            {allCats.map(c => {
              const key = `cat_${c.id}`
              return (
                <div
                  key={key}
                  className={`chip${isSelected(key) ? ' selected' : ''}`}
                  onClick={() => onToggle({ key, type: 'category', id: c.id, name: c.name })}
                >
                  {c.name}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {allGroups.length > 0 && (
        <div className="field">
          <label>Gruppi di categorie</label>
          <div className="chip-group">
            {allGroups.map(g => {
              const key = `grp_${g.id}`
              const label = g.name || g.category_group_members?.map(m => m.category?.name).join('+')
              return (
                <div
                  key={key}
                  className={`chip${isSelected(key) ? ' selected' : ''}`}
                  onClick={() => onToggle({ key, type: 'group', id: g.id, groupName: label })}
                >
                  {label}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {allCats.length === 0 && allGroups.length === 0 && (
        <p style={{ fontSize: 12, color: '#aaa' }}>Caricamento categorie...</p>
      )}

      {selected.length > 0 && (
        <div className="field">
          <label>Minimi per categoria/gruppo</label>
          {selected.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, minWidth: 80 }}>{s.type === 'category' ? s.name : s.groupName}</span>
              <input
                type="number" min={1} max={10}
                value={mins[s.key] ?? 2}
                onChange={e => onMinChange(s.key, +e.target.value)}
                style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              />
              <span style={{ fontSize: 11, color: '#aaa' }}>min. allenatori</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ALLENAMENTI
   ============================================================ */
function TrainingsTab({ allCats, allGroups }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [errors, setErrors] = useState({})
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('17:00')
  const [endTime, setEndTime] = useState('')
  const [isRecurring, setIsRecurring] = useState(true)
  const [dow, setDow] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [singleDate, setSingleDate] = useState('')
  const [selected, setSelected] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)
  const [showException, setShowException] = useState(null)
  const [exceptionDate, setExceptionDate] = useState('')
  const [savingException, setSavingException] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('recurring_trainings')
      .select(`
        *,
        recurring_training_categories(min_coaches, category_id, group_id,
          category:categories(id,name),
          group:category_groups(id,name,category_group_members(category:categories(id,name)))
        ),
        training_instance_exceptions(id, instance_date)
      `)
      .eq('active', true)
      .order('day_of_week')
    setItems(data || [])
  }

  function handleToggle(item) {
    setSelected(prev => {
      const exists = prev.find(s => s.key === item.key)
      if (exists) return prev.filter(s => s.key !== item.key)
      return [...prev, item]
    })
    setMins(m => ({ ...m, [item.key]: m[item.key] ?? 2 }))
    setErrors(e => ({ ...e, selected: undefined }))
  }

  function validate() {
    const e = {}
    if (!startTime) e.startTime = 'Orario di inizio obbligatorio'
    if (selected.length === 0) e.selected = 'Seleziona almeno una categoria o gruppo'
    if (!isRecurring && !singleDate) e.singleDate = 'Seleziona una data'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function resetForm() {
    setShowForm(false); setTitle(''); setStartTime('17:00'); setEndTime('')
    setIsRecurring(true); setDow(1); setStartDate(''); setEndDate('')
    setSingleDate(''); setSelected([]); setMins({}); setErrors({})
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    const { data: tr, error } = await supabase.from('recurring_trainings').insert({
      day_of_week: isRecurring ? dow : (new Date(singleDate + 'T00:00:00').getDay() || 7),
      start_time: startTime,
      end_time: endTime || null,
      title: title.trim() || null,
      start_date: isRecurring ? (startDate || null) : singleDate,
      end_date: isRecurring ? (endDate || null) : singleDate,
    }).select().single()

    if (error) { setSaving(false); alert('Errore: ' + error.message); return }
    console.log('training inserito:', tr)
    console.log('selected:', selected)

    for (const s of selected) {
      await supabase.from('recurring_training_categories').insert({
        training_id: tr.id,
        category_id: s.type === 'category' ? s.id : null,
        group_id: s.type === 'group' ? s.id : null,
        min_coaches: mins[s.key] ?? 2,
      })
    }
    setSaving(false); resetForm(); load()
  }

  async function remove(id) {
    if (!window.confirm('Rimuovere questo allenamento?')) return
    await supabase.from('recurring_trainings').update({ active: false }).eq('id', id); load()
  }

  async function addException(trainingId) {
    if (!exceptionDate) return
    setSavingException(true)
    await supabase.from('training_instance_exceptions').insert({ training_id: trainingId, instance_date: exceptionDate })
    setSavingException(false); setShowException(null); setExceptionDate(''); load()
  }

  async function removeException(id) {
    await supabase.from('training_instance_exceptions').delete().eq('id', id); load()
  }

  function slotLabel(rtc) {
    if (rtc.category) return rtc.category.name
    if (rtc.group) return rtc.group.name || rtc.group.category_group_members?.map(m => m.category?.name).join('+')
    return '?'
  }

  function trainingLabel(t) {
    if (t.start_date && t.start_date === t.end_date)
      return `${t.start_date} — ${t.start_time}${t.end_time ? ` → ${t.end_time}` : ''}`
    return `${DAYS[t.day_of_week]} — ${t.start_time}${t.end_time ? ` → ${t.end_time}` : ''}`
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Allenamenti</div>

      {items.map(t => (
        <div className="card" key={t.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {t.title && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t.title}</div>}
              <div style={{ fontWeight: 500, fontSize: 13 }}>{trainingLabel(t)}</div>
              {t.start_date && t.start_date !== t.end_date && (
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
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowException(showException === t.id ? null : t.id); setExceptionDate('') }}>
                🚫 Salta data
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>Rimuovi</button>
            </div>
          </div>

          {t.training_instance_exceptions?.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Date saltate:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {t.training_instance_exceptions.map(ex => (
                  <span key={ex.id} style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {ex.instance_date}
                    <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => removeException(ex.id)}>×</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {showException === t.id && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <label>Data da saltare</label>
                <input type="date" value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => addException(t.id)} disabled={!exceptionDate || savingException}>
                {savingException ? 'Salvataggio...' : 'Aggiungi'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowException(null)}>Annulla</button>
            </div>
          )}
        </div>
      ))}

      {!showForm && (
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>
          + Nuovo allenamento
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 16 }}>Nuovo allenamento</div>

          <div className="field">
            <label>Titolo (opzionale)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="es. Allenamento portieri" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Ora inizio {errors.startTime && <span style={{ color: '#ef4444' }}>*</span>}</label>
              <input type="time" value={startTime} onChange={e => { setStartTime(e.target.value); setErrors(er => ({ ...er, startTime: undefined })) }} />
              {errors.startTime && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{errors.startTime}</div>}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Ora fine (opzionale)</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Tipo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className={`chip${isRecurring ? ' selected' : ''}`} onClick={() => setIsRecurring(true)}>🔁 Ricorrente</div>
              <div className={`chip${!isRecurring ? ' selected' : ''}`} onClick={() => setIsRecurring(false)}>📅 Data singola</div>
            </div>
          </div>

          {isRecurring ? (
            <>
              <div className="field">
                <label>Giorno della settimana</label>
                <select value={dow} onChange={e => setDow(+e.target.value)}>
                  {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Dal (opzionale)</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Al (opzionale)</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <div className="field">
              <label>Data {errors.singleDate && <span style={{ color: '#ef4444', fontSize: 11 }}>— {errors.singleDate}</span>}</label>
              <input type="date" value={singleDate} onChange={e => { setSingleDate(e.target.value); setErrors(er => ({ ...er, singleDate: undefined })) }} />
            </div>
          )}

          <CategoryGroupSelector
            allCats={allCats}
            allGroups={allGroups}
            selected={selected}
            onToggle={handleToggle}
            mins={mins}
            onMinChange={(key, val) => setMins(m => ({ ...m, [key]: val }))}
          />
          {errors.selected && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{errors.selected}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
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
   ATTIVITÀ
   ============================================================ */
function ActivitiesTab({ allCats, allGroups }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [errors, setErrors] = useState({})
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
      .select(`*, activity_categories(min_coaches, category_id, group_id,
        category:categories(id,name),
        group:category_groups(id,name,category_group_members(category:categories(id,name)))
      )`)
      .order('date')
    setItems(data || [])
  }

  function handleToggle(item) {
    setSelected(prev => {
      const exists = prev.find(s => s.key === item.key)
      if (exists) return prev.filter(s => s.key !== item.key)
      return [...prev, item]
    })
    setMins(m => ({ ...m, [item.key]: m[item.key] ?? 2 }))
    setErrors(e => ({ ...e, selected: undefined }))
  }

  function validate() {
    const e = {}
    if (!date) e.date = 'Data obbligatoria'
    if (type === 'other' && !title.trim()) e.title = 'Il titolo è obbligatorio'
    if (selected.length === 0) e.selected = 'Seleziona almeno una categoria o gruppo'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function resetForm() {
    setShowForm(false); setType('festival'); setTitle(''); setDate('')
    setStartTime('09:00'); setEndTime(''); setLocation(''); setHostingTeam('')
    setSelected([]); setMins({}); setErrors({})
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    const { data: act, error } = await supabase.from('activities').insert({
      type, title: title.trim() || null, date,
      start_time: startTime, end_time: endTime || null,
      location: location.trim() || null,
      hosting_team: hostingTeam.trim() || null,
    }).select().single()

    if (error) { setSaving(false); alert('Errore: ' + error.message); return }

    for (const s of selected) {
      await supabase.from('activity_categories').insert({
        activity_id: act.id,
        category_id: s.type === 'category' ? s.id : null,
        group_id: s.type === 'group' ? s.id : null,
        min_coaches: mins[s.key] ?? 2,
      })
    }
    setSaving(false); resetForm(); load()
  }

  async function remove(id) {
    if (!window.confirm('Rimuovere questa attività?')) return
    await supabase.from('activities').delete().eq('id', id); load()
  }

  function slotLabel(ac) {
    if (ac.category) return ac.category.name
    if (ac.group) return ac.group.name || ac.group.category_group_members?.map(m => m.category?.name).join('+')
    return '?'
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Attività</div>

      {items.map(act => (
        <div className="card" key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              {act.title || 'Festival'}{' '}
              <span className={`badge ${act.type === 'festival' ? 'badge-purple' : 'badge-coach'}`}>
                {act.type === 'festival' ? 'Festival' : 'Attività'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {act.date} — {act.start_time}{act.end_time ? ` → ${act.end_time}` : ''}
            </div>
            {act.location && <div style={{ fontSize: 12, color: '#888' }}>📍 {act.location}</div>}
            {act.hosting_team && <div style={{ fontSize: 12, color: '#888' }}>🏠 {act.hosting_team}</div>}
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
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setShowForm(true)}>
          + Nuova attività
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 16 }}>Nuova attività</div>

          <div className="field">
            <label>Tipo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className={`chip${type === 'festival' ? ' selected' : ''}`} onClick={() => setType('festival')}>🏆 Festival</div>
              <div className={`chip${type === 'other' ? ' selected' : ''}`} onClick={() => setType('other')}>📋 Altra attività</div>
            </div>
          </div>

          <div className="field">
            <label>
              {type === 'festival' ? 'Nome (opzionale)' : 'Titolo *'}
              {errors.title && <span style={{ color: '#ef4444', marginLeft: 4, fontSize: 11 }}>{errors.title}</span>}
            </label>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setErrors(er => ({ ...er, title: undefined })) }}
              placeholder={type === 'festival' ? 'es. Torneo primavera' : 'es. Amichevole'}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Data {errors.date && <span style={{ color: '#ef4444', fontSize: 11 }}>— {errors.date}</span>}</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); setErrors(er => ({ ...er, date: undefined })) }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
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
              <input value={hostingTeam} onChange={e => setHostingTeam(e.target.value)} placeholder="es. ASD Rossi" />
            </div>
          )}

          <CategoryGroupSelector
            allCats={allCats}
            allGroups={allGroups}
            selected={selected}
            onToggle={handleToggle}
            mins={mins}
            onMinChange={(key, val) => setMins(m => ({ ...m, [key]: val }))}
          />
          {errors.selected && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{errors.selected}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
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
   GRUPPI CATEGORIE
   ============================================================ */
function GroupsTab({ allCats, onGroupsChanged }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selCats, setSelCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('category_groups').select(`*, category_group_members(category:categories(id,name))`)
    setItems(data || [])
  }

  function toggleCat(id) {
    setSelCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setError('')
  }

  async function save() {
    if (selCats.length < 2) { setError('Seleziona almeno 2 categorie'); return }
    setSaving(true)
    const { data: g } = await supabase.from('category_groups').insert({ name: groupName.trim() || null }).select().single()
    for (const catId of selCats) {
      await supabase.from('category_group_members').insert({ group_id: g.id, category_id: catId })
    }
    setSaving(false); setShowForm(false); setGroupName(''); setSelCats([]); setError('')
    load()
    onGroupsChanged()
  }

  async function remove(id) {
    if (!window.confirm('Rimuovere questo gruppo?')) return
    await supabase.from('category_groups').delete().eq('id', id)
    load()
    onGroupsChanged()
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Gruppi di categorie</div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Un gruppo è un sottoinsieme di categorie che si allenano insieme e condividono la copertura jolly.</p>

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
                  className={`chip${selCats.includes(c.id) ? ' selected' : ''}`}
                  onClick={() => toggleCat(c.id)}
                >
                  {c.name}
                </div>
              ))}
            </div>
            {allCats.length === 0 && <p style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Caricamento...</p>}
            {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{error}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setSelCats([]); setError('') }}>Annulla</button>
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
    await supabase.from('profiles').update({ role: next }).eq('id', item.id); load()
  }

  async function removeProfile(id) {
    if (!window.confirm('Rimuovere questo utente?')) return
    await supabase.from('profiles').delete().eq('id', id); load()
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
      .catch(() => alert('URL: ' + window.location.origin))
  }

  async function savePin() {
    if (!newPin || newPin !== confirmPin) { setPinMsg('I PIN non coincidono'); return }
    if (newPin.length < 4) { setPinMsg('Il PIN deve essere di almeno 4 caratteri'); return }
    setSavingPin(true); setPinMsg('')
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_pin').single()
    if (data?.value !== currentPin) { setPinMsg('PIN attuale non corretto'); setSavingPin(false); return }
    await supabase.from('app_settings').update({ value: newPin }).eq('key', 'admin_pin')
    setPinMsg('PIN aggiornato!'); setSavingPin(false)
    setCurrentPin(''); setNewPin(''); setConfirmPin('')
    setTimeout(() => { setShowPinForm(false); setPinMsg('') }, 1500)
  }

  const roleLabel = r => r === 'admin' ? 'Admin' : r === 'sostegno' ? 'Sostegno' : 'Allenatore'
  const roleBadge = r => r === 'admin' ? 'badge-admin' : r === 'sostegno' ? 'badge-sostegno' : 'badge-coach'

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Gestione allenatori</div>

      {items.map(c => (
        <div className="card" key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {c.full_name}{' '}
            <span className={`badge ${roleBadge(c.role)}`}>{roleLabel(c.role)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => toggleRole(c)}>Cambia ruolo</button>
            <button className="btn btn-danger btn-sm" onClick={() => removeProfile(c.id)}>Rimuovi</button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {!showForm && (
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowForm(true)}>
            + Aggiungi utente
          </button>
        )}
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={copyUrl}>
          🔗 Condividi link app
        </button>
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowPinForm(!showPinForm)}>
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
          <div className="field"><label>PIN attuale</label><input type="password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} placeholder="••••" /></div>
          <div className="field"><label>Nuovo PIN</label><input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="••••" /></div>
          <div className="field"><label>Conferma nuovo PIN</label><input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="••••" /></div>
          {pinMsg && <p style={{ fontSize: 12, color: pinMsg.includes('aggiornato') ? '#16a34a' : '#ef4444', marginBottom: 8 }}>{pinMsg}</p>}
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
