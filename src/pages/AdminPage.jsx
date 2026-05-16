import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const DAYS = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const TYPE_LABEL = { training: '🏉 Allenamento', festival: '🏆 Festival', school: '📚 Scuola', other: '🎉 Evento' }
const TYPE_BADGE = { training: 'badge-admin', festival: 'badge-purple', school: 'badge-orange', other: 'badge-gray' }

// ============================================================
// ADMIN PAGE
// ============================================================
export default function AdminPage() {
  const [tab, setTab] = useState('activities')
  const [allCats, setAllCats] = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [allRoles, setAllRoles] = useState([])

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    const [catsRes, groupsRes, rolesRes] = await Promise.all([
      supabase.from('categories').select('id,name').order('name'),
      supabase.from('category_groups').select('id,name,category_group_members(category:categories(id,name))'),
      supabase.from('roles').select('id,name').eq('active', true).order('name'),
    ])
    setAllCats(catsRes.data || [])
    setAllGroups(groupsRes.data || [])
    setAllRoles(rolesRes.data || [])
  }

  const tabs = [
    { id: 'activities', label: 'Attività' },
    { id: 'config', label: 'Configurazione' },
    { id: 'coaches', label: 'Allenatori' },
  ]

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
      {tab === 'activities' && (
        <ActivitiesTab allCats={allCats} allGroups={allGroups} allRoles={allRoles} onRolesChanged={loadConfig} />
      )}
      {tab === 'config' && (
        <ConfigTab allCats={allCats} allGroups={allGroups} allRoles={allRoles} onChanged={loadConfig} />
      )}
      {tab === 'coaches' && <CoachesTab />}
    </div>
  )
}

// ============================================================
// ACTIVITIES TAB
// ============================================================
function ActivitiesTab({ allCats, allGroups, allRoles, onRolesChanged }) {
  const [events, setEvents] = useState([])
  const [filter, setFilter] = useState('all')
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [formType, setFormType] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('events')
      .select(`
        *,
        event_slots(
          id, min_coaches, category_id, group_id, role_id,
          category:categories(id,name),
          group:category_groups(id,name),
          role:roles(id,name)
        )
      `)
      .eq('active', true)
      .order('type')
      .order('start_date', { nullsFirst: true })
    setEvents(data || [])
  }

  async function removeEvent(id) {
    if (!window.confirm('Rimuovere questa attività?')) return
    await supabase.from('events').update({ active: false }).eq('id', id)
    load()
  }

  const filters = [
    { key: 'all', label: 'Tutti' },
    { key: 'training', label: '🏉 Allenamenti' },
    { key: 'festival', label: '🏆 Festival' },
    { key: 'school', label: '📚 Scuola' },
    { key: 'other', label: '🎉 Eventi' },
  ]

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter)

  function slotLabel(slot) {
    if (slot.category) return slot.category.name
    if (slot.group) return slot.group.name
    if (slot.role) return slot.role.name
    return '?'
  }

  function eventSubtitle(ev) {
    const parts = []
    if (ev.days_of_week?.length > 0) {
      parts.push(ev.days_of_week.map(d => DAYS[d]).join(' + '))
    } else if (ev.day_of_week) {
      parts.push(DAYS[ev.day_of_week])
    }
    if (ev.start_date) parts.push(format(new Date(ev.start_date + 'T00:00:00'), 'dd-MM-yyyy', { locale: it }))
    if (ev.start_time) parts.push(ev.start_time.slice(0,5) + (ev.end_time ? ` → ${ev.end_time.slice(0,5)}` : ''))
    if (ev.location) parts.push(`📍 ${ev.location}`)
    return parts.join(' · ')
  }

  if (formType) {
    return (
      <EventForm
        type={formType}
        event={editingEvent}
        allCats={allCats}
        allGroups={allGroups}
        allRoles={allRoles}
        onSaved={() => { setFormType(null); setEditingEvent(null); load() }}
        onCancel={() => { setFormType(null); setEditingEvent(null) }}
        onRolesChanged={onRolesChanged}
      />
    )
  }

  return (
    <div>
      {/* Filter + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 12px', border: '1px solid', borderRadius: 20, fontSize: 12,
              cursor: 'pointer', fontWeight: filter === f.key ? 600 : 400,
              borderColor: filter === f.key ? '#1a1a1a' : '#e5e5e5',
              background: filter === f.key ? '#f0f0ee' : '#fff',
              color: filter === f.key ? '#1a1a1a' : '#888',
            }}>{f.label}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowTypeModal(true)}>
          + Nuova attività
        </button>
      </div>

      {/* Event list */}
      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: 32 }}>
          Nessuna attività in questa categoria.
        </div>
      )}

      {filtered.map(ev => (
        <div className="card" key={ev.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span className={`badge ${TYPE_BADGE[ev.type]}`}>{TYPE_LABEL[ev.type]}</span>
                {ev.title && <span style={{ fontWeight: 500, fontSize: 13 }}>{ev.title}</span>}
                {ev.days_of_week?.length > 1 && (
                  <span style={{ fontSize: 11, background: '#f0f0ee', color: '#555', padding: '1px 6px', borderRadius: 4 }}>ricorrente</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{eventSubtitle(ev)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ev.event_slots?.map((s, i) => (
                  <span key={i} className="badge badge-gray">
                    {slotLabel(s)} min.{s.min_coaches}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditingEvent(ev); setFormType(ev.type) }}>
                ✏️ Modifica
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => removeEvent(ev.id)}>
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Type selection modal */}
      {showTypeModal && (
        <TypeSelectionModal
          onSelect={(type) => { setFormType(type); setShowTypeModal(false) }}
          onClose={() => setShowTypeModal(false)}
        />
      )}
    </div>
  )
}

// ============================================================
// TYPE SELECTION MODAL
// ============================================================
function TypeSelectionModal({ onSelect, onClose }) {
  const [selected, setSelected] = useState('training')
  const types = [
    { key: 'training', icon: '🏉', label: 'Allenamento', sub: 'Ricorrente su più giorni' },
    { key: 'festival', icon: '🏆', label: 'Festival', sub: 'Data singola, categorie' },
    { key: 'school', icon: '📚', label: 'Scuola', sub: 'Classi con orari' },
    { key: 'other', icon: '🎉', label: 'Evento', sub: 'Con compiti ad hoc' },
  ]
  const descs = {
    training: 'Allenamento ricorrente su uno o più giorni a settimana. Scegli categorie/gruppi con minimi di copertura.',
    festival: 'Festival o torneo in data specifica. Solo categorie, con location e squadra ospitante opzionali.',
    school: 'Progetto scuola con classi e orari. Ricorrenza fissa o date variabili settimana per settimana.',
    other: 'Evento con compiti ad hoc (es. cassa, friggitrice). Chi partecipa può scegliere un compito o restare senza.',
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-head">
          <div className="modal-title">Nuova attività</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Scegli il tipo di attività da creare:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {types.map(t => (
              <div key={t.key} onClick={() => setSelected(t.key)} style={{
                border: `2px solid ${selected === t.key ? '#1a1a1a' : '#e5e5e5'}`,
                borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                background: selected === t.key ? '#f0f0ee' : '#fff',
                transition: 'all 0.12s',
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{t.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#f5f5f4', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#555' }}>
            ℹ️ {descs[selected]}
          </div>
        </div>
        <div className="modal-actions" style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => onSelect(selected)}>
            Avanti →
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Annulla</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// EVENT FORM (unificato per tutti e 4 i tipi)
// ============================================================
function EventForm({ type, event: editingEvent, allCats, allGroups, allRoles, onSaved, onCancel, onRolesChanged }) {
  const isEdit = !!editingEvent

  // Campi comuni
  const [title, setTitle] = useState(editingEvent?.title || '')
  const [startTime, setStartTime] = useState(editingEvent?.start_time?.slice(0,5) || '17:30')
  const [endTime, setEndTime] = useState(editingEvent?.end_time?.slice(0,5) || '')
  const [location, setLocation] = useState(editingEvent?.location || '')
  const [hostingTeam, setHostingTeam] = useState(editingEvent?.hosting_team || '')
  const [startDate, setStartDate] = useState(editingEvent?.start_date || '')
  const [endDate, setEndDate] = useState(editingEvent?.end_date || '')

  // Training: giorni multipli
  const [selectedDays, setSelectedDays] = useState(editingEvent?.days_of_week || (editingEvent?.day_of_week ? [editingEvent.day_of_week] : []))

  // School
  const [schoolMode, setSchoolMode] = useState('fixed') // 'fixed' | 'variable'
  const [variableDates, setVariableDates] = useState([''])
  const [classes, setClasses] = useState(
    editingEvent?.school_classes || [{ grade: '', section: '', notes: '', min_coaches: 2, start_time: '' }]
  )
  const [hourDuration, setHourDuration] = useState(editingEvent?.hour_duration || 60)

  // Slots (categorie/gruppi)
  const [selectedSlots, setSelectedSlots] = useState([])
  const [mins, setMins] = useState({})

  // Compiti (solo per type=other)
  const [selectedRoles, setSelectedRoles] = useState([])
  const [roleMins, setRoleMins] = useState({})
  const [newRoleName, setNewRoleName] = useState('')

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // Pre-carica i slot se in edit
  useEffect(() => {
    if (editingEvent?.event_slots) {
      const preSlots = []
      const preMins = {}
      const preRoles = []
      const preRoleMins = {}
      for (const s of editingEvent.event_slots) {
        if (s.category_id) {
          const key = `cat_${s.category_id}`
          preSlots.push({ key, type: 'category', id: s.category_id, name: s.category.name })
          preMins[key] = s.min_coaches
        } else if (s.group_id) {
          const key = `grp_${s.group_id}`
          preSlots.push({ key, type: 'group', id: s.group_id, name: s.group.name })
          preMins[key] = s.min_coaches
        } else if (s.role_id) {
          const key = `role_${s.role_id}`
          preRoles.push({ key, id: s.role_id, name: s.role.name })
          preRoleMins[key] = s.min_coaches
        }
      }
      setSelectedSlots(preSlots)
      setMins(preMins)
      setSelectedRoles(preRoles)
      setRoleMins(preRoleMins)
    }
  }, [])

  function toggleDay(d) {
    setSelectedDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    )
  }

  function toggleSlot(item) {
    setSelectedSlots(prev => {
      const exists = prev.find(s => s.key === item.key)
      if (exists) return prev.filter(s => s.key !== item.key)
      return [...prev, item]
    })
    setMins(m => ({ ...m, [item.key]: m[item.key] ?? 2 }))
  }

  function toggleRole(role) {
    const key = `role_${role.id}`
    setSelectedRoles(prev => {
      const exists = prev.find(r => r.key === key)
      if (exists) return prev.filter(r => r.key !== key)
      return [...prev, { key, id: role.id, name: role.name }]
    })
    setRoleMins(m => ({ ...m, [key]: m[key] ?? 1 }))
  }

  async function addNewRole() {
    if (!newRoleName.trim()) return
    const { data } = await supabase.from('roles').insert({ name: newRoleName.trim() }).select().single()
    if (data) {
      onRolesChanged()
      setNewRoleName('')
      const key = `role_${data.id}`
      setSelectedRoles(prev => [...prev, { key, id: data.id, name: data.name }])
      setRoleMins(m => ({ ...m, [key]: 1 }))
    }
  }

  function calcNextTime(prevTime, duration) {
    if (!prevTime) return ''
    const [h, m] = prevTime.split(':').map(Number)
    const totalMin = h * 60 + m + duration
    const nh = Math.floor(totalMin / 60) % 24
    const nm = totalMin % 60
    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0')
  }

  function addClassRow() {
    setClasses(prev => {
      const last = prev[prev.length - 1]
      const nextTime = last?.start_time ? calcNextTime(last.start_time, hourDuration) : ''
      return [...prev, { grade: '', section: '', notes: '', min_coaches: 2, start_time: nextTime }]
    })
  }

  function updateClass(i, field, value) {
    setClasses(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  function removeClass(i) {
    setClasses(prev => prev.filter((_, idx) => idx !== i))
  }

  function validate() {
    const e = {}
    if (type === 'training' && selectedDays.length === 0) e.days = 'Seleziona almeno un giorno'
    if ((type === 'festival' || type === 'other') && !startDate) e.startDate = 'Data obbligatoria'
    if (type === 'school' && schoolMode === 'fixed' && selectedDays.length === 0) e.days = 'Seleziona almeno un giorno'
    if (type !== 'other' && type !== 'school' && selectedSlots.length === 0) e.slots = 'Seleziona almeno una categoria o gruppo'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    setSaving(true)

    try {
      const payload = {
        type,
        title: title.trim() || null,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location.trim() || null,
        hosting_team: type === 'festival' ? (hostingTeam.trim() || null) : null,
        active: true,
      }

      // Campi specifici per tipo
      if (type === 'training') {
        payload.days_of_week = selectedDays.sort()
        payload.day_of_week = selectedDays[0] || null // Compatibilità
        payload.start_date = startDate || null
        payload.end_date = endDate || null
      } else if (type === 'festival' || type === 'other') {
        payload.start_date = startDate
        payload.end_date = startDate
      } else if (type === 'school') {
        payload.start_date = startDate || null
        payload.end_date = endDate || null
        if (schoolMode === 'fixed') {
          payload.days_of_week = selectedDays.sort()
        }
      }

      let eventId
      if (isEdit) {
        await supabase.from('events').update(payload).eq('id', editingEvent.id)
        eventId = editingEvent.id
        // Elimina slot esistenti e ricrea
        await supabase.from('event_slots').delete().eq('event_id', eventId)
      } else {
        const { data: ev, error } = await supabase.from('events').insert(payload).select().single()
        if (error) throw error
        eventId = ev.id

        // Crea istanze per eventi non ricorrenti
        if (type === 'festival' || type === 'other') {
          await supabase.from('event_instances').insert({
            event_id: eventId,
            instance_date: startDate,
          })
        } else if (type === 'school' && schoolMode === 'variable') {
          for (const d of variableDates.filter(Boolean)) {
            await supabase.from('event_instances').insert({ event_id: eventId, instance_date: d })
          }
        }
      }

      // Inserisci slot/categorie/gruppi
      for (const s of selectedSlots) {
        await supabase.from('event_slots').insert({
          event_id: eventId,
          category_id: s.type === 'category' ? s.id : null,
          group_id: s.type === 'group' ? s.id : null,
          role_id: null,
          min_coaches: mins[s.key] ?? 2,
        })
      }

      // Inserisci ruoli per eventi 'other'
      if (type === 'other') {
        for (const r of selectedRoles) {
          await supabase.from('event_slots').insert({
            event_id: eventId,
            category_id: null,
            group_id: null,
            role_id: r.id,
            min_coaches: roleMins[r.key] ?? 1,
          })
        }
      }

      // Per scuola: genera school_class_instances per ogni data ricorrente
      if (type === 'school' && classes.length > 0) {
        // Calcola tutte le date ricorrenti dell'evento
        const recurDates = []
        if (schoolMode === 'fixed' && selectedDays.length > 0) {
          const from = startDate ? new Date(startDate + 'T00:00:00') : new Date()
          const to   = endDate   ? new Date(endDate   + 'T00:00:00') : new Date(from.getTime() + 365*864e5)
          let cur = new Date(from)
          while (cur <= to) {
            const jsDay  = cur.getDay()
            const isoDay = jsDay === 0 ? 7 : jsDay
            if (selectedDays.includes(isoDay)) {
              recurDates.push(cur.toISOString().slice(0,10))
            }
            cur.setDate(cur.getDate() + 1)
          }
        } else if (schoolMode === 'variable') {
          variableDates.filter(Boolean).forEach(d => recurDates.push(d))
        }

        // Inserisci una riga per ogni classe × ogni data
        for (const cls of classes.filter(c => c.grade && c.section)) {
          for (const dateStr of recurDates) {
            await supabase.from('school_class_instances').insert({
              event_id:      eventId,
              grade:         parseInt(cls.grade),
              section:       cls.section,
              instance_date: dateStr,
              original_date: dateStr,
              start_time:    cls.start_time || null,
              min_coaches:   cls.min_coaches || 2,
              notes:         cls.notes || null,
            })
          }
        }
      }

      setSaving(false)
      onSaved()
    } catch (err) {
      console.error(err)
      alert('Errore nel salvataggio: ' + err.message)
      setSaving(false)
    }
  }

  const typeTitle = isEdit ? `Modifica ${TYPE_LABEL[type]}` : `Nuovo ${TYPE_LABEL[type]}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>← Indietro</button>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{typeTitle}</span>
      </div>

      <div className="card">
        {/* TITOLO */}
        <div className="field">
          <label>{type === 'school' || type === 'other' ? 'Titolo *' : 'Titolo (opzionale)'}</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={
              type === 'training' ? 'es. Allenamento portieri' :
              type === 'festival' ? 'es. Torneo primavera' :
              type === 'school' ? 'es. Progetto scuola 2C' :
              'es. Autofinanziamento — Friggitrice'
            }
          />
        </div>

        {/* ORARIO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Ora inizio</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Ora fine (opzionale)</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>

        {/* TRAINING: giorni multipli + date */}
        {type === 'training' && (
          <>
            <div className="field">
              <label>
                Giorni della settimana
                {errors.days && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 6 }}>{errors.days}</span>}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {[1,2,3,4,5,6,7].map(d => (
                  <div
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`chip${selectedDays.includes(d) ? ' selected' : ''}`}
                    style={{ minWidth: 48, textAlign: 'center' }}
                  >
                    {DAYS[d].slice(0,3)}
                  </div>
                ))}
              </div>
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
        )}

        {/* FESTIVAL: data singola + location */}
        {type === 'festival' && (
          <>
            <div className="field">
              <label>
                Data *
                {errors.startDate && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 6 }}>{errors.startDate}</span>}
              </label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setErrors(er => ({ ...er, startDate: undefined })) }} />
            </div>
            <div className="field">
              <label>Luogo (opzionale)</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="es. Campo sportivo via Roma" />
            </div>
            <div className="field">
              <label>Squadra ospitante (opzionale)</label>
              <input value={hostingTeam} onChange={e => setHostingTeam(e.target.value)} placeholder="es. ASD Rossi" />
            </div>
          </>
        )}

        {/* SCHOOL: ricorrenza + classi */}
        {type === 'school' && (
          <>
            <div className="field">
              <label>Modalità</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className={`chip${schoolMode === 'fixed' ? ' selected' : ''}`} onClick={() => setSchoolMode('fixed')}>
                  🔁 Giorni fissi
                </div>
                <div className={`chip${schoolMode === 'variable' ? ' selected' : ''}`} onClick={() => setSchoolMode('variable')}>
                  📅 Date variabili
                </div>
              </div>
            </div>

            {schoolMode === 'fixed' ? (
              <>
                <div className="field">
                  <label>
                    Giorni della settimana
                    {errors.days && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 6 }}>{errors.days}</span>}
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {[1,2,3,4,5,6,7].map(d => (
                      <div key={d} onClick={() => toggleDay(d)} className={`chip${selectedDays.includes(d) ? ' selected' : ''}`} style={{ minWidth: 48, textAlign: 'center' }}>
                        {DAYS[d].slice(0,3)}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Dal</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Al</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
              <div className="field">
                <label>Date singole</label>
                {variableDates.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input type="date" value={d} onChange={e => setVariableDates(prev => prev.map((x, idx) => idx === i ? e.target.value : x))} className="mock-input" style={{ flex: 1 }} />
                    <button className="btn btn-danger btn-sm" onClick={() => setVariableDates(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm" onClick={() => setVariableDates(prev => [...prev, ''])}>+ Aggiungi data</button>
              </div>
            )}

            <div className="field">
              <label>Luogo (opzionale)</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="es. Scuola Media Fondo Comini" />
            </div>

            {/* Durata lezione */}
            <div className="field">
              <label>Durata ogni lezione</label>
              <select value={hourDuration} onChange={e => setHourDuration(+e.target.value)}>
                <option value={45}>45 min</option>
                <option value={50}>50 min</option>
                <option value={60}>60 min (standard)</option>
                <option value={90}>90 min</option>
              </select>
            </div>

            {/* Classi */}
            <div className="field">
              <label>Classi (opzionale)</label>
              {classes.map((c, i) => (
                <div key={i} style={{ background: '#f8f8f7', border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {/* Classe 1-5 */}
                    <div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Classe</div>
                      <select
                        value={c.grade}
                        onChange={e => updateClass(i, 'grade', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                      >
                        <option value="">—</option>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}ª</option>)}
                      </select>
                    </div>
                    {/* Sezione A-Z */}
                    <div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Sezione</div>
                      <select
                        value={c.section}
                        onChange={e => updateClass(i, 'section', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                      >
                        <option value="">—</option>
                        {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    {/* Min allenatori */}
                    <div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Min. allenatori</div>
                      <input
                        type="number" min={1} max={10}
                        value={c.min_coaches}
                        onChange={e => updateClass(i, 'min_coaches', +e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                  </div>
                  {/* Orario — selettore ore + minuti */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Orario inizio</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={c.start_time ? c.start_time.slice(0,2) : ''}
                        onChange={e => {
                          const mins = c.start_time ? c.start_time.slice(3,5) : '00'
                          updateClass(i, 'start_time', e.target.value ? `${e.target.value}:${mins}` : '')
                        }}
                        style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                      >
                        <option value="">Ora</option>
                        {Array.from({length: 14}, (_,h) => h+7).map(h =>
                          <option key={h} value={String(h).padStart(2,'0')}>{String(h).padStart(2,'0')}</option>
                        )}
                      </select>
                      <span style={{ color: '#888', fontWeight: 600 }}>:</span>
                      <select
                        value={c.start_time ? c.start_time.slice(3,5) : ''}
                        onChange={e => {
                          const hrs = c.start_time ? c.start_time.slice(0,2) : '08'
                          updateClass(i, 'start_time', hrs ? `${hrs}:${e.target.value}` : '')
                        }}
                        style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                      >
                        {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m =>
                          <option key={m} value={m}>{m}</option>
                        )}
                      </select>
                    </div>
                  </div>
                  {/* Note */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Note (opzionale)</div>
                    <input
                      value={c.notes}
                      onChange={e => updateClass(i, 'notes', e.target.value)}
                      placeholder="es. Palestra B, orario speciale..."
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                    />
                  </div>
                  <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => removeClass(i)}>
                    × Rimuovi classe
                  </button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={addClassRow}>
                + Aggiungi classe
              </button>
              {classes.length > 0 && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                  💡 L'orario della prossima classe viene suggerito automaticamente (+{hourDuration} min)
                </div>
              )}
            </div>
          </>
        )}

        {/* OTHER: data + location + compiti */}
        {type === 'other' && (
          <>
            <div className="field">
              <label>
                Data *
                {errors.startDate && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 6 }}>{errors.startDate}</span>}
              </label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setErrors(er => ({ ...er, startDate: undefined })) }} />
            </div>
            <div className="field">
              <label>Luogo (opzionale)</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="es. Campo rugby" />
            </div>

            {/* Compiti */}
            <div className="field">
              <label>Compiti</label>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                Seleziona compiti esistenti o creane di nuovi:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {allRoles.map(r => {
                  const key = `role_${r.id}`
                  const isSel = !!selectedRoles.find(x => x.key === key)
                  return (
                    <div key={r.id} className={`chip${isSel ? ' selected' : ''}`} onClick={() => toggleRole(r)}>
                      {r.name}
                    </div>
                  )
                })}
              </div>

              {/* Minimi per ruolo */}
              {selectedRoles.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Minimi per compito:</div>
                  {selectedRoles.map(r => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, flex: 1 }}>{r.name}</span>
                      <input
                        type="number" min={1} max={10}
                        value={roleMins[r.key] ?? 1}
                        onChange={e => setRoleMins(m => ({ ...m, [r.key]: +e.target.value }))}
                        style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                      />
                      <span style={{ fontSize: 11, color: '#aaa' }}>min.</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Nuovo compito */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNewRole()}
                  placeholder="Nuovo compito..."
                  style={{ flex: 1, padding: '6px 10px', border: '1px dashed #ddd', borderRadius: 6, fontSize: 12 }}
                />
                <button className="btn btn-secondary btn-sm" onClick={addNewRole} disabled={!newRoleName.trim()}>
                  + Aggiungi
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                ℹ️ Chi non ha un compito può comunque dichiarare presenza.
              </div>
            </div>
          </>
        )}

        {/* SLOT CATEGORIE/GRUPPI (per training e festival) */}
        {(type === 'training' || type === 'festival') && (
          <>
            <div className="field">
              <label>
                Categorie
                {errors.slots && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 6 }}>{errors.slots}</span>}
              </label>
              <div className="chip-group">
                {allCats.map(c => {
                  const key = `cat_${c.id}`
                  return (
                    <div key={key} className={`chip${selectedSlots.find(s => s.key === key) ? ' selected' : ''}`}
                      onClick={() => toggleSlot({ key, type: 'category', id: c.id, name: c.name })}>
                      {c.name}
                    </div>
                  )
                })}
              </div>
            </div>

            {type === 'training' && (
              <div className="field">
                <label>Gruppi</label>
                <div className="chip-group">
                  {allGroups.map(g => {
                    const key = `grp_${g.id}`
                    const label = g.name || g.category_group_members?.map(m => m.category?.name).join('+')
                    return (
                      <div key={key} className={`chip${selectedSlots.find(s => s.key === key) ? ' selected' : ''}`}
                        onClick={() => toggleSlot({ key, type: 'group', id: g.id, name: label })}>
                        {label}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedSlots.length > 0 && (
              <div className="field">
                <label>Minimi copertura</label>
                {selectedSlots.map(s => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, minWidth: 80 }}>{s.name}</span>
                    <input
                      type="number" min={1} max={10}
                      value={mins[s.key] ?? 2}
                      onChange={e => setMins(m => ({ ...m, [s.key]: +e.target.value }))}
                      style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: '#aaa' }}>min. allenatori</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Salva'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CONFIG TAB (Gruppi categorie + Compiti)
// ============================================================
function ConfigTab({ allCats, allGroups, allRoles, onChanged }) {
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selCats, setSelCats] = useState([])
  const [groupError, setGroupError] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  const [showRoleForm, setShowRoleForm] = useState(false)
  const [roleName, setRoleName] = useState('')
  const [savingRole, setSavingRole] = useState(false)

  function toggleCat(id) {
    setSelCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setGroupError('')
  }

  async function saveGroup() {
    if (selCats.length < 2) { setGroupError('Seleziona almeno 2 categorie'); return }
    setSavingGroup(true)
    const { data: g } = await supabase.from('category_groups').insert({ name: groupName.trim() || null }).select().single()
    for (const catId of selCats) {
      await supabase.from('category_group_members').insert({ group_id: g.id, category_id: catId })
    }
    setSavingGroup(false)
    setShowGroupForm(false); setGroupName(''); setSelCats([]); setGroupError('')
    onChanged()
  }

  async function removeGroup(id) {
    if (!window.confirm('Rimuovere questo gruppo?')) return
    await supabase.from('category_groups').delete().eq('id', id)
    onChanged()
  }

  async function saveRole() {
    if (!roleName.trim()) return
    setSavingRole(true)
    await supabase.from('roles').insert({ name: roleName.trim() })
    setSavingRole(false)
    setShowRoleForm(false); setRoleName('')
    onChanged()
  }

  async function removeRole(id) {
    if (!window.confirm('Rimuovere questo compito?')) return
    await supabase.from('roles').update({ active: false }).eq('id', id)
    onChanged()
  }

  return (
    <div>
      {/* GRUPPI CATEGORIE */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
        Gruppi categorie
      </div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
        Un gruppo è un sottoinsieme di categorie che si allenano insieme e condividono la copertura jolly.
      </p>

      {allGroups.map(g => (
        <div className="card" key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              {g.name || g.category_group_members?.map(m => m.category?.name).join(' + ')}
            </div>
            <div style={{ marginTop: 4 }}>
              {g.category_group_members?.map(m => (
                <span key={m.category?.id} style={{ display: 'inline-block', background: '#ede9fe', color: '#6d28d9', fontSize: 11, padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
                  {m.category?.name}
                </span>
              ))}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => removeGroup(g.id)}>Rimuovi</button>
        </div>
      ))}

      {!showGroupForm ? (
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 28 }} onClick={() => setShowGroupForm(true)}>
          + Nuovo gruppo
        </button>
      ) : (
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo gruppo</div>
          <div className="field">
            <label>Nome (opzionale)</label>
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="es. Piccoli" />
          </div>
          <div className="field">
            <label>Categorie (min. 2)</label>
            <div className="chip-group">
              {allCats.map(c => (
                <div key={c.id} className={`chip${selCats.includes(c.id) ? ' selected' : ''}`} onClick={() => toggleCat(c.id)}>
                  {c.name}
                </div>
              ))}
            </div>
            {groupError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{groupError}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveGroup} disabled={savingGroup}>
              {savingGroup ? 'Salvataggio...' : 'Salva'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowGroupForm(false); setSelCats([]); setGroupError('') }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* COMPITI */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
        Compiti (per eventi)
      </div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
        I compiti sono riutilizzabili in tutti gli eventi (es. autofinanziamento). Puoi assegnarli anche dal form di creazione evento.
      </p>

      {allRoles.map(r => (
        <div className="card" key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</span>
          <button className="btn btn-danger btn-sm" onClick={() => removeRole(r.id)}>Rimuovi</button>
        </div>
      ))}

      {allRoles.length === 0 && (
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>Nessun compito creato ancora.</div>
      )}

      {!showRoleForm ? (
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowRoleForm(true)}>
          + Nuovo compito
        </button>
      ) : (
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo compito</div>
          <div className="field">
            <label>Nome compito</label>
            <input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="es. Cassa, Friggitrice, Merch..." autoFocus onKeyDown={e => e.key === 'Enter' && saveRole()} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveRole} disabled={!roleName.trim() || savingRole}>
              {savingRole ? 'Salvataggio...' : 'Salva'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowRoleForm(false); setRoleName('') }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// COACHES TAB (identico all'originale, solo spostato qui)
// ============================================================
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

  function copyUrl() {
    navigator.clipboard.writeText(window.location.origin)
      .then(() => alert('Link copiato negli appunti!'))
      .catch(() => alert('URL: ' + window.location.origin))
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
          <div className="field"><label>Conferma PIN</label><input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="••••" /></div>
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