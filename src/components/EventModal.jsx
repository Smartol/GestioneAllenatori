import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getCovColor } from '../hooks/useCalendarData'

export default function EventModal({ event, attendances, onClose, onRefetch }) {
  const { profile, isAdmin } = useAuth()
  const [view, setView] = useState('main') // main | presence | note | edit
  const myAttendance = attendances.find(a => a.coach_id === profile?.id)

  const title = event.name || 'Allenamento'
  const subtitle = `${event.start_time || event.date} · ${format(new Date(event.date || event.dateStr), 'EEEE d MMMM yyyy', { locale: it })}`

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}{event.eventType === 'festival' ? ' — Festival ★' : ''}</div>
            <div className="modal-sub">{subtitle}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {view === 'main' && <MainView event={event} attendances={attendances} myAttendance={myAttendance} isAdmin={isAdmin} onSetView={setView} />}
          {view === 'presence' && <PresenceForm event={event} profile={profile} onDone={onRefetch} onCancel={() => setView('main')} />}
          {view === 'note' && <NoteForm event={event} profile={profile} onDone={onRefetch} onCancel={() => setView('main')} />}
          {view === 'edit' && <EditInstanceForm event={event} onDone={onRefetch} onCancel={() => setView('main')} />}
        </div>
      </div>
    </div>
  )
}

function MainView({ event, attendances, myAttendance, isAdmin, onSetView }) {
  const colLabel = { green: 'Soddisfatta', orange: 'Con jolly / al limite', red: 'Insufficiente' }

  return (
    <>
      {/* Copertura */}
      <div className="modal-section">
        <div className="modal-section-title">Copertura per categoria</div>
        {Object.entries(event.coverage).map(([cat, d]) => {
          const col = getCovColor({ [cat]: d })
          return (
            <div className="cov-row" key={cat}>
              <span>{cat} — {d.present} pres.{d.jolly > 0 ? ` + ${d.jolly} jolly` : ''} / min {d.min}</span>
              <span className={`badge badge-${col}`}>{colLabel[col]}</span>
            </div>
          )
        })}
        {myAttendance && (
          <div style={{ marginTop: 8 }}>
            <span className="badge badge-green">Presenza confermata — {myAttendance.category?.name || 'Jolly'}</span>
          </div>
        )}
      </div>

      {/* Presenti */}
      <div className="modal-section">
        <div className="modal-section-title">Allenatori presenti ({attendances.length})</div>
        {attendances.length === 0
          ? <p style={{ fontSize: 12, color: '#aaa' }}>Nessuna presenza dichiarata.</p>
          : attendances.map(a => (
            <div key={a.id} style={{ fontSize: 12, padding: '3px 0', color: '#555' }}>
              {a.coach?.full_name} — <span style={{ color: '#888' }}>{a.category?.name || 'Jolly'}</span>
            </div>
          ))
        }
      </div>

      {/* Note */}
      <NotesList event={event} />

      {/* Azioni */}
      <div className="modal-actions">
        {!myAttendance && <button className="btn btn-primary btn-sm" onClick={() => onSetView('presence')}>Dichiara presenza</button>}
        <button className="btn btn-secondary btn-sm" onClick={() => onSetView('note')}>Aggiungi nota</button>
        {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => onSetView('edit')}>Modifica istanza</button>}
      </div>
    </>
  )
}

