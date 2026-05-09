import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getCovColor } from '../hooks/useCalendarData'

export default function EventModal({ event, attendances, onClose, onRefetch, onDelete }) {
  const { profile, isAdmin } = useAuth()
  const [view, setView] = useState('main') // main | note-form | edit
  const myAttendance = attendances.find(a => a.coach_id === profile?.id)

  const title = event.title || 'Allenamento'
  const rawDate = event.dateStr || event.date || ''
  const dateObj = rawDate ? new Date(rawDate + 'T00:00:00') : new Date()
  const timeStr = event.start_time?.slice(0, 5) || ''
  const endTimeStr = event.end_time?.slice(0, 5) || ''
  const subtitle = `${timeStr}${endTimeStr ? ` → ${endTimeStr}` : ''} · ${format(dateObj, 'EEEE d MMMM yyyy', { locale: it })}`

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

        {/* HEADER */}
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
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* BODY scrollabile */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {view === 'main' && (
            <MainBody
              event={event}
              attendances={attendances}
              myAttendance={myAttendance}
              isAdmin={isAdmin}
              onSetView={setView}
              onRefetch={onRefetch}
            />
          )}
          {view === 'note-form' && (
            <NoteForm
              event={event}
              profile={profile}
              onDone={() => { onRefetch(); setView('main') }}
              onCancel={() => setView('main')}
            />
          )}
          {view === 'edit' && isAdmin && (
            <EditInstanceForm
              event={event}
              onDone={onRefetch}
              onCancel={() => setView('main')}
              onDelete={onDelete}
            />
          )}
        </div>

        {/* FOOTER ANCORATO — solo in vista main */}
        {view === 'main' && (
          <PresenceFooter
            event={event}
            profile={profile}
            myAttendance={myAttendance}
            onRefetch={onRefetch}
          />
        )}

      </div>
    </div>
  )
}

/* ============================================================
   MAIN BODY
   ============================================================ */
function MainBody({ event, attendances, myAttendance, isAdmin, onSetView, onRefetch }) {
  const colLabel = { green: 'Soddisfatta', orange: 'Con jolly / al limite', red: 'Insufficiente' }
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState(null)
  const [notesLoading, setNotesLoading] = useState(false)

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    setNotesLoading(true)
    let query = supabase
      .from('notes')
      .select(`*, author:profiles(id, full_name), note_images(id, storage_path)`)
      .order('created_at')
    if (event.eventType === 'training') {
      query = query.eq('training_id', event.id).eq('instance_date', event.dateStr)
    } else {
      query = query.eq('activity_id', event.id)
    }
    const { data } = await query
    setNotes(data || [])
    setNotesLoading(false)
  }

  function slotLabel(a) {
    if (a.is_jolly) return '⭐ Jolly'
    if (a.group_id) {
      const slot = event.slots?.find(s => s.group_id === a.group_id)
      if (slot?.group) return slot.group.name || slot.group.category_group_members?.map(m => m.category?.name).join('+') || 'Gruppo'
    }
    if (a.category_id) {
      const slot = event.slots?.find(s => s.category_id === a.category_id)
      return slot?.category?.name || a.category?.name || 'Categoria'
    }
    return '—'
  }

  const noteCount = notes?.length ?? '…'
  const isMe = (a) => a.coach_id === (myAttendance?.coach_id)

  return (
    <>
      {/* COPERTURA */}
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
            <span className="badge badge-green">✓ Presenza confermata</span>
          </div>
        )}
      </div>

      {/* ALLENATORI PRESENTI */}
      <div className="modal-section">
        <div className="modal-section-title">Allenatori presenti ({attendances.length})</div>
        {attendances.length === 0
          ? <p style={{ fontSize: 12, color: '#aaa' }}>Nessuna presenza dichiarata.</p>
          : attendances.map(a => {
            const mine = isMe(a)
            return (
              <div key={a.id} style={{
                fontSize: 12, padding: '4px 0', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid #f5f5f5',
              }}>
                <span style={{ fontWeight: mine ? 600 : 500, color: mine ? '#2e7d4f' : '#555' }}>
                  {a.coach?.full_name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: mine ? '#2e7d4f' : '#888' }}>{slotLabel(a)}</span>
                  {mine && <span style={{ color: '#2e7d4f', fontSize: 13 }}>✓</span>}
                </div>
              </div>
            )
          })
        }
      </div>

      {/* NOTE */}
      <div className="modal-section">
        <button
          onClick={() => setNotesOpen(o => !o)}
          style={{
            width: '100%', padding: '8px 12px',
            background: '#f8f8f7', border: '1px solid #e5e5e5',
            borderRadius: notesOpen ? '8px 8px 0 0' : '8px',
            fontSize: 13, fontWeight: 500, color: '#555', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span>📝 Note</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              background: noteCount > 0 ? '#1a1a1a' : '#e5e5e5',
              color: noteCount > 0 ? '#fff' : '#999',
              borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
            }}>{notesLoading ? '…' : noteCount}</span>
            <span style={{ color: '#aaa', fontSize: 12 }}>{notesOpen ? '▴' : '▾'}</span>
          </div>
        </button>

        {notesOpen && (
          <div style={{
            background: '#f8f8f7', border: '1px solid #e5e5e5', borderTop: 'none',
            borderRadius: '0 0 8px 8px', padding: '10px 12px',
          }}>
            {notes?.length === 0 && (
              <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', paddingBottom: 6 }}>Nessuna nota.</p>
            )}
            {notes?.map(n => <NoteCard key={n.id} note={n} />)}
            <button
              onClick={() => onSetView('note-form')}
              style={{
                width: '100%', padding: '7px', background: '#fff',
                border: '1px dashed #ccc', borderRadius: 7,
                fontSize: 12, color: '#888', cursor: 'pointer', marginTop: 2,
              }}
            >+ Aggiungi nota</button>
          </div>
        )}
      </div>

      {/* MODIFICA ISTANZA — solo admin, dopo le note */}
      {isAdmin && event.eventType === 'training' && (
        <div className="modal-section">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onSetView('edit')}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            ✏️ Modifica istanza
          </button>
        </div>
      )}
    </>
  )
}

