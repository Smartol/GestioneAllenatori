import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { computeCoverage } from '../hooks/useCalendarData'

/* ============================================================
   LIGHTBOX
   ============================================================ */
function Lightbox({ images, startIndex = 0, caption, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const total = images.length

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, total - 1))
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, onClose])

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <button onClick={onClose} style={{
        position: 'absolute', top: 16, right: 16,
        background: 'rgba(255,255,255,0.15)', border: 'none',
        color: '#fff', borderRadius: '50%', width: 36, height: 36,
        fontSize: 18, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>✕</button>

      <img
        src={images[idx]}
        alt=""
        style={{
          maxWidth: '90vw', maxHeight: '65vh',
          objectFit: 'contain', borderRadius: 8,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      />

      {caption && (
        <div style={{
          marginTop: 14, color: 'rgba(255,255,255,0.85)',
          fontSize: 13, maxWidth: 480, textAlign: 'center',
          lineHeight: 1.5, whiteSpace: 'pre-wrap', padding: '0 8px',
        }}>
          {caption}
        </div>
      )}

      {total > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <button
            onClick={() => setIdx(i => Math.max(i - 1, 0))}
            disabled={idx === 0}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              borderRadius: '50%', width: 40, height: 40, fontSize: 20,
              cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >‹</button>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{idx + 1} / {total}</span>
          <button
            onClick={() => setIdx(i => Math.min(i + 1, total - 1))}
            disabled={idx === total - 1}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              borderRadius: '50%', width: 40, height: 40, fontSize: 20,
              cursor: idx === total - 1 ? 'default' : 'pointer', opacity: idx === total - 1 ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >›</button>
        </div>
      )}

      {total > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {images.map((src, i) => (
            <img key={i} src={src} alt="" onClick={() => setIdx(i)} style={{
              width: 48, height: 48, objectFit: 'cover', borderRadius: 6,
              cursor: 'pointer', transition: 'all 0.15s',
              border: i === idx ? '2px solid #fff' : '2px solid transparent',
              opacity: i === idx ? 1 : 0.5,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   HELPERS
   ============================================================ */
function coverageBadge(covered, min) {
  if (covered === 0) return { bg: '#fcd5d5', color: '#b91c1c', text: `0/${min} ✗` }
  if (covered < min)  return { bg: '#fde8c8', color: '#b8610a', text: `${covered}/${min} ⚠` }
  return { bg: '#d4edda', color: '#2e7d4f', text: `${covered}/${min} ✓` }
}

function OptionCard({ selected, onToggle, isRadio, isJolly, isEmergency, children, disabled }) {
  const borderColor = disabled ? '#f0f0f0'
    : isEmergency && selected ? '#7c3aed'
    : isJolly && selected ? '#b8610a'
    : selected ? '#1a1a1a' : '#e5e5e5'

  const bg = disabled ? '#fafafa'
    : isEmergency && selected ? '#f5f3ff'
    : isJolly && selected ? '#fef3c7'
    : selected ? '#f8f8f7' : '#fff'

  const indicator = isRadio
    ? <div style={{
        width:20, height:20, borderRadius:'50%', border:`2px solid ${selected ? borderColor : '#ddd'}`,
        flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {selected && <div style={{ width:9, height:9, borderRadius:'50%', background:borderColor }} />}
      </div>
    : <div style={{
        width:20, height:20, borderRadius:5, border:`2px solid ${selected ? borderColor : '#ddd'}`,
        flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
        background: selected ? borderColor : '#fff', color:'#fff', fontSize:12, fontWeight:700,
      }}>
        {selected && '✓'}
      </div>

  return (
    <div
      onClick={disabled ? undefined : onToggle}
      style={{
        border:`1.5px ${(isJolly||isEmergency) ? 'dashed' : 'solid'} ${borderColor}`,
        borderRadius:10, padding:'10px 12px', marginBottom:8,
        background: bg, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition:'all .15s',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {indicator}
        {children}
      </div>
    </div>
  )
}

/* ============================================================
   EVENT MODAL
   ============================================================ */
export default function EventModal({ event, attendances, onClose, onRefetch, onDelete, embedded }) {
  const { profile, isAdmin } = useAuth()
  const [view, setView] = useState('main')

  const myAttendances = attendances.filter(a => a.coach_id === profile?.id)
  const isSigned = myAttendances.length > 0

  const dateObj = event.date || new Date()
  const timeStr = event.start_time?.slice(0,5) || ''
  const endTimeStr = event.end_time?.slice(0,5) || ''
  const subtitle = [
    timeStr && (timeStr + (endTimeStr ? ` → ${endTimeStr}` : '')),
    format(dateObj, 'EEEE d MMMM yyyy', { locale: it }),
  ].filter(Boolean).join(' · ')

  const typeIcon = { training:'🏉', festival:'🏆', school:'📚', other:'🎉' }

  const inner = (
    <div className="modal-box" style={{
      display:'flex', flexDirection:'column',
      maxHeight: embedded ? '65vh' : '90vh',
      borderRadius: 14,
      boxShadow: embedded ? 'none' : '0 4px 24px rgba(0,0,0,0.14)',
      maxWidth: '100%',
    }}>
      <div className="modal-head">
        <div style={{ flex:1 }}>
          <div className="modal-title">
            {typeIcon[event.eventType] || '📅'} {event.title}
            {event.eventType === 'school' && ' ★'}
          </div>
          <div className="modal-sub">{subtitle}</div>
          {event.location && <div className="modal-sub">📍 {event.location}</div>}
          {event.hosting_team && <div className="modal-sub">🏠 {event.hosting_team}</div>}
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="modal-body" style={{ flex:1, overflowY:'auto' }}>
        {view === 'main' && (
          <MainBody
            event={event} attendances={attendances}
            myAttendances={myAttendances} isSigned={isSigned}
            profile={profile} isAdmin={isAdmin}
            onSetView={setView} onRefetch={onRefetch}
          />
        )}
        {view === 'note-form' && (
          <NoteForm event={event} profile={profile}
            onDone={() => { onRefetch(); setView('main') }}
            onCancel={() => setView('main')} />
        )}
        {view === 'note-edit' && (
          <NoteForm event={event} profile={profile}
            editingNote={view === 'note-edit' ? undefined : undefined}
            onDone={() => { onRefetch(); setView('main') }}
            onCancel={() => setView('main')} />
        )}
        {view === 'edit-choice' && (
          <EditChoiceView event={event}
            onEditInstance={() => setView('edit-instance')}
            onCancel={() => setView('main')} />
        )}
        {view === 'edit-instance' && (
          <EditInstanceView event={event}
            onDone={() => { onRefetch(); setView('main') }}
            onCancel={() => setView('main')} />
        )}
      </div>

      {view === 'main' && (
        <PresenceFooter
          event={event} profile={profile}
          attendances={attendances} myAttendances={myAttendances}
          isSigned={isSigned} onRefetch={onRefetch}
        />
      )}
    </div>
  )

  if (embedded) return inner
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      {inner}
    </div>
  )
}

/* ============================================================
   MAIN BODY
   ============================================================ */
function MainBody({ event, attendances, myAttendances, isSigned, profile, isAdmin, onSetView, onRefetch }) {
  const [notes, setNotes] = useState(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesLoading, setNotesLoading] = useState(false)
  const [editingNote, setEditingNote] = useState(null)

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    setNotesLoading(true)
    const { data } = await supabase
      .from('notes')
      .select('*, author:profiles(id,full_name), note_images(id,storage_path)')
      .eq('event_id', event.id)
      .eq('instance_date', event.dateStr)
      .order('created_at')
    setNotes(data || [])
    setNotesLoading(false)
  }

  async function deleteNote(noteId) {
    if (!window.confirm('Eliminare questa nota?')) return
    // Elimina immagini storage
    const note = notes.find(n => n.id === noteId)
    if (note?.note_images?.length) {
      await supabase.storage.from('note-images').remove(note.note_images.map(i => i.storage_path))
    }
    await supabase.from('notes').delete().eq('id', noteId)
    loadNotes()
  }

  if (event.eventType === 'school') {
    return (
      <>
        <SchoolProgramme event={event} attendances={attendances} profile={profile} />
        <NotesSection
          notes={notes} notesLoading={notesLoading}
          notesOpen={notesOpen} setNotesOpen={setNotesOpen}
          profile={profile} isAdmin={isAdmin}
          onAddNote={() => onSetView('note-form')}
          onEditNote={note => setEditingNote(note)}
          onDeleteNote={deleteNote}
          onRefetch={loadNotes}
        />
        {editingNote && (
          <NoteForm event={event} profile={profile} editingNote={editingNote}
            onDone={() => { setEditingNote(null); loadNotes() }}
            onCancel={() => setEditingNote(null)} />
        )}
        {isAdmin && (
          <div className="modal-section">
            <button className="btn btn-secondary btn-sm"
              onClick={() => onSetView('edit-choice')}
              style={{ width:'100%', justifyContent:'center' }}>
              ✏️ Modifica evento
            </button>
          </div>
        )}
      </>
    )
  }

  const coverage = computeCoverage(event.slots, attendances)

  return (
    <>
      {Object.keys(coverage).length > 0 && (
        <div className="modal-section">
          <div className="modal-section-title">Copertura</div>
          {Object.entries(coverage).map(([label, d]) => {
            const s = coverageBadge(d.covered, d.min)
            return (
              <div className="cov-row" key={label}>
                <span>{label}{d.jolly > 0 ? ` (+${d.jolly} jolly)` : ''}</span>
                <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>
                  {s.text}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="modal-section">
        <div className="modal-section-title">Allenatori presenti ({attendances.length})</div>
        {attendances.length === 0
          ? <p style={{ fontSize:12, color:'#aaa' }}>Nessuna presenza dichiarata.</p>
          : attendances.map(a => (
            <div key={a.id} style={{ fontSize:12, padding:'4px 0', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f5f5f5' }}>
              <span style={{ fontWeight: a.coach_id===profile?.id ? 600 : 500, color: a.coach_id===profile?.id ? '#2e7d4f' : '#555' }}>
                {a.coach_id===profile?.id ? '✓ ' : ''}{a.coach?.full_name}
              </span>
              <span style={{ fontSize:11, color:'#888' }}>{slotLabel(a, event)}</span>
            </div>
          ))
        }
      </div>

      <NotesSection
        notes={notes} notesLoading={notesLoading}
        notesOpen={notesOpen} setNotesOpen={setNotesOpen}
        profile={profile} isAdmin={isAdmin}
        onAddNote={() => onSetView('note-form')}
        onEditNote={note => setEditingNote(note)}
        onDeleteNote={deleteNote}
        onRefetch={loadNotes}
      />
      {editingNote && (
        <NoteForm event={event} profile={profile} editingNote={editingNote}
          onDone={() => { setEditingNote(null); loadNotes() }}
          onCancel={() => setEditingNote(null)} />
      )}

      {isAdmin && (
        <div className="modal-section">
          <button className="btn btn-secondary btn-sm"
            onClick={() => onSetView('edit-choice')}
            style={{ width:'100%', justifyContent:'center' }}>
            ✏️ Modifica evento
          </button>
        </div>
      )}
    </>
  )
}

function slotLabel(a, event) {
  if (a.is_jolly) return event.eventType === 'school' ? '⚡ Emergenza' : '⭐ Jolly'
  if (a.school_class_instance_id) {
    const cls = event.classBlock?.find(c => c.id === a.school_class_instance_id)
      || event.allClassesForDate?.find(c => c.id === a.school_class_instance_id)
    return cls ? `${cls.grade}ª${cls.section}` : 'Classe'
  }
  if (a.role_id) return event.slots?.find(s => s.role_id===a.role_id)?.role?.name || 'Compito'
  if (a.group_id) return event.slots?.find(s => s.group_id===a.group_id)?.group?.name || 'Gruppo'
  if (a.category_id) return event.slots?.find(s => s.category_id===a.category_id)?.category?.name || 'Categoria'
  return '—'
}

/* ============================================================
   SCHOOL PROGRAMME
   ============================================================ */
function SchoolProgramme({ event, attendances, profile }) {
  const allClasses = event.allClassesForDate || event.classBlock || []

  function toMin(t) {
    if (!t) return null
    const [h,m] = t.split(':').map(Number); return h*60+m
  }
  const sorted = [...allClasses].sort((a,b) => (toMin(a.start_time)??0)-(toMin(b.start_time)??0))
  const blocks = []
  let cur = []
  for (const cls of sorted) {
    if (cur.length === 0) { cur.push(cls); continue }
    const last = cur[cur.length-1]
    const diff = (toMin(cls.start_time)??0) - (toMin(last.start_time)??0)
    if (diff <= 90) { cur.push(cls) } else { blocks.push(cur); cur=[cls] }
  }
  if (cur.length) blocks.push(cur)

  return (
    <div className="modal-section">
      <div className="modal-section-title">Classi di oggi</div>
      {allClasses.length === 0 && <p style={{ fontSize:12, color:'#aaa' }}>Nessuna classe configurata.</p>}
      {blocks.map((block, bi) => (
        <div key={bi} style={{ background:'#f8f8f7', border:'1px solid #e5e5e5', borderRadius:8, padding:'8px 10px', marginBottom:8 }}>
          {block.map(cls => {
            const clsAtt = attendances.filter(a => a.school_class_instance_id === cls.id)
            const jolly = attendances.filter(a => a.is_jolly)
            const allPresent = [...clsAtt, ...jolly]
            const isMine = allPresent.some(a => a.coach_id === profile?.id)
            return (
              <div key={cls.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #f0f0f0', gap:8 }}>
                <span style={{ fontWeight:600, color: isMine ? '#2e7d4f' : '#1a1a1a', fontSize:13, minWidth:32 }}>
                  {cls.grade}ª{cls.section}
                </span>
                <span style={{ flex:1, fontSize:11, color: allPresent.length===0 ? '#f59e0b' : isMine ? '#2e7d4f' : '#555' }}>
                  {allPresent.length === 0
                    ? '⚠ Nessuno'
                    : allPresent.map(a => (a.coach_id===profile?.id ? '✓ Tu' : a.coach?.full_name)).join(', ')
                  }
                </span>
                <span style={{ fontSize:11, color:'#888', flexShrink:0 }}>{cls.start_time?.slice(0,5)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ============================================================
   NOTES SECTION
   ============================================================ */
function NotesSection({ notes, notesLoading, notesOpen, setNotesOpen, profile, isAdmin, onAddNote, onEditNote, onDeleteNote }) {
  const noteCount = notes?.length ?? '…'
  return (
    <div className="modal-section">
      <button onClick={() => setNotesOpen(o => !o)}
        style={{ width:'100%', padding:'8px 12px', background:'#f8f8f7', border:'1px solid #e5e5e5', borderRadius: notesOpen ? '8px 8px 0 0' : '8px', fontSize:13, fontWeight:500, color:'#555', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>📝 Note</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ background: noteCount > 0 ? '#1a1a1a' : '#e5e5e5', color: noteCount > 0 ? '#fff' : '#999', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:600 }}>
            {notesLoading ? '…' : noteCount}
          </span>
          <span style={{ color:'#aaa', fontSize:12 }}>{notesOpen ? '▴' : '▾'}</span>
        </div>
      </button>
      {notesOpen && (
        <div style={{ background:'#f8f8f7', border:'1px solid #e5e5e5', borderTop:'none', borderRadius:'0 0 8px 8px', padding:'10px 12px' }}>
          {notes?.length === 0 && <p style={{ fontSize:12, color:'#aaa', textAlign:'center', paddingBottom:6 }}>Nessuna nota.</p>}
          {notes?.map(n => (
            <NoteCard
              key={n.id} note={n}
              canEdit={isAdmin || n.author_id === profile?.id}
              onEdit={() => onEditNote(n)}
              onDelete={() => onDeleteNote(n.id)}
            />
          ))}
          <button onClick={onAddNote}
            style={{ width:'100%', padding:'7px', background:'#fff', border:'1px dashed #ccc', borderRadius:7, fontSize:12, color:'#888', cursor:'pointer', marginTop:2 }}>
            + Aggiungi nota
          </button>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   NOTE CARD con Lightbox
   ============================================================ */
function NoteCard({ note, canEdit, onEdit, onDelete }) {
  const [lightbox, setLightbox] = useState(null) // { urls, startIndex }
  const scopeLabel = { single:'Questo evento', week:'Settimana', multi:'Multipla' }

  const imageUrls = (note.note_images || []).map(img => {
    const { data } = supabase.storage.from('note-images').getPublicUrl(img.storage_path)
    return data?.publicUrl
  }).filter(Boolean)

  return (
    <div style={{ background:'#fff', borderRadius:7, padding:'8px 10px', marginBottom:6 }}>
      {lightbox && (
        <Lightbox
          images={lightbox.urls}
          startIndex={lightbox.startIndex}
          caption={note.content}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
        <div>
          <span style={{ fontSize:11, fontWeight:600, color:'#1a1a1a' }}>{note.author?.full_name}</span>
          <span style={{ fontSize:10, color:'#aaa', marginLeft:6 }}>{scopeLabel[note.scope]}</span>
        </div>
        {canEdit && (
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={onEdit} style={{
              fontSize:11, padding:'2px 7px', borderRadius:5,
              border:'1px solid #e5e5e5', background:'#f8f8f7',
              color:'#555', cursor:'pointer',
            }}>✏️</button>
            <button onClick={onDelete} style={{
              fontSize:11, padding:'2px 7px', borderRadius:5,
              border:'none', background:'#fef2f2',
              color:'#b91c1c', cursor:'pointer',
            }}>✕</button>
          </div>
        )}
      </div>

      {note.content && (
        <div style={{ fontSize:12, color:'#555', marginTop:3, lineHeight:1.5 }}>{note.content}</div>
      )}

      {/* Immagini con lightbox */}
      {imageUrls.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
          {imageUrls.map((url, i) => (
            <img
              key={i} src={url} alt="nota"
              onClick={() => setLightbox({ urls: imageUrls, startIndex: i })}
              style={{
                width:64, height:64, objectFit:'cover', borderRadius:6,
                border:'1px solid #e5e5e5', cursor:'pointer',
                transition:'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   NOTE FORM (crea + modifica)
   ============================================================ */
function NoteForm({ event, profile, editingNote, onDone, onCancel }) {
  const [scope, setScope] = useState(editingNote?.scope || 'single')
  const [content, setContent] = useState(editingNote?.content || '')
  const [images, setImages] = useState([])
  const [existingImages, setExistingImages] = useState(editingNote?.note_images || [])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  async function save() {
    setSaving(true)
    const notePayload = {
      author_id: profile.id,
      scope,
      content: content || null,
      event_id: event.id,
      instance_date: event.dateStr || null,
    }

    if (editingNote) {
      // UPDATE
      await supabase.from('notes').update({ scope, content: content || null }).eq('id', editingNote.id)
      // Nuove immagini
      if (images.length > 0) {
        for (const file of images) {
          const sanitizedName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
          const path = `${profile.id}/${editingNote.id}/${Date.now()}_${sanitizedName}`
          const { error: uploadError } = await supabase.storage.from('note-images').upload(path, file)
          if (!uploadError) {
            await supabase.from('note_images').insert({ note_id: editingNote.id, storage_path: path })
          }
        }
      }
    } else {
      // INSERT
      const { data: note, error: noteError } = await supabase.from('notes').insert(notePayload).select().single()
      console.log('Note saved:', note, noteError)
      if (note && images.length > 0) {
        for (const file of images) {
          const sanitizedName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
          const path = `${profile.id}/${note.id}/${Date.now()}_${sanitizedName}`
          const { data: uploadData, error: uploadError } = await supabase.storage.from('note-images').upload(path, file)
          console.log('Upload:', path, uploadData, uploadError)
          if (!uploadError) {
            await supabase.from('note_images').insert({ note_id: note.id, storage_path: path })
          }
        }
      }
    }

    setSaving(false)
    onDone()
  }

  async function removeExistingImage(img) {
    await supabase.storage.from('note-images').remove([img.storage_path])
    await supabase.from('note_images').delete().eq('id', img.id)
    setExistingImages(prev => prev.filter(i => i.id !== img.id))
  }

  return (
    <div style={{ background: '#f8f8f7', borderRadius: 10, padding: '12px', marginBottom: 8 }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>
        {editingNote ? '✏️ Modifica nota' : '+ Nuova nota'}
      </div>
      <div className="field">
        <label>Ambito</label>
        <div className="chip-group">
          {[{value:'single',label:'Questo evento'},{value:'week',label:'Settimana'},{value:'multi',label:'Multipla'}].map(s => (
            <div key={s.value} className={`chip${scope===s.value?' selected':''}`} onClick={() => setScope(s.value)}>{s.label}</div>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Nota</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Scrivi qui..."
          style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:8, fontSize:13, resize:'vertical', minHeight:72, fontFamily:'inherit' }}
        />
      </div>

      {/* Immagini esistenti (in modifica) */}
      {existingImages.length > 0 && (
        <div className="field">
          <label>Immagini esistenti</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {existingImages.map(img => {
              const { data } = supabase.storage.from('note-images').getPublicUrl(img.storage_path)
              return (
                <div key={img.id} style={{ position:'relative' }}>
                  <img src={data?.publicUrl} alt="" style={{ width:64, height:64, objectFit:'cover', borderRadius:6, border:'1px solid #e5e5e5' }} />
                  <button
                    onClick={() => removeExistingImage(img)}
                    style={{
                      position:'absolute', top:-6, right:-6, width:20, height:20,
                      borderRadius:'50%', background:'#ef4444', color:'#fff',
                      border:'none', cursor:'pointer', fontSize:12,
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}
                  >×</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="field">
        <label>Aggiungi immagini</label>
        <div className="img-upload-area" onClick={() => fileRef.current.click()}>
          Clicca per aggiungere immagini
        </div>
        <input type="file" ref={fileRef} accept="image/*" multiple style={{ display:'none' }}
          onChange={e => setImages(prev => [...prev, ...Array.from(e.target.files)])} />
        {images.length > 0 && (
          <div className="img-previews">
            {images.map((f,i) => (
              <div key={i} style={{ position:'relative' }}>
                <img src={URL.createObjectURL(f)} className="img-preview-thumb" alt="preview" />
                <button
                  onClick={() => setImages(prev => prev.filter((_,idx) => idx !== i))}
                  style={{
                    position:'absolute', top:-4, right:-4, width:16, height:16,
                    borderRadius:'50%', background:'#ef4444', color:'#fff',
                    border:'none', cursor:'pointer', fontSize:10,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary btn-sm" onClick={save}
          disabled={(!content && images.length===0 && existingImages.length===0) || saving}>
          {saving ? 'Salvataggio...' : editingNote ? 'Salva modifiche' : 'Salva nota'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

/* ============================================================
   PRESENCE FOOTER
   ============================================================ */
function PresenceFooter({ event, profile, attendances, myAttendances, isSigned, onRefetch }) {
  const [mode, setMode] = useState('idle')
  const [saving, setSaving] = useState(false)
  const [selectedClassIds, setSelectedClassIds] = useState(new Set())
  const [emergencyNote, setEmergencyNote] = useState('')
  const [isEmergency, setIsEmergency] = useState(false)
  const [selectedSlotKey, setSelectedSlotKey] = useState(null)

  const allClasses = event.allClassesForDate || event.classBlock || []
  const isSchool = event.eventType === 'school'

  function toggleClassId(id) {
    setSelectedClassIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleEmergency() {
    setIsEmergency(p => !p)
    if (isEmergency) setEmergencyNote('')
  }

  const slotOptions = (event.slots || []).map(s => {
    if (s.category) return { key:`cat_${s.category_id}`, label:s.category.name, category_id:s.category_id, group_id:null, role_id:null, min:s.min_coaches }
    if (s.group) {
      const label = s.group.name || s.group.category_group_members?.map(m=>m.category?.name).join('+') || 'Gruppo'
      return { key:`grp_${s.group_id}`, label, category_id:null, group_id:s.group_id, role_id:null, min:s.min_coaches }
    }
    if (s.role) return { key:`role_${s.role_id}`, label:s.role.name, category_id:null, group_id:null, role_id:s.role_id, min:s.min_coaches }
    return null
  }).filter(Boolean)

  const slotWithCoverage = slotOptions.map(opt => {
    const count = attendances.filter(a => {
      if (a.is_jolly) return false
      if (opt.category_id) return a.category_id === opt.category_id
      if (opt.group_id)    return a.group_id    === opt.group_id
      if (opt.role_id)     return a.role_id     === opt.role_id
      return false
    }).length
    return { ...opt, covered: count }
  })
  const jollyCount = attendances.filter(a => a.is_jolly).length

  const canConfirmSchool = selectedClassIds.size > 0 || isEmergency
  const canConfirmOther  = !!selectedSlotKey

  async function confirmPresence() {
    if (!selectedSlotKey && !isSchool) return
    setSaving(true)
    try {
      let instanceId = event.instance_id

      if (!isSchool && !instanceId) {
        const { data: inst, error } = await supabase
          .from('event_instances')
          .insert({ event_id: event.id, instance_date: event.dateStr })
          .select().single()
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('event_instances').select('id')
            .eq('event_id', event.id).eq('instance_date', event.dateStr).single()
          instanceId = existing.id
        } else if (error) throw error
        else instanceId = inst.id
      }

      if (isSchool) {
        const classesToRegister = Array.from(selectedClassIds).filter(classId =>
          !myAttendances.some(a => a.school_class_instance_id === classId && !a.is_jolly)
        )

        if (classesToRegister.length > 0 || isEmergency) {
          const existingSchoolAtt = myAttendances.filter(a => !a.is_jolly && a.school_class_instance_id)
          for (const att of existingSchoolAtt) {
            await supabase.from('attendances_new').delete().eq('id', att.id)
          }

          const attendancesToInsert = classesToRegister.map(classId => ({
            coach_id: profile.id,
            school_class_instance_id: classId,
            is_jolly: false,
          }))

          if (isEmergency) {
            attendancesToInsert.push({
              coach_id: profile.id,
              is_jolly: true,
              notes: emergencyNote || null,
            })
          }

          const { error } = await supabase.from('attendances_new').insert(attendancesToInsert)
          if (error) throw error
        }
      } else {
        const payload = {
          coach_id: profile.id,
          instance_id: instanceId,
          is_jolly: selectedSlotKey === 'jolly',
        }
        if (selectedSlotKey?.startsWith('cat_')) payload.category_id = parseInt(selectedSlotKey.split('_')[1])
        else if (selectedSlotKey?.startsWith('grp_')) payload.group_id = parseInt(selectedSlotKey.split('_')[1])
        else if (selectedSlotKey?.startsWith('role_')) payload.role_id = parseInt(selectedSlotKey.split('_')[1])

        const { error } = await supabase.from('attendances_new').insert(payload)
        if (error) throw error
      }

      setSaving(false)
      setMode('idle')
      setSelectedClassIds(new Set())
      setIsEmergency(false)
      setEmergencyNote('')
      setSelectedSlotKey(null)
      await onRefetch()
    } catch (err) {
      console.error(err)
      alert('Errore: ' + err.message)
      setSaving(false)
    }
  }

  async function disdiciAll() {
    setSaving(true)
    for (const a of myAttendances) {
      await supabase.from('attendances_new').delete().eq('id', a.id)
    }
    setSaving(false)
    setMode('idle')
    onRefetch()
  }

  return (
    <div style={{ borderTop:'1px solid #f0f0f0', background:'#fff' }}>
      {mode === 'declare' && (
        <div style={{ padding:'14px 16px 0', borderTop:'1px solid #e5e5e5', background:'#f8f8f7' }}>
          {isSchool ? (
            <>
              <div style={{ fontSize:12, color:'#666', fontWeight:500, marginBottom:10 }}>A quali classi partecipi?</div>
              {allClasses.map(cls => {
                const isSel = selectedClassIds.has(cls.id)
                const clsAtt = attendances.filter(a => a.school_class_instance_id===cls.id)
                return (
                  <OptionCard key={cls.id} selected={isSel} onToggle={() => toggleClassId(cls.id)} isRadio={false}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{cls.grade}ª{cls.section}</span>
                        {cls.start_time && <span style={{ fontSize:11, color:'#888' }}>· {cls.start_time.slice(0,5)}</span>}
                      </div>
                      <div style={{ fontSize:11, color: clsAtt.length===0 ? '#f59e0b' : '#555', marginTop:2 }}>
                        {clsAtt.length === 0 ? '⚠ Nessuno ancora' : clsAtt.map(a=>a.coach?.full_name).join(', ')}
                      </div>
                    </div>
                  </OptionCard>
                )
              })}
              <OptionCard selected={isEmergency} onToggle={toggleEmergency} isRadio={false} isEmergency>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>⚡ Emergenza</span>
                  <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Disponibile se serve un sostituto</div>
                </div>
              </OptionCard>
              {isEmergency && (
                <div style={{ marginTop:-2, marginBottom:8 }}>
                  <input
                    value={emergencyNote}
                    onChange={e => setEmergencyNote(e.target.value)}
                    placeholder="Specifica disponibilità..."
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid #c4b5fd', borderRadius:8, fontSize:12, background:'#faf5ff' }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize:12, color:'#666', fontWeight:500, marginBottom:10 }}>
                {event.eventType==='other' ? 'Quale compito?' : 'Per quale gruppo?'}
              </div>
              {slotWithCoverage.map(opt => {
                const isSel = selectedSlotKey === opt.key
                const s = coverageBadge(opt.covered + jollyCount, opt.min)
                return (
                  <OptionCard key={opt.key} selected={isSel} onToggle={() => setSelectedSlotKey(opt.key)} isRadio>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{opt.label}</span>
                        <span style={{ padding:'1px 7px', borderRadius:8, fontSize:10, fontWeight:600, marginLeft:6, background:s.bg, color:s.color }}>{s.text}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#555', marginTop:2 }}>
                        {attendances.filter(a => {
                          if (a.is_jolly) return false
                          if (opt.category_id) return a.category_id===opt.category_id
                          if (opt.group_id)    return a.group_id===opt.group_id
                          if (opt.role_id)     return a.role_id===opt.role_id
                          return false
                        }).map(a=>a.coach?.full_name).join(', ') || <span style={{ color:'#aaa' }}>Nessuno ancora</span>}
                      </div>
                    </div>
                  </OptionCard>
                )
              })}
              <OptionCard selected={selectedSlotKey==='jolly'} onToggle={() => setSelectedSlotKey(selectedSlotKey==='jolly' ? null : 'jolly')} isRadio isJolly>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>⭐ Jolly</span>
                  <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Disponibile dove serve di più</div>
                </div>
              </OptionCard>
            </>
          )}
          <div style={{ display:'flex', gap:8, paddingBottom:12, marginTop:4 }}>
            <button
              onClick={confirmPresence}
              disabled={isSchool ? !canConfirmSchool : !canConfirmOther || saving}
              style={{
                flex:2, padding:'10px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor:'pointer',
                background: (isSchool ? canConfirmSchool : canConfirmOther) ? '#2e7d4f' : '#e5e5e5',
                color:      (isSchool ? canConfirmSchool : canConfirmOther) ? '#fff' : '#aaa',
              }}>
              {saving ? 'Salvataggio...' : '✓ Conferma presenza'}
            </button>
            <button onClick={() => setMode('idle')}
              style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #ddd', background:'#fff', fontSize:13, color:'#555', cursor:'pointer' }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {mode === 'disdici' && (
        <div style={{ padding:'14px 16px 0', borderTop:'1px solid #e5e5e5', background:'#fef2f2' }}>
          <div style={{ fontSize:12, color:'#666', fontWeight:500, marginBottom:10 }}>
            Sei sicuro di voler disdire {myAttendances.length > 1 ? 'tutte le presenze' : 'la presenza'}?
          </div>
          <div style={{ display:'flex', gap:8, paddingBottom:12 }}>
            <button onClick={disdiciAll} disabled={saving}
              style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:'#b91c1c', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              {saving ? 'Annullamento...' : '✕ Sì, disdici'}
            </button>
            <button onClick={() => setMode('idle')}
              style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #ddd', background:'#fff', fontSize:13, color:'#555', cursor:'pointer' }}>
              No
            </button>
          </div>
        </div>
      )}

      {mode === 'idle' && (
        <div style={{ padding:'10px 16px 14px' }}>
          {isSigned ? (
            <button onClick={() => setMode('disdici')}
              style={{ width:'100%', padding:'11px', background:'#fcd5d5', border:'none', borderRadius:10, fontSize:14, fontWeight:600, color:'#b91c1c', cursor:'pointer' }}>
              Disdici presenza
            </button>
          ) : (
            <button onClick={() => setMode('declare')}
              style={{ width:'100%', padding:'11px', background:'#1a1a1a', border:'none', borderRadius:10, fontSize:14, fontWeight:600, color:'#fff', cursor:'pointer' }}>
              Dichiara presenza
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   EDIT CHOICE / EDIT INSTANCE
   ============================================================ */
function EditChoiceView({ event, onEditInstance, onCancel }) {
  const navigate = useNavigate()
  return (
    <div style={{ padding:'8px 0' }}>
      <p style={{ fontSize:13, color:'#555', marginBottom:16 }}>Vuoi modificare solo questa data o l'intero evento?</p>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <button onClick={onEditInstance}
          style={{ padding:'14px 16px', borderRadius:10, border:'1.5px solid #1a1a1a', background:'#fff', cursor:'pointer', textAlign:'left' }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>📅 Solo questa data</div>
          <div style={{ fontSize:12, color:'#888' }}>Cambia orari o rimuovi classi per {event.dateStr}</div>
        </button>
        <button onClick={() => navigate('/admin')}
          style={{ padding:'14px 16px', borderRadius:10, border:'1.5px solid #e5e5e5', background:'#fff', cursor:'pointer', textAlign:'left' }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>🔁 Tutto l'evento</div>
          <div style={{ fontSize:12, color:'#888' }}>Vai alla pagina Gestione</div>
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

function EditInstanceView({ event, onDone, onCancel }) {
  const originalDate = event.dateStr || ''
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [moveMode, setMoveMode] = useState(false)

  useEffect(() => { loadClasses() }, [])

  async function loadClasses() {
    setLoading(true)
    const { data } = await supabase
      .from('school_class_instances').select('*')
      .eq('event_id', event.id).eq('instance_date', originalDate)
      .order('start_time', { nullsFirst:true })
    setClasses((data||[]).map(c => ({ ...c, _dirty:false })))
    setLoading(false)
  }

  function addDaysToStr(dateStr, d) {
    const [y,m,day] = dateStr.split('-').map(Number)
    const dt = new Date(y, m-1, day+d)
    return [dt.getFullYear(), String(dt.getMonth()+1).padStart(2,'0'), String(dt.getDate()).padStart(2,'0')].join('-')
  }

  function update(id, field, value) {
    setClasses(prev => prev.map(c => c.id===id ? {...c,[field]:value,_dirty:true} : c))
  }

  async function save() {
    setSaving(true)
    try {
      for (const cls of classes.filter(c => c._dirty)) {
        const { _dirty, ...data } = cls
        await supabase.from('school_class_instances').update({
          instance_date: data.instance_date,
          start_time:    data.start_time,
          min_coaches:   data.min_coaches,
          instance_note: data.instance_note,
          removed:       data.removed,
        }).eq('id', data.id)
      }
      setSaving(false); onDone()
    } catch (err) {
      alert('Errore: ' + err.message); setSaving(false)
    }
  }

  if (loading) return <div style={{ fontSize:13, color:'#aaa', padding:12 }}>Caricamento...</div>

  return (
    <div>
      <div className="info-banner" style={{ marginBottom:14 }}>
        Modifiche solo per questa data. L'evento originale non cambia.
      </div>
      {classes.length > 1 && (
        <div style={{ marginBottom:14 }}>
          <button type="button" onClick={() => setMoveMode(m=>!m)}
            style={{ width:'100%', padding:'8px', fontSize:12, fontWeight:500, borderRadius:8, border:'1px solid #e5e5e5', background:moveMode?'#1a1a1a':'#fff', color:moveMode?'#fff':'#555', cursor:'pointer' }}>
            {moveMode ? '✕ Chiudi modalità sposta' : '↔ Sposta singole classi'}
          </button>
        </div>
      )}
      {classes.length === 0 && <p style={{ fontSize:12, color:'#aaa' }}>Nessuna classe trovata per questa data.</p>}
      {classes.map(cls => {
        const isShifted = cls.instance_date !== originalDate
        return (
          <div key={cls.id} style={{ background:cls.removed?'#fef2f2':'#f8f8f7', border:`1px solid ${cls.removed?'#fca5a5':isShifted?'#fde68a':'#e5e5e5'}`, borderRadius:8, padding:'10px 12px', marginBottom:8, opacity:cls.removed?.7:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:cls.removed?0:10 }}>
              <div>
                <span style={{ fontSize:14, fontWeight:600 }}>{cls.grade}ª{cls.section}</span>
                {cls.start_time && !cls.removed && <span style={{ fontSize:12, color:'#888', marginLeft:8 }}>🕐 {cls.start_time.slice(0,5)}</span>}
                {isShifted && !cls.removed && <span style={{ fontSize:11, background:'#fef3c7', color:'#b8610a', padding:'1px 6px', borderRadius:4, marginLeft:8 }}>📅 {cls.instance_date}</span>}
              </div>
              <button type="button" onClick={() => update(cls.id,'removed',!cls.removed)}
                style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'none', cursor:'pointer', fontWeight:500, background:cls.removed?'#d1fae5':'#fee2e2', color:cls.removed?'#065f46':'#b91c1c' }}>
                {cls.removed ? '↩ Ripristina' : '✕ Rimuovi'}
              </button>
            </div>
            {!cls.removed && (
              <>
                {moveMode && (
                  <div style={{ marginBottom:10, padding:'8px 10px', background:'#fffbeb', borderRadius:6, border:'1px solid #fde68a' }}>
                    <div style={{ fontSize:11, color:'#b8610a', fontWeight:500, marginBottom:5 }}>📅 Data per questa classe</div>
                    <input type="date" value={cls.instance_date}
                      onChange={e => update(cls.id,'instance_date',e.target.value)}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #ddd', borderRadius:6, fontSize:12 }} />
                    {cls.instance_date !== originalDate && (
                      <button type="button" onClick={() => update(cls.id,'instance_date',originalDate)}
                        style={{ marginTop:5, width:'100%', padding:'4px', fontSize:11, borderRadius:6, border:'1px solid #fca5a5', background:'#fef2f2', color:'#b91c1c', cursor:'pointer' }}>
                        ↩ Ripristina data originale ({originalDate})
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:11, color:'#888', marginBottom:3 }}>Orario inizio</div>
                    <input type="time" value={cls.start_time||''}
                      onChange={e => update(cls.id,'start_time',e.target.value)}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #ddd', borderRadius:6, fontSize:12 }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:'#888', marginBottom:3 }}>Min. allenatori</div>
                    <input type="number" min={1} max={10} value={cls.min_coaches||2}
                      onChange={e => update(cls.id,'min_coaches',+e.target.value)}
                      style={{ width:'100%', padding:'5px 8px', border:'1px solid #ddd', borderRadius:6, fontSize:12 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'#888', marginBottom:3 }}>Nota per questa data</div>
                  <input value={cls.instance_note||''}
                    onChange={e => update(cls.id,'instance_note',e.target.value)}
                    placeholder="es. Palestra B, cambio aula..."
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #ddd', borderRadius:6, fontSize:12 }} />
                </div>
              </>
            )}
          </div>
        )
      })}
      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving?'Salvataggio...':'Salva modifiche'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}