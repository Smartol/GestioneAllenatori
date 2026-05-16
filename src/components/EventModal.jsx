import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getCovColor, computeCoverage } from '../hooks/useCalendarData'

/* ============================================================
   HELPERS
   ============================================================ */
function coverageBadge(covered, min) {
  if (covered === 0) return { bg: '#fcd5d5', color: '#b91c1c', text: `0/${min} ✗` }
  if (covered < min)  return { bg: '#fde8c8', color: '#b8610a', text: `${covered}/${min} ⚠` }
  return { bg: '#d4edda', color: '#2e7d4f', text: `${covered}/${min} ✓` }
}

function Badge({ covered, min }) {
  const s = coverageBadge(covered, min)
  return (
    <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:8,
      fontSize:10, fontWeight:600, background:s.bg, color:s.color, marginLeft:6 }}>
      {s.text}
    </span>
  )
}

/* Card selezionabile — usata per ogni slot/classe/ruolo */
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
   EVENT MODAL — entry point
   ============================================================ */
export default function EventModal({ event, attendances, onClose, onRefetch, onDelete }) {
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

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ display:'flex', flexDirection:'column', maxHeight:'90vh' }}>

        {/* HEADER */}
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

        {/* BODY */}
        <div className="modal-body" style={{ flex:1, overflowY:'auto' }}>
          {view === 'main' && (
            <MainBody
              event={event}
              attendances={attendances}
              myAttendances={myAttendances}
              isSigned={isSigned}
              profile={profile}
              isAdmin={isAdmin}
              onSetView={setView}
              onRefetch={onRefetch}
            />
          )}
          {view === 'note-form' && (
            <NoteForm event={event} profile={profile}
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

        {/* FOOTER */}
        {view === 'main' && (
          <PresenceFooter
            event={event}
            profile={profile}
            attendances={attendances}
            myAttendances={myAttendances}
            isSigned={isSigned}
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
function MainBody({ event, attendances, myAttendances, isSigned, profile, isAdmin, onSetView, onRefetch }) {
  const [notes, setNotes] = useState(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesLoading, setNotesLoading] = useState(false)

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    setNotesLoading(true)
    let q = supabase.from('notes')
      .select('*, author:profiles(id,full_name), note_images(id,storage_path)')
      .order('created_at')
    if (event.eventType === 'training' || event.eventType === 'school') {
      q = q.eq('training_id', event.id).eq('instance_date', event.dateStr)
    } else {
      q = q.eq('activity_id', event.id)
    }
    const { data } = await q
    setNotes(data || [])
    setNotesLoading(false)
  }

  // ── SCUOLA: programma classi ──
  if (event.eventType === 'school') {
    return (
      <>
        <SchoolProgramme
          event={event}
          attendances={attendances}
          profile={profile}
        />
        <NotesSection notes={notes} notesLoading={notesLoading}
          notesOpen={notesOpen} setNotesOpen={setNotesOpen}
          onAddNote={() => onSetView('note-form')} />
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

  // ── ALTRI TIPI: copertura + lista allenatori ──
  const coverage = computeCoverage(event.slots, attendances)

  return (
    <>
      {/* COPERTURA */}
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

      {/* ALLENATORI */}
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

      <NotesSection notes={notes} notesLoading={notesLoading}
        notesOpen={notesOpen} setNotesOpen={setNotesOpen}
        onAddNote={() => onSetView('note-form')} />

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
   SCHOOL PROGRAMME — visualizza tutte le classi del giorno
   ============================================================ */
function SchoolProgramme({ event, attendances, profile }) {
  const allClasses = event.allClassesForDate || event.classBlock || []

  // Raggruppa per blocco (stesso raggruppamento del calendario)
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
      {allClasses.length === 0 && (
        <p style={{ fontSize:12, color:'#aaa' }}>Nessuna classe configurata per questa data.</p>
      )}
      {blocks.map((block, bi) => (
        <div key={bi} style={{ background:'#f8f8f7', border:'1px solid #e5e5e5', borderRadius:8, padding:'8px 10px', marginBottom:8 }}>
          {blocks.length > 1 && (
            <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>
              {bi === 0 ? 'Blocco mattina' : bi === blocks.length-1 && blocks.length > 2 ? 'Blocco pomeriggio' : `Blocco ${bi+1}`}
            </div>
          )}
          {block.map(cls => {
            const clsAttendances = attendances.filter(a => a.school_class_instance_id === cls.id)
            const jolly = attendances.filter(a => a.is_jolly)
            const allPresent = [...clsAttendances, ...jolly]
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
                <span style={{ fontSize:11, color:'#888', flexShrink:0 }}>
                  {cls.start_time?.slice(0,5)}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ============================================================
   PRESENCE FOOTER — dichiarazione presenza per tutti i tipi
   ============================================================ */
function PresenceFooter({ event, profile, attendances, myAttendances, isSigned, onRefetch }) {
  const [mode, setMode] = useState('idle') // idle | declare | disdici
  const [saving, setSaving] = useState(false)

  // Per school: set di class instance id selezionati + emergenza
  const [selectedClassIds, setSelectedClassIds] = useState(new Set())
  const [emergencyNote, setEmergencyNote] = useState('')
  const [isEmergency, setIsEmergency] = useState(false)

  // Per training/festival/other: radio
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

  // Slot options per training/festival/other
  const slotOptions = (event.slots || []).map(s => {
    if (s.category) return { key:`cat_${s.category_id}`, label:s.category.name, sub:`min ${s.min_coaches}`, category_id:s.category_id, group_id:null, role_id:null, covered: 0, min: s.min_coaches }
    if (s.group) {
      const label = s.group.name || s.group.category_group_members?.map(m=>m.category?.name).join('+') || 'Gruppo'
      return { key:`grp_${s.group_id}`, label, sub:`min ${s.min_coaches}`, category_id:null, group_id:s.group_id, role_id:null, min:s.min_coaches }
    }
    if (s.role) return { key:`role_${s.role_id}`, label:s.role.name, sub:`min ${s.min_coaches}`, category_id:null, group_id:null, role_id:s.role_id, min:s.min_coaches }
    return null
  }).filter(Boolean)

  // Calcola copertura per ogni slot
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
    setSaving(true)
    try {
      let instanceId = event.instance_id
      if (!instanceId) {
        const { data: inst, error } = await supabase
          .from('event_instances')
          .insert({ event_id: event.id, instance_date: event.dateStr })
          .select().single()
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('event_instances')
            .select('id')
            .eq('event_id', event.id)
            .eq('instance_date', event.dateStr)
            .single()
          instanceId = existing.id
        } else if (error) throw error
        else instanceId = inst.id
      }

      if (isSchool) {
        const classesToRegister = Array.from(selectedClassIds).filter(classId => {
          const alreadyRegistered = myAttendances.some(a => 
            a.school_class_instance_id === classId && !a.is_jolly
          )
          return !alreadyRegistered
        })

        if (classesToRegister.length > 0) {
          // Cancella le vecchie presenze per questo instance (scuola)
          const existingSchoolAtt = myAttendances.filter(a => !a.is_jolly && a.school_class_instance_id)
          for (const att of existingSchoolAtt) {
            await supabase.from('attendances_new').delete().eq('id', att.id)
          }

          // Reinserisci tutte le classi selezionate
          const attendancesToInsert = classesToRegister.map(classId => ({
            coach_id: profile.id, instance_id: instanceId,
            is_jolly: false, school_class_instance_id: classId,
          }))
          
          if (isEmergency) {
            attendancesToInsert.push({
              coach_id: profile.id, instance_id: instanceId,
              is_jolly: true,
              notes: emergencyNote || null,
            })
          }
          
          const { error } = await supabase.from('attendances_new').insert(attendancesToInsert)
          if (error) throw error
        }
      }

      setSaving(false)
      setMode('idle')
      setSelectedClassIds(new Set())
      setIsEmergency(false)
      setEmergencyNote('')
      setSelectedSlotKey(null)
      onRefetch()
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

  // ── RENDER ──
  return (
    <div style={{ borderTop:'1px solid #f0f0f0', background:'#fff' }}>

      {/* MODALITÀ DICHIARA */}
      {mode === 'declare' && (
        <div style={{ padding:'14px 16px 0', borderTop:'1px solid #e5e5e5', background:'#f8f8f7' }}>
          {isSchool ? (
            <>
              <div style={{ fontSize:12, color:'#666', fontWeight:500, marginBottom:10 }}>
                A quali classi partecipi?
              </div>
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

              {/* EMERGENZA */}
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
                    placeholder="Specifica la tua disponibilità (es. solo mattina, fino alle 12...)"
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid #c4b5fd', borderRadius:8, fontSize:12, background:'#faf5ff' }}
                    autoFocus
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
                const jollyTotal = jollyCount
                const s = coverageBadge(opt.covered + jollyTotal, opt.min)
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
              <OptionCard
                selected={selectedSlotKey==='jolly'}
                onToggle={() => setSelectedSlotKey(selectedSlotKey==='jolly' ? null : 'jolly')}
                isRadio isJolly>
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

      {/* MODALITÀ DISDICI */}
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

      {/* BOTTONE PRINCIPALE */}
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
   NOTES SECTION
   ============================================================ */
function NotesSection({ notes, notesLoading, notesOpen, setNotesOpen, onAddNote }) {
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
          {notes?.map(n => <NoteCard key={n.id} note={n} />)}
          <button onClick={onAddNote}
            style={{ width:'100%', padding:'7px', background:'#fff', border:'1px dashed #ccc', borderRadius:7, fontSize:12, color:'#888', cursor:'pointer', marginTop:2 }}>
            + Aggiungi nota
          </button>
        </div>
      )}
    </div>
  )
}

function NoteCard({ note }) {
  const scopeLabel = { single:'Questo evento', week:'Settimana', multi:'Multipla' }
  return (
    <div style={{ background:'#fff', borderRadius:7, padding:'8px 10px', marginBottom:6 }}>
      <span style={{ fontSize:11, fontWeight:600, color:'#1a1a1a' }}>{note.author?.full_name}</span>
      <span style={{ fontSize:10, color:'#aaa', marginLeft:6 }}>{scopeLabel[note.scope]}</span>
      {note.content && <div style={{ fontSize:12, color:'#555', marginTop:3, lineHeight:1.5 }}>{note.content}</div>}
      {note.note_images?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
          {note.note_images.map(img => {
            const { data } = supabase.storage.from('note-images').getPublicUrl(img.storage_path)
            return <img key={img.id} src={data.publicUrl} style={{ width:60, height:60, objectFit:'cover', borderRadius:6, border:'1px solid #e5e5e5' }} alt="nota" />
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

  async function save() {
    setSaving(true)
    const notePayload = { author_id:profile.id, scope, content:content||null }
    if (event.eventType==='training'||event.eventType==='school') {
      notePayload.training_id = event.id; notePayload.instance_date = event.dateStr
    } else {
      notePayload.activity_id = event.id
    }
    const { data:note } = await supabase.from('notes').insert(notePayload).select().single()
    if (note && images.length > 0) {
      for (const file of images) {
        const path = `${profile.id}/${note.id}/${Date.now()}_${file.name}`
        await supabase.storage.from('note-images').upload(path, file)
        await supabase.from('note_images').insert({ note_id:note.id, storage_path:path })
      }
    }
    setSaving(false); onDone()
  }

  return (
    <div>
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
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Scrivi qui..." />
      </div>
      <div className="field">
        <label>Immagini</label>
        <div className="img-upload-area" onClick={() => fileRef.current.click()}>Clicca per aggiungere immagini</div>
        <input type="file" ref={fileRef} accept="image/*" multiple style={{ display:'none' }} onChange={e => setImages(prev=>[...prev,...Array.from(e.target.files)])} />
        {images.length > 0 && (
          <div className="img-previews">
            {images.map((f,i) => <img key={i} src={URL.createObjectURL(f)} className="img-preview-thumb" alt="preview" />)}
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={(!content&&images.length===0)||saving}>
          {saving?'Salvataggio...':'Salva nota'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  )
}

/* ============================================================
   EDIT CHOICE VIEW
   ============================================================ */
function EditChoiceView({ event, onEditInstance, onCancel }) {
  const navigate = useNavigate()
  return (
    <div style={{ padding:'8px 0' }}>
      <p style={{ fontSize:13, color:'#555', marginBottom:16 }}>
        Vuoi modificare solo questa data o l'intero evento?
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <button onClick={onEditInstance}
          style={{ padding:'14px 16px', borderRadius:10, border:'1.5px solid #1a1a1a', background:'#fff', cursor:'pointer', textAlign:'left' }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>📅 Solo questa data</div>
          <div style={{ fontSize:12, color:'#888' }}>Cambia orari, rimuovi classi o aggiungi note per {event.dateStr}</div>
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

/* ============================================================
   EDIT INSTANCE VIEW
   ============================================================ */
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

  function DateShortcuts({ cls }) {
    const isChanged = cls.instance_date !== originalDate
    return (
      <div style={{ marginTop:5 }}>
        <div style={{ display:'flex', gap:5 }}>
          {[{l:'−7gg',d:-7},{l:'−1gg',d:-1},{l:'+1gg',d:+1},{l:'+7gg',d:+7}].map(s => (
            <button key={s.d} type="button" onClick={() => update(cls.id,'instance_date',addDaysToStr(cls.instance_date||originalDate,s.d))}
              style={{ flex:1, padding:'5px 0', fontSize:11, borderRadius:6, border:'1px solid #e5e5e5', background:'#f8f8f7', color:'#555', cursor:'pointer' }}>
              {s.l}
            </button>
          ))}
        </div>
        {isChanged && (
          <button type="button" onClick={() => update(cls.id,'instance_date',originalDate)}
            style={{ marginTop:5, width:'100%', padding:'4px', fontSize:11, borderRadius:6, border:'1px solid #fca5a5', background:'#fef2f2', color:'#b91c1c', cursor:'pointer' }}>
            ↩ Ripristina data originale ({originalDate})
          </button>
        )}
      </div>
    )
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
                    <DateShortcuts cls={cls} />
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