/* ============================================================
   PRESENCE FOOTER — ancorato in basso
   ============================================================ */
function PresenceFooter({ event, profile, myAttendance, onRefetch }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const slots = (event.slots || []).map(s => {
    if (s.category) return { key: `cat_${s.category_id}`, label: s.category.name, category_id: s.category_id, group_id: null }
    if (s.group) {
      const label = s.group.name || s.group.category_group_members?.map(m => m.category?.name).join('+') || 'Gruppo'
      return { key: `grp_${s.group_id}`, label, category_id: null, group_id: s.group_id }
    }
    return null
  }).filter(Boolean)

  const allOptions = [...slots, { key: 'jolly', label: '⭐ Jolly' }]

  async function confirmPresence() {
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
    setDrawerOpen(false)
    setSelectedSlot(null)
    onRefetch()
  }

  async function cancelPresence() {
    if (!window.confirm('Disdire la tua presenza?')) return
    setCancelling(true)
    await supabase.from('attendances').delete().eq('id', myAttendance.id)
    setCancelling(false)
    onRefetch()
  }

  return (
    <div style={{ borderTop: '1px solid #f0f0f0', background: '#fff' }}>

      {/* DRAWER selezione gruppo */}
      {drawerOpen && !myAttendance && (
        <div style={{
          padding: '12px 16px 10px',
          background: '#f8f8f7',
          borderTop: '1px solid #e5e5e5',
        }}>
          <div style={{ fontSize: 12, color: '#666', fontWeight: 500, marginBottom: 10 }}>
            Per quale gruppo sei presente?
          </div>
          <div className="chip-group" style={{ marginBottom: 12 }}>
            {allOptions.map(opt => (
              <div
                key={opt.key}
                className={`chip${selectedSlot?.key === opt.key ? ' selected' : ''}`}
                onClick={() => setSelectedSlot(opt)}
              >
                {opt.label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setDrawerOpen(false); setSelectedSlot(null) }}
              style={{
                flex: 1, padding: '10px', background: '#fff',
                border: '1.5px solid #ddd', borderRadius: 8,
                fontSize: 13, fontWeight: 500, color: '#555', cursor: 'pointer',
              }}
            >
              Annulla
            </button>
            <button
              onClick={confirmPresence}
              disabled={!selectedSlot || saving}
              style={{
                flex: 2, padding: '10px',
                background: selectedSlot ? '#2e7d4f' : '#e5e5e5',
                border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600,
                color: selectedSlot ? '#fff' : '#aaa',
                cursor: selectedSlot ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              {saving ? 'Salvataggio...' : '✓ Ci sono!'}
            </button>
          </div>
        </div>
      )}

      {/* TASTO PRINCIPALE */}
      <div style={{ padding: '10px 16px 14px' }}>
        {myAttendance ? (
          <button
            onClick={cancelPresence}
            disabled={cancelling}
            style={{
              width: '100%', padding: '11px',
              background: '#fcd5d5', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, color: '#b91c1c',
              cursor: 'pointer',
            }}
          >
            {cancelling ? 'Annullamento...' : 'Disdici presenza'}
          </button>
        ) : (
          <button
            onClick={() => setDrawerOpen(o => !o)}
            style={{
              width: '100%', padding: '11px',
              background: drawerOpen ? '#333' : '#1a1a1a',
              border: 'none', borderRadius: drawerOpen ? '0 0 10px 10px' : 10,
              fontSize: 14, fontWeight: 600, color: '#fff',
              cursor: 'pointer',
            }}
          >
            {drawerOpen ? '▴ Annulla' : 'Dichiara presenza'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   NOTE CARD
   ============================================================ */
function NoteCard({ note }) {
  const scopeLabel = { single: 'Questo allenamento', week: 'Settimana', multi: 'Selezione multipla' }
  return (
    <div style={{ background: '#fff', borderRadius: 7, padding: '8px 10px', marginBottom: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#1a1a1a' }}>{note.author?.full_name}</span>
      <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>{scopeLabel[note.scope]}</span>
      {note.content && <div style={{ fontSize: 12, color: '#555', marginTop: 3, lineHeight: 1.5 }}>{note.content}</div>}
      {note.note_images?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {note.note_images.map(img => {
            const { data } = supabase.storage.from('note-images').getPublicUrl(img.storage_path)
            return <img key={img.id} src={data.publicUrl} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e5e5' }} alt="nota" />
          })}
        </div>
      )}
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
function EditInstanceForm({ event, onDone, onCancel, onDelete }) {
  const [allCats, setAllCats] = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [selected, setSelected] = useState([])
  const [mins, setMins] = useState({})
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
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

  async function handleSkipDate() {
    if (!window.confirm('Saltare questa data?')) return
    await supabase.from('training_instance_exceptions').insert({
      training_id: event.id,
      instance_date: event.dateStr,
    })
    onDelete()
  }

  async function handleDeleteAll() {
    if (!window.confirm("Eliminare l'intera ricorrenza? Questa azione non può essere annullata.")) return
    await supabase.from('recurring_trainings').update({ active: false }).eq('id', event.id)
    onDelete()
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
              return (
                <div key={key}
                  className={`chip${selected.find(s => s.key === key) ? ' selected' : ''}`}
                  onClick={() => handleToggle({ key, type: 'category', id: c.id, name: c.name })}>
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
                <div key={key}
                  className={`chip${selected.find(s => s.key === key) ? ' selected' : ''}`}
                  onClick={() => handleToggle({ key, type: 'group', id: g.id, groupName: label })}>
                  {label}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="field">
          <label>Minimi per categoria/gruppo</label>
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!selected.length || saving}>
          {saving ? 'Salvataggio...' : 'Salva istanza'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>Azioni sull'intera ricorrenza</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleSkipDate}
            style={{ padding: '6px 12px', background: '#fff', border: '1.5px solid #b8610a', color: '#b8610a', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            🚫 Salta questa data
          </button>
          <button onClick={handleDeleteAll}
            style={{ padding: '6px 12px', background: '#fcd5d5', border: 'none', color: '#b91c1c', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            🗑 Elimina tutto
          </button>
        </div>
      </div>
    </div>
  )
}