function NotesList({ event }) {
  const [notes, setNotes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [shown, setShown] = useState(false)

  async function loadNotes() {
    setLoading(true)
    const query = supabase.from('notes').select(`*, author:profiles(full_name), note_images(storage_path)`).order('created_at')
    if (event.eventType === 'training') query.eq('training_id', event.id).eq('instance_date', event.dateStr)
    else query.eq('festival_id', event.id)
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
                return <img key={img.id} src={data.publicUrl} className="note-img" alt="schema" />
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PresenceForm({ event, profile, onDone, onCancel }) {
  const [cat, setCat] = useState(null)
  const [saving, setSaving] = useState(false)
  const cats = event.cats?.map(c => c.category?.name).filter(Boolean) || []

  async function confirm() {
    if (!cat) return
    setSaving(true)
    const categoryId = event.cats?.find(c => c.category?.name === cat)?.category?.id || null
    const payload = {
      coach_id: profile.id,
      category_id: cat === 'Jolly' ? null : categoryId,
    }
    if (event.eventType === 'training') {
      payload.training_id = event.id
      payload.instance_date = event.dateStr
    } else {
      payload.festival_id = event.id
    }
    await supabase.from('attendances').insert(payload)
    setSaving(false)
    onDone()
  }

  return (
    <div>
      <div className="info-banner">Seleziona la categoria per cui sei presente oggi.</div>
      <div className="field">
        <label>Categoria</label>
        <div className="chip-group">
          {[...cats, 'Jolly'].map(c => (
            <div key={c} className={`chip ${cat === c ? 'selected' : ''}`} onClick={() => setCat(c)}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={confirm} disabled={!cat || saving}>{saving ? 'Salvataggio...' : 'Conferma'}</button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

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
      notePayload.festival_id = event.id
    }

    // Per scope 'week': inserisci la nota per tutti gli allenamenti della stessa settimana
    const { data: note } = await supabase.from('notes').insert(notePayload).select().single()

    if (note && images.length > 0) {
      for (const file of images) {
        const path = `${profile.id}/${note.id}/${file.name}`
        await supabase.storage.from('note-images').upload(path, file)
        await supabase.from('note_images').insert({ note_id: note.id, storage_path: path })
      }
    }

    setSaving(false)
    onDone()
  }

  const scopes = [
    { value: 'single', label: 'Questo allenamento' },
    { value: 'week', label: 'Tutta la settimana' },
    { value: 'multi', label: 'Selezione multipla' },
  ]

  return (
    <div>
      <div className="field">
        <label>Ambito della nota</label>
        <div className="chip-group">
          {scopes.map(s => (
            <div key={s.value} className={`chip ${scope === s.value ? 'selected' : ''}`} onClick={() => setScope(s.value)}>
              {s.label}
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Nota (obiettivi, schemi, avvisi)</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Scrivi qui..." />
      </div>
      <div className="field">
        <label>Immagini (schemi, foto)</label>
        <div className="img-upload-area" onClick={() => fileRef.current.click()}>
          Clicca per aggiungere immagini
        </div>
        <input type="file" ref={fileRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
        {images.length > 0 && (
          <div className="img-previews">
            {images.map((f, i) => (
              <img key={i} src={URL.createObjectURL(f)} className="img-preview-thumb" alt="preview" />
            ))}
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

function EditInstanceForm({ event, onDone, onCancel }) {
  const ALL_CATS = ['U6', 'U8', 'U10', 'U12']
  const currentCats = event.cats?.map(c => c.category?.name) || []
  const [selCats, setSelCats] = useState(currentCats)
  const [mins, setMins] = useState(
    Object.fromEntries(event.cats?.map(c => [c.category?.name, c.min_coaches]) || [])
  )
  const [saving, setSaving] = useState(false)
  const { supabase: sb } = { supabase }

  function toggleCat(cat) {
    setSelCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
    if (!mins[cat]) setMins(m => ({ ...m, [cat]: 2 }))
  }

  async function save() {
    if (!selCats.length) return
    setSaving(true)

    // Trova o crea override per questa istanza
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

    // Recupera gli id delle categorie
    const { data: catRows } = await supabase.from('categories').select('id,name').in('name', selCats)
    const catEntries = selCats.map(name => ({
      override_id: overrideId,
      category_id: catRows.find(c => c.name === name)?.id,
      min_coaches: mins[name] || 2,
    }))
    await supabase.from('instance_override_categories').insert(catEntries)

    setSaving(false)
    onDone()
  }

  return (
    <div>
      <div className="info-banner">Modifica solo questa istanza. La ricorrenza globale non cambia.</div>
      <div className="field">
        <label>Categorie coinvolte</label>
        <div className="chip-group">
          {ALL_CATS.map(c => (
            <div key={c} className={`chip ${selCats.includes(c) ? 'selected' : ''}`} onClick={() => toggleCat(c)}>{c}</div>
          ))}
        </div>
      </div>
      {selCats.length > 0 && (
        <div className="field">
          <label>Minimi per categoria</label>
          {selCats.map(c => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, width: 36, color: '#555' }}>{c}</span>
              <input
                type="number" min={1} max={10} value={mins[c] || 2}
                onChange={e => setMins(m => ({ ...m, [c]: parseInt(e.target.value) || 2 }))}
                style={{ width: 56, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              />
              <span style={{ fontSize: 11, color: '#aaa' }}>min. allenatori</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!selCats.length || saving}>
          {saving ? 'Salvataggio...' : 'Salva istanza'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}
