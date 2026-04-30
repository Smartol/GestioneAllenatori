import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getCovColor } from '../hooks/useCalendarData'

export default function EventModal({ event, attendances, onClose, onRefetch, onDelete }) {
  const { profile, isAdmin } = useAuth()
  const [view, setView] = useState('main')
  const myAttendance = attendances.find(a => a.coach_id === profile?.id)

  const title = event.title || 'Allenamento'
  const rawDate = event.dateStr || event.date || ''
  const dateObj = rawDate ? new Date(rawDate + 'T00:00:00') : new Date()
  const timeStr = event.start_time?.slice(0,5) || ''
  const endTimeStr = event.end_time?.slice(0,5) || ''
  const subtitle = `${timeStr}${endTimeStr ? ` → ${endTimeStr}` : ''} · ${format(dateObj, 'EEEE d MMMM yyyy', { locale: it })}`

  async function handleDelete() {
    if (event.eventType === 'training') {
      if (!window.confirm('Eliminare solo questa data o tutta la ricorrenza?')) return
      // Aggiunge un\'eccezione per questa data specifica
      await supabase.from('training_instance_exceptions').insert({
        training_id: event.id,
        instance_date: event.dateStr,
      })
    } else {
      if (!window.confirm('Eliminare questa attività?')) return
      await supabase.from('activities').delete().eq('id', event.id)
    }
    onDelete()
  }

  async function handleDeleteAll() {
    if (!window.confirm('Eliminare l\'intera ricorrenza?')) return
    await supabase.from('recurring_trainings').update({ active: false }).eq('id', event.id)
    onDelete()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">
              {title}
              {event.eventType === 'activity' && event.type === 'festival' ? ' ★ Festival' : ''}
              {event.eventType === 'activity' && event.type === 'other' ? ' · Attività' : ''}
            </div>
            <div className="modal-sub">{subtitle}</div>
            {event.location && <div className="modal-sub">📍 {event.location}</div>}
            {event.hosting_team && <div className="modal-sub">🏠 {event.hosting_team}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button className="modal-close" onClick={onClose}>✕</button>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {event.eventType === 'training' && (
                  <>
                    <button
                      onClick={handleDelete}
                      style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      🚫 Salta data
                    </button>
                    <button
                      onClick={handleDeleteAll}
                      style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      🗑 Elimina tutto
                    </button>
                  </>
                )}
                {event.eventType === 'activity' && (
                  <button
                    onClick={handleDelete}
                    style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    🗑 Elimina
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-body">
          {view === 'main' && (
            <MainView
              event={event}
              attendances={attendances}
              myAttendance={myAttendance}
              isAdmin={isAdmin}
              onSetView={setView}
            />
          )}
          {view === 'presence' && (
            <PresenceForm event={event} profile={profile} onDone={onRefetch} onCancel={() => setView('main')} />
          )}
          {view === 'note' && (
            <NoteForm event={event} profile={profile} onDone={onRefetch} onCancel={() => setView('main')} />
          )}
          {view === 'edit' && isAdmin && (
            <EditInstanceForm event={event} onDone={onRefetch} onCancel={() => setView('main')} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   MAIN VIEW
   ============================================================ */
function MainView({ event, attendances, myAttendance, isAdmin, onSetView }) {
  const colLabel = { green: 'Soddisfatta', orange: 'Con jolly / al limite', red: 'Insufficiente' }

  function slotAttendanceLabel(a) {
    if (a.is_jolly) return '⭐ Jolly'
    if (a.category?.name) return a.category.name
    if (a.group_id) return 'Gruppo'
    return '?'
  }

  function myPresenceLabel() {
    if (!myAttendance) return null
    if (myAttendance.is_jolly) return 'Jolly'
    if (myAttendance.category?.name) return myAttendance.category.name
    return 'Presente'
  }

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Copertura</div>
        {Object.entries(event.coverage || {}).map(([label, d]) => {
          const col = getCovColor({ [label]: d })
          return (
            <div className="cov-row" key={label}>
              <span>{label} — {d.present} pres.{d.jolly > 0 ? ` + ${d.jolly} jolly` : ''} / min {d.min}</span>
              <span className={`badge badge-${col}`}>{colLabel[col]}</span>
            </div>
          )
        })}
        {myAttendance && (
          <div style={{ marginTop: 8 }}>
            <span className="badge badge-green">✓ Presenza confermata — {myPresenceLabel()}</span>
          </div>
        )}
      </div>

      <div className="modal-section">
        <div className="modal-section-title">Allenatori presenti ({attendances.length})</div>
        {attendances.length === 0
          ? <p style={{ fontSize: 12, color: '#aaa' }}>Nessuna presenza dichiarata.</p>
          : attendances.map(a => (
            <div key={a.id} style={{ fontSize: 12, padding: '4px 0', color: '#555', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500 }}>{a.coach?.full_name}</span>
              <span style={{ color: '#888' }}>{slotAttendanceLabel(a)}</span>
            </div>
          ))
        }
      </div>

      <NotesList event={event} />

      <div className="modal-actions">
        {!myAttendance && (
          <button className="btn btn-primary btn-sm" onClick={() => onSetView('presence')}>
            Dichiara presenza
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => onSetView('note')}>
          Aggiungi nota
        </button>
        {isAdmin && event.eventType === 'training' && (
          <button className="btn btn-secondary btn-sm" onClick={() => onSetView('edit')}>
            Modifica istanza
          </button>
        )}
      </div>
    </>
  )
}

/* ============================================================
   NOTE LIST
   ============================================================ */
function NotesList({ event }) {
  const [notes, setNotes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [shown, setShown] = useState(false)

  async function loadNotes() {
    setLoading(true)
    let query = supabase
      .from('notes')
      .select(`*, author:profiles(full_name), note_images(id, storage_path)`)
      .order('created_at')
    if (event.eventType === 'training') {
      query = query.eq('training_id', event.id).eq('instance_date', event.dateStr)
    } else {
      query = query.eq('activity_id', event.id)
    }
    const { data } = await query
    setNotes(data || [])
    setShown(true)
    setLoading(false)
  }

  if (!shown) return (
    <div className="modal-section">
      <button className="btn btn-secondary btn-sm" onClick={loadNotes} disabled={loading}>
        {loading ? 'Caricamento...' : 'Mostra note'}
      </button>
    </div>
  )

  const scopeLabel = { single: 'Questo allenamento', week: 'Settimana', multi: 'Selezione multipla' }

  return (
    <div className="modal-section">
      <div className="modal-section-title">Note ({notes?.length || 0})</div>
      {!notes?.length && <p style={{ fontSize: 12, color: '#aaa' }}>Nessuna nota.</p>}
      {notes?.map(n => (
        <div className="note-card" key={n.id}>
          <span className="note-author">{n.author?.full_name}</span>
          <span className="note-scope-tag">{scopeLabel[n.scope]}</span>
          {n.content && <div className="note-text">{n.content}</div>}
          {n.note_images?.length > 0 && (
            <div className="note-images">
              {n.note_images.map(img => {
                const { data } = supabase.storage.from('note-images').getPublicUrl(img.storage_path)
                return <img key={img.id} src={data.publicUrl} className="note-img" alt="nota" />
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ============================================================
   PRESENCE FORM
   ============================================================ */
function PresenceForm({ event, profile, onDone, onCancel }) {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [saving, setSaving] = useState(false)

  const slots = (event.slots || []).map(s => {
    if (s.category) return { key: `cat_${s.category_id}`, label: s.category.name, category_id: s.category_id, group_id: null }
    if (s.group) {
      const label = s.group.name || s.group.category_group_members?.map(m => m.category?.name).join('+') || 'Gruppo'
      return { key: `grp_${s.group_id}`, label, category_id: null, group_id: s.group_id }
    }
    return null
  }).filter(Boolean)

  const allOptions = [...slots, { key: 'jolly', label: 'Jolly' }]

  async function confirm() {
    if (!selectedSlot) return
    setSaving(true)
    const isJolly = selectedSlot.key === 'jolly'
    const payload = {
      coach_id: profile.id,
      is_jolly: isJolly,
      category_id: isJolly ? null : selectedSlot.category_id,
      group_id: isJolly ? null : selectedSlot.group_id,
    }
    if (event.eventType === 'training') {
      payload.training_id = event.id
      payload.instance_date = event.dateStr
    } else {
      payload.activity_id = event.id
    }
    await supabase.from('attendances').insert(payload)
    setSaving(false)
    onDone()
  }

  return (
    <div>
      <div className="info-banner">
        Seleziona il gruppo/categoria per cui sei presente, oppure scegli Jolly se sei disponibile dove c'è più bisogno.
      </div>
      <div className="field">
        <label>Ruolo per questo allenamento</label>
        <div className="chip-group">
          {allOptions.map(opt => (
            <div key={opt.key}
              className={`chip${selectedSlot?.key === opt.key ? ' selected' : ''}`}
              onClick={() => setSelectedSlot(opt)}>
              {opt.label === 'Jolly' ? '⭐ Jolly' : opt.label}
            </div>
          ))}
        </div>
      </div>
      {selectedSlot?.key === 'jolly' && (
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12, background: '#f8f8f7', borderRadius: 8, padding: '8px 10px' }}>
          Il jolly verrà conteggiato come +1 nel gruppo che non raggiunge il minimo richiesto.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={confirm} disabled={!selectedSlot || saving}>
          {saving ? 'Salvataggio...' : 'Conferma'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

/* ============================================================
   NOTE FORM
   ============================================================ */
function NoteForm({ event, profile, onDone, onCancel }) {
  const [scope, setScope] = useState('single')
  const [content, setContent] = useState('')
  const [images, setImages] = useState([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  function handleFiles(e) {
    setImages(prev => [...prev, ...Array.from(e.target.files)])
    e.target.value = ''
  }

  async function save() {
    setSaving(true)
    const notePayload = { author_id: profile.id, scope, content: content || null }
    if (event.eventType === 'training') {
      notePayload.training_id = event.id
      notePayload.instance_date = event.dateStr
    } else {
      notePayload.activity_id = event.id
    }
    const { data: note } = await supabase.from('notes').insert(notePayload).select().single()
    if (note && images.length > 0) {
      for (const file of images) {
        const path = `${profile.id}/${note.id}/${Date.now()}_${file.name}`
        await supabase.storage.from('note-images').upload(path, file)
        await supabase.from('note_images').insert({ note_id: note.id, storage_path: path })
      }
    }
    setSaving(false)
    onDone()
  }

  return (
    <div>
      <div className="field">
        <label>Ambito della nota</label>
        <div className="chip-group">
          {[{ value: 'single', label: 'Questo allenamento' }, { value: 'week', label: 'Settimana' }, { value: 'multi', label: 'Multipla' }].map(s => (
            <div key={s.value} className={`chip${scope === s.value ? ' selected' : ''}`} onClick={() => setScope(s.value)}>
              {s.label}
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Nota</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Scrivi qui..." />
      </div>
      <div className="field">
        <label>Immagini</label>
        <div className="img-upload-area" onClick={() => fileRef.current.click()}>Clicca per aggiungere immagini</div>
        <input type="file" ref={fileRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
        {images.length > 0 && (
          <div className="img-previews">
            {images.map((f, i) => <img key={i} src={URL.createObjectURL(f)} className="img-preview-thumb" alt="preview" />)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={(!content && images.length === 0) || saving}>
          {saving ? 'Salvataggio...' : 'Salva nota'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

/* ============================================================
   EDIT INSTANCE FORM
   ============================================================ */
function EditInstanceForm({ event, onDone, onCancel }) {
  const [allCats, setAllCats] = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [selected, setSelected] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useState(() => {
    async function load() {
      const { data: cats } = await supabase.from('categories').select('id,name').order('name')
      const { data: groups } = await supabase.from('category_groups').select('id, name, category_group_members(category:categories(id,name))')
      setAllCats(cats || [])
      setAllGroups(groups || [])
      const preSelected = []
      const preMins = {}
      for (const slot of event.slots || []) {
        if (slot.category) {
          const key = `cat_${slot.category_id}`
          preSelected.push({ key, type: 'category', id: slot.category_id, name: slot.category.name })
          preMins[key] = slot.min_coaches
        } else if (slot.group) {
          const key = `grp_${slot.group_id}`
          const label = slot.group.name || slot.group.category_group_members?.map(m => m.category?.name).join('+')
          preSelected.push({ key, type: 'group', id: slot.group_id, groupName: label })
          preMins[key] = slot.min_coaches
        }
      }
      setSelected(preSelected)
      setMins(preMins)
      setLoaded(true)
    }
    load()
  }, [])

  function handleToggle(item) {
    setSelected(prev => {
      const exists = prev.find(s => s.key === item.key)
      if (exists) return prev.filter(s => s.key !== item.key)
      return [...prev, item]
    })
    setMins(m => ({ ...m, [item.key]: m[item.key] ?? 2 }))
  }

  async function save() {
    if (!selected.length) return
    setSaving(true)
    let overrideId
    const { data: existing } = await supabase.from('training_instance_overrides')
      .select('id').eq('training_id', event.id).eq('instance_date', event.dateStr).single()
    if (existing) {
      overrideId = existing.id
      await supabase.from('instance_override_categories').delete().eq('override_id', overrideId)
    } else {
      const { data: created } = await supabase.from('training_instance_overrides')
        .insert({ training_id: event.id, instance_date: event.dateStr }).select().single()
      overrideId = created.id
    }
    for (const s of selected) {
      await supabase.from('instance_override_categories').insert({
        override_id: overrideId,
        category_id: s.type === 'category' ? s.id : null,
        group_id: s.type === 'group' ? s.id : null,
        min_coaches: mins[s.key] ?? 2,
      })
    }
    setSaving(false)
    onDone()
  }

  if (!loaded) return <div style={{ fontSize: 13, color: '#aaa', padding: 12 }}>Caricamento...</div>

  return (
    <div>
      <div className="info-banner">Modifica solo questa istanza. La ricorrenza globale non cambia.</div>
      {allCats.length > 0 && (
        <div className="field">
          <label>Categorie singole</label>
          <div className="chip-group">
            {allCats.map(c => {
              const key = `cat_${c.id}`
              return <div key={key} className={`chip${selected.find(s => s.key === key) ? ' selected' : ''}`}
                onClick={() => handleToggle({ key, type: 'category', id: c.id, name: c.name })}>{c.name}</div>
            })}
          </div>
        </div>
      )}
      {allGroups.length > 0 && (
        <div className="field">
          <label>Gruppi</label>
          <div className="chip-group">
            {allGroups.map(g => {
              const key = `grp_${g.id}`
              const label = g.name || g.category_group_members?.map(m => m.category?.name).join('+')
              return <div key={key} className={`chip${selected.find(s => s.key === key) ? ' selected' : ''}`}
                onClick={() => handleToggle({ key, type: 'group', id: g.id, groupName: label })}>{label}</div>
            })}
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div className="field">
          <label>Minimi</label>
          {selected.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, minWidth: 80, color: '#555' }}>{s.type === 'category' ? s.name : s.groupName}</span>
              <input type="number" min={1} max={10} value={mins[s.key] ?? 2}
                onChange={e => setMins(m => ({ ...m, [s.key]: parseInt(e.target.value) || 2 }))}
                style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }} />
              <span style={{ fontSize: 11, color: '#aaa' }}>min.</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!selected.length || saving}>
          {saving ? 'Salvataggio...' : 'Salva istanza'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}
