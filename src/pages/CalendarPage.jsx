import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, addMonths, subMonths, startOfWeek, format, isSameDay, getDay, isBefore, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { useCalendarData, computeCoverage, getCovColor, isDateAbsent, getSchoolCovColor } from '../hooks/useCalendarData'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import EventModal from '../components/EventModal'

const TODAY = new Date()

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getWeekDays(referenceDate) {
  const todayStart = startOfDay(TODAY)
  const refStart = startOfDay(referenceDate)
  const isCurrent = isSameDay(refStart, todayStart)
  if (isCurrent) return Array.from({ length: 7 }, (_, i) => addDays(TODAY, i))
  const mon = startOfWeek(referenceDate, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

function formatDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function addWeeksLocal(dateStr, weeks) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + weeks * 7)
  return formatDateLocal(dt)
}

function covColors(color, isPast) {
  return {
    border: isPast ? '#ccc' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c',
    bg:     isPast ? '#f0f0f0' : color === 'green' ? '#d4edda' : color === 'orange' ? '#fde8c8' : '#fcd5d5',
    text:   isPast ? '#aaa' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c',
  }
}

/* ============================================================
   MINI MODAL ASSENZA GIORNO
   ============================================================ */
function DayAbsenceModal({ dateStr, absences, onClose, onRefetch }) {
  const { profile } = useAuth()
  const [saving, setSaving] = useState(false)

  const myAbsences = absences.filter(a =>
    a.coach_id === profile?.id &&
    a.absence_type === 'period' &&
    a.date_from <= dateStr &&
    a.date_to >= dateStr
  )

  async function deleteAbsence(ab) {
    // Cerca assenze future dello stesso tipo per chiedere
    const { data: futureAbs } = await supabase
      .from('absences')
      .select('*')
      .eq('coach_id', profile.id)
      .eq('absence_type', 'period')
      .gt('date_from', dateStr)
      .order('date_from')

    let deleteIds = [ab.id]

    if (futureAbs?.length > 0) {
      const msg = `Hai ${futureAbs.length} assenza/e programmate nei giorni successivi.\n\nVuoi eliminare anche quelle?`
      const deleteAll = window.confirm(msg)
      if (deleteAll) deleteIds = [ab.id, ...futureAbs.map(f => f.id)]
    }

    setSaving(true)
    for (const id of deleteIds) await supabase.from('absences').delete().eq('id', id)
    setSaving(false)
    onRefetch()
    onClose()
  }

  function editAbsence(ab) {
    // Apre il modal bacheca — per ora mostriamo le info
    alert(`Assenza dal ${ab.date_from} al ${ab.date_to}${ab.note ? '\nNota: ' + ab.note : ''}\n\nPer modificarla vai in Bacheca → Assenze.`)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 340 }}>
        <div className="modal-head" style={{ background: '#b91c1c' }}>
          <div className="modal-title">🚫 Assenze — {format(new Date(dateStr + 'T00:00:00'), 'd MMMM yyyy', { locale: it })}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {myAbsences.length === 0 ? (
            <p style={{ fontSize: 13, color: '#aaa' }}>Nessuna assenza tua in questa data.</p>
          ) : myAbsences.map(ab => (
            <div key={ab.id} style={{ padding: '10px 12px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>
                {ab.date_from === ab.date_to ? ab.date_from : `${ab.date_from} → ${ab.date_to}`}
              </div>
              {ab.note && <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{ab.note}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => editAbsence(ab)}
                  style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1px solid #e5e5e5', background: '#f8f8f7', fontSize: 12, color: '#555', cursor: 'pointer' }}>
                  ✏️ Modifica
                </button>
                <button onClick={() => deleteAbsence(ab)} disabled={saving}
                  style={{ flex: 1, padding: '7px', borderRadius: 7, border: 'none', background: '#b91c1c', fontSize: 12, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  {saving ? '...' : 'Elimina'}
                </button>
              </div>
            </div>
          ))}
          <button onClick={onClose} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer', marginTop: 4 }}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   MODAL PERIODO ASSENZA con selezione da calendario
   ============================================================ */
function AbsencePeriodModal({ onClose, onSaved, currentDate, view, getEventsForDay, getWeekDays, absences }) {
  const { profile } = useAuth()
  const [mode, setMode] = useState('form') // 'form' | 'select'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Selezione da calendario
  const [selectedDays, setSelectedDays] = useState(new Set()) // dateStr
  const [selectedEvents, setSelectedEvents] = useState(new Set()) // `${ev.id}_${ev.dateStr}`
  const [calView, setCalView] = useState(view)
  const [calDate, setCalDate] = useState(currentDate)

  // Pre-carica assenze esistenti nella selezione
  useEffect(() => {
    if (mode !== 'select') return
    const preDays = new Set()
    const preEvents = new Set()
    ;(absences || []).forEach(a => {
      if (a.absence_type === 'period') {
        // Espandi il periodo in giorni singoli nel range visibile
        const [fy, fm, fd] = a.date_from.split('-').map(Number)
        const [ty, tm, td] = a.date_to.split('-').map(Number)
        let cur = new Date(fy, fm-1, fd)
        const end = new Date(ty, tm-1, td)
        while (cur <= end) {
          const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
          preDays.add(ds)
          cur.setDate(cur.getDate() + 1)
        }
      } else if (a.absence_type === 'event' && a.event_id && a.instance_date) {
        preEvents.add(`${a.event_id}_${a.instance_date}`)
      }
    })
    setSelectedDays(preDays)
    setSelectedEvents(preEvents)
  }, [mode, absences])

  function toggleDay(dateStr) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr)
      return next
    })
  }

  function toggleEvent(ev) {
    const key = `${ev.id}_${ev.dateStr}`
    setSelectedEvents(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function confirmSelection() {
    if (selectedDays.size === 0 && selectedEvents.size === 0) {
      setError('Seleziona almeno un giorno o un evento.')
      return
    }
    setSaving(true)

    // Calcola cosa era selezionato prima (dalle assenze esistenti)
    const prevDays = new Set()
    const prevEvents = new Set()
    ;(absences || []).forEach(a => {
      if (a.absence_type === 'period') {
        const [fy, fm, fd] = a.date_from.split('-').map(Number)
        const [ty, tm, td] = a.date_to.split('-').map(Number)
        let cur = new Date(fy, fm-1, fd)
        const end = new Date(ty, tm-1, td)
        while (cur <= end) {
          const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
          prevDays.add(ds)
          cur.setDate(cur.getDate() + 1)
        }
      } else if (a.absence_type === 'event' && a.event_id && a.instance_date) {
        prevEvents.add(`${a.event_id}_${a.instance_date}`)
      }
    })

    // Elimina assenze deselezionate
    for (const a of (absences || [])) {
      if (a.absence_type === 'period') {
        // Elimina se tutti i giorni del periodo sono stati deselezionati
        const [fy, fm, fd] = a.date_from.split('-').map(Number)
        const [ty, tm, td] = a.date_to.split('-').map(Number)
        let cur = new Date(fy, fm-1, fd)
        const end = new Date(ty, tm-1, td)
        let allDeselected = true
        while (cur <= end) {
          const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
          if (selectedDays.has(ds)) { allDeselected = false; break }
          cur.setDate(cur.getDate() + 1)
        }
        if (allDeselected) await supabase.from('absences').delete().eq('id', a.id)
      } else if (a.absence_type === 'event') {
        const key = `${a.event_id}_${a.instance_date}`
        if (!selectedEvents.has(key)) await supabase.from('absences').delete().eq('id', a.id)
      }
    }

    // Inserisci solo i giorni nuovi
    for (const dateStr of selectedDays) {
      if (!prevDays.has(dateStr)) {
        await supabase.from('absences').insert({
          coach_id: profile.id,
          date_from: dateStr, date_to: dateStr,
          absence_type: 'period', note: note.trim() || null,
        })
      }
    }

    // Inserisci solo gli eventi nuovi
    for (const key of selectedEvents) {
      if (!prevEvents.has(key)) {
        const [evId, dateStr] = key.split('_')
        await supabase.from('absences').insert({
          coach_id: profile.id,
          date_from: dateStr, date_to: dateStr,
          event_id: parseInt(evId),
          instance_date: dateStr,
          absence_type: 'event', note: note.trim() || null,
        })
      }
    }

    setSaving(false)
    onSaved()
  }

  async function save() {
    if (!dateFrom || !dateTo) { setError('Seleziona entrambe le date.'); return }
    if (dateTo < dateFrom) { setError('La data di fine deve essere dopo quella di inizio.'); return }
    setError(''); setSaving(true)

    const { data: conflictingAtt } = await supabase
      .from('attendances_new')
      .select('id, instance:event_instances(instance_date), school_class:school_class_instances(instance_date)')
      .eq('coach_id', profile.id)

    const conflicting = (conflictingAtt || []).filter(a => {
      const ds = a.instance?.instance_date || a.school_class?.instance_date
      return ds && ds >= dateFrom && ds <= dateTo
    })

    if (conflicting.length > 0) {
      const ok = window.confirm(`Hai ${conflicting.length} presenza/e in questo periodo. Vuoi annullarle e procedere?`)
      if (!ok) { setSaving(false); return }
      for (const att of conflicting) await supabase.from('attendances_new').delete().eq('id', att.id)
    }

    await supabase.from('absences').insert({
      coach_id: profile.id, date_from: dateFrom, date_to: dateTo,
      absence_type: 'period', note: note.trim() || null,
    })
    setSaving(false); onSaved()
  }

  const todayStr = format(TODAY, 'yyyy-MM-dd')

  if (mode === 'select') {
    const days = calView === 'week' ? getWeekDays(calDate) : (() => {
      const y = calDate.getFullYear(), m = calDate.getMonth()
      const first = new Date(y, m, 1)
      const fd = getDay(first) === 0 ? 7 : getDay(first)
      const start = new Date(first); start.setDate(start.getDate() - (fd - 1))
      return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
    })()

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ background: '#b91c1c', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>🚫 Seleziona giorni/eventi</div>
          <button onClick={() => setMode('form')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Navigazione */}
        <div style={{ background: '#fff', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setCalDate(d => calView === 'week' ? addDays(startOfWeek(d, { weekStartsOn: 1 }), -7) : addMonths(d, -1))}>↑</button>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {calView === 'week'
                ? `${format(getWeekDays(calDate)[0], 'd MMM', { locale: it })} – ${format(getWeekDays(calDate)[6], 'd MMM yyyy', { locale: it })}`
                : format(calDate, 'MMMM yyyy', { locale: it })
              }
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setCalDate(d => calView === 'week' ? addDays(startOfWeek(d, { weekStartsOn: 1 }), 7) : addMonths(d, 1))}>↓</button>
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#f0f0ee', borderRadius: 8, padding: 3 }}>
            {['week', 'month'].map(v => (
              <button key={v} onClick={() => setCalView(v)} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', background: calView === v ? '#fff' : 'transparent', fontWeight: calView === v ? 600 : 400, color: calView === v ? '#1a1a1a' : '#888', border: calView === v ? '1px solid #e5e5e5' : 'none' }}>
                {v === 'week' ? 'Sett.' : 'Mese'}
              </button>
            ))}
          </div>
        </div>

        {/* Istruzioni */}
        <div style={{ background: '#fef3c7', padding: '6px 12px', fontSize: 11, color: '#92400e', flexShrink: 0 }}>
          Tocca un giorno per segnare assenza tutto il giorno · Tocca un evento per assenza solo su quell'attività
        </div>

        {/* Calendario selezionabile */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#f5f5f4', padding: 8 }}>
          {calView === 'week' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {getWeekDays(calDate).map((d, di) => {
                const dateStr = formatDateLocal(d)
                const isPast = isBefore(startOfDay(d), startOfDay(TODAY))
                const isDaySelected = selectedDays.has(dateStr)
                const evs = getEventsForDay(d)
                return (
                  <div key={di} style={{ display: 'flex', border: isDaySelected ? '2px solid #b91c1c' : '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', opacity: isPast ? 0.5 : 1 }}>
                    {/* Giorno cliccabile */}
                    <div
                      onClick={() => !isPast && toggleDay(dateStr)}
                      style={{ width: 60, minWidth: 60, background: isDaySelected ? '#b91c1c' : '#f8f8f7', padding: '8px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: isPast ? 'default' : 'pointer', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: isDaySelected ? 'rgba(255,255,255,0.7)' : '#aaa' }}>{format(d, 'EEE', { locale: it }).toUpperCase()}</div>
                      <div style={{ fontSize: 20, fontWeight: 500, color: isDaySelected ? '#fff' : '#1a1a1a' }}>{format(d, 'd')}</div>
                      <div style={{ fontSize: 10, color: isDaySelected ? 'rgba(255,255,255,0.5)' : '#ccc' }}>{format(d, 'MMM', { locale: it })}</div>
                    </div>
                    {/* Eventi */}
                    <div style={{ flex: 1, padding: '6px', background: isDaySelected ? '#fff9f9' : '#fff', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {evs.length === 0
                        ? <span style={{ fontSize: 11, color: '#ddd', alignSelf: 'center', marginTop: 8 }}>Nessun evento</span>
                        : evs.map(ev => {
                          const key = `${ev.id}_${ev.dateStr}`
                          const isEvSel = selectedEvents.has(key)
                          return (
                            <div key={key} onClick={() => !isPast && toggleEvent(ev)}
                              style={{ borderRadius: 6, padding: '4px 8px', cursor: isPast ? 'default' : 'pointer', background: isEvSel ? '#fcd5d5' : '#f0f0ee', borderLeft: `3px solid ${isEvSel ? '#b91c1c' : '#ccc'}`, fontSize: 11, fontWeight: 500, color: isEvSel ? '#b91c1c' : '#555' }}>
                              {ev.title}{ev.eventType === 'school' ? ' ★' : ''}
                              {isEvSel && <span style={{ marginLeft: 6, fontSize: 10 }}>🚫</span>}
                            </div>
                          )
                        })
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Vista mensile selezionabile */
            <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {['L','M','M','G','V','S','D'].map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '4px 2px', fontSize: 10, color: '#888', background: '#f8f8f7', borderBottom: '1px solid #e5e5e5' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {days.map((d, i) => {
                  const dateStr = formatDateLocal(d)
                  const isPast = isBefore(startOfDay(d), startOfDay(TODAY))
                  const isThisMonth = d.getMonth() === calDate.getMonth()
                  const isDaySelected = selectedDays.has(dateStr)
                  const evs = getEventsForDay(d)
                  const isSunday = getDay(d) === 0
                  return (
                    <div key={i} style={{ height: 70, overflow: 'hidden', padding: 2, borderRight: isSunday ? '3px solid #1a1a1a' : ((i+1) % 7 !== 0 ? '1px solid #e5e5e5' : 'none'), borderBottom: '1px solid #e5e5e5', background: isDaySelected ? '#fff5f5' : isPast ? '#fafafa' : '#fff', cursor: isPast || !isThisMonth ? 'default' : 'pointer' }}
                      onClick={() => !isPast && isThisMonth && toggleDay(dateStr)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDaySelected ? '#b91c1c' : 'transparent', color: isDaySelected ? '#fff' : isThisMonth ? (isPast ? '#ccc' : '#555') : '#ddd' }}>
                          {d.getDate()}
                        </div>
                        {isDaySelected && <span style={{ fontSize: 9, color: '#b91c1c' }}>🚫</span>}
                      </div>
                      {evs.slice(0, 2).map(ev => {
                        const key = `${ev.id}_${ev.dateStr}`
                        const isEvSel = selectedEvents.has(key)
                        return (
                          <div key={key}
                            onClick={e => { e.stopPropagation(); !isPast && toggleEvent(ev) }}
                            style={{ fontSize: 8, borderRadius: 2, padding: '1px 3px', marginBottom: 1, background: isEvSel ? '#fcd5d5' : '#f0f0ee', color: isEvSel ? '#b91c1c' : '#888', borderLeft: `2px solid ${isEvSel ? '#b91c1c' : '#ccc'}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                            {ev.title}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ background: '#fff', padding: '10px 14px', borderTop: '1px solid #e5e5e5', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            {selectedDays.size + selectedEvents.size === 0
              ? 'Nessuna selezione'
              : `${selectedDays.size} giorno/i + ${selectedEvents.size} evento/i selezionati`}
          </div>
          <div className="field" style={{ margin: '0 0 8px 0' }}>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opzionale)..." style={{ width: '100%', padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12 }} />
          </div>
          {error && <p style={{ fontSize: 11, color: '#b91c1c', marginBottom: 6 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmSelection} disabled={saving || (selectedDays.size + selectedEvents.size === 0)}
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: (selectedDays.size + selectedEvents.size > 0) ? '#b91c1c' : '#e5e5e5', color: (selectedDays.size + selectedEvents.size > 0) ? '#fff' : '#aaa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Salvataggio...' : '🚫 Conferma selezione'}
            </button>
            <button onClick={() => setMode('form')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer' }}>
              Indietro
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Modalità form
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <div className="modal-head" style={{ background: '#b91c1c' }}>
          <div className="modal-title">🚫 Dichiara periodo di assenza</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', marginBottom: 12, lineHeight: 1.5 }}>
            ℹ️ Usa questa funzione solo per giorni in cui <strong>non sei disponibile completamente</strong>.
          </div>

          {/* Bottone segna da calendario */}
          <button onClick={() => setMode('select')}
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #fecaca', background: '#fff5f5', color: '#b91c1c', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
            📅 Segna dal calendario
          </button>

          <div style={{ fontSize: 12, color: '#888', marginBottom: 10, textAlign: 'center' }}>oppure inserisci un periodo</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Dal</label>
              <input type="date" value={dateFrom} min={todayStr} onChange={e => { setDateFrom(e.target.value); setError('') }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Al</label>
              <input type="date" value={dateTo} min={dateFrom || todayStr} onChange={e => { setDateTo(e.target.value); setError('') }} />
            </div>
          </div>
          <div className="field">
            <label>Nota (opzionale)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="es. Vacanze, trasferta lavorativa..." />
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={!dateFrom || !dateTo || saving}
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: (!dateFrom || !dateTo) ? '#e5e5e5' : '#b91c1c', color: (!dateFrom || !dateTo) ? '#aaa' : '#fff', fontSize: 13, fontWeight: 600, cursor: (!dateFrom || !dateTo) ? 'default' : 'pointer' }}>
              {saving ? 'Salvataggio...' : '🚫 Conferma assenza'}
            </button>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer' }}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   CALENDAR PAGE
   ============================================================ */
export default function CalendarPage() {
  const [view, setView] = useState('week')
  const [currentDate, setCurrentDate] = useState(TODAY)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const [dayAbsenceModal, setDayAbsenceModal] = useState(null) // dateStr
  const { isAdmin } = useAuth()

  const { events, attendances, absences, loading, refetch } = useCalendarData(currentDate, view)

  function navigate(dir) {
    if (view === 'week') {
      setCurrentDate(d => {
        const todayStart = startOfDay(TODAY)
        const dStart = startOfDay(d)
        if (isSameDay(dStart, todayStart) && dir > 0) return startOfWeek(addDays(TODAY, 7), { weekStartsOn: 1 })
        const mon = startOfWeek(d, { weekStartsOn: 1 })
        return addDays(mon, dir * 7)
      })
    } else {
      setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1))
    }
  }

  function goToCurrentWeek() { setCurrentDate(TODAY) }

  function periodLabel() {
    if (view === 'month') return format(currentDate, 'MMMM yyyy', { locale: it })
    const days = getWeekDays(currentDate)
    const first = days[0], last = days[6]
    const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
    const full = `${format(first, 'd MMM', { locale: it })} – ${format(last, 'd MMM yyyy', { locale: it })}`
    const noYear = sameMonth
      ? `${format(first, 'd', { locale: it })} – ${format(last, 'd MMM', { locale: it })}`
      : `${format(first, 'd MMM', { locale: it })} – ${format(last, 'd MMM', { locale: it })}`
    return (
      <span>
        <span className="date-full">{full}</span>
        <span className="date-no-year">{noYear}</span>
        <span className="date-compact">{noYear}</span>
      </span>
    )
  }

  const getEventsForDay = useCallback((date) => {
    const dateStr = formatDateLocal(date)
    const dayEvents = (events || []).filter(ev => ev.dateStr === dateStr)
    return dayEvents.map(ev => {
      let att = []
      if (ev.eventType === 'school') {
        const classIds = new Set((ev.classBlock || []).map(cls => cls.id))
        att = attendances.filter(a => a.school_class_instance_id && classIds.has(a.school_class_instance_id))
      } else {
        att = ev.instance_id
          ? attendances.filter(a => a.instance_id === ev.instance_id && !a.school_class_instance_id)
          : []
      }

      let coverage = {}
      let covColor = 'orange'
      if (ev.eventType === 'school') {
        covColor = getSchoolCovColor(ev.classBlock, att)
      } else {
        coverage = computeCoverage(ev.slots, att)
        covColor = getCovColor(coverage)
      }

      const coachNames = att.map(a => a.coach?.full_name).filter(Boolean)
      return { ...ev, coverage, covColor, coachNames }
    }).sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  }, [events, attendances])

  if (loading) return <div className="spinner">Caricamento calendario...</div>

  const isCurrentWeek = isSameDay(startOfDay(currentDate), startOfDay(TODAY))

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>↑</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(1)}>↓</button>
          {!isCurrentWeek && view === 'week' && (
            <button className="btn btn-secondary btn-sm" onClick={goToCurrentWeek} style={{ fontSize: 11 }}>Oggi</button>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', textAlign: 'center', flex: 1, minWidth: 0 }}>
          {periodLabel()}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setShowAbsenceModal(true)} title="Dichiara periodo di assenza"
            style={{ padding: '5px 8px', fontSize: 14, borderRadius: 7, cursor: 'pointer', background: '#fff5f5', border: '1px solid #fecaca', color: '#b91c1c', lineHeight: 1 }}>
            🚫
          </button>
          <div style={{ display: 'flex', gap: 4, background: '#f0f0ee', borderRadius: 8, padding: 3 }}>
            {['week', 'month'].map(v => (
              <button key={v} onClick={() => { setView(v); if (v === 'week') setCurrentDate(TODAY) }} style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent',
                fontWeight: view === v ? 600 : 400,
                color: view === v ? '#1a1a1a' : '#888',
                border: view === v ? '1px solid #e5e5e5' : 'none',
              }}>
                {v === 'week' ? 'Sett.' : 'Mese'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'week'
        ? <WeekView currentDate={currentDate} getEventsForDay={getEventsForDay}
            onEventClick={setSelectedEvent} getWeekDays={getWeekDays}
            attendances={attendances} isAdmin={isAdmin} absences={absences}
            onDayAbsenceClick={dateStr => setDayAbsenceModal(dateStr)} />
        : <MonthView currentDate={currentDate} getEventsForDay={getEventsForDay}
            onEventClick={setSelectedEvent} isAdmin={isAdmin} absences={absences}
            onDayAbsenceClick={dateStr => setDayAbsenceModal(dateStr)} />
      }

      <div className="cal-legend" style={{ marginTop: 12 }}>
        <div className="leg-item"><div className="leg-dot green" /> Copertura soddisfatta</div>
        <div className="leg-item"><div className="leg-dot orange" /> Al limite</div>
        <div className="leg-item"><div className="leg-dot red" /> Insufficiente</div>
        <div className="leg-item"><div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ccc' }} /> Passato</div>
        <div className="leg-item"><div style={{ width: 14, height: 4, borderRadius: 2, background: '#b91c1c' }} /> Tua assenza</div>
        <div className="leg-item"><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2e7d4f' }} /> Tua presenza</div>
        <div className="leg-item"><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#b91c1c' }} /> Tua assenza evento</div>
      </div>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          attendances={
            selectedEvent.eventType === 'school'
              ? (() => {
                  const classIds = new Set((selectedEvent.allClassesForDate || selectedEvent.classBlock || []).map(c => c.id))
                  return attendances.filter(a => a.school_class_instance_id && classIds.has(a.school_class_instance_id))
                })()
              : attendances.filter(a => a.instance_id === selectedEvent.instance_id && !a.school_class_instance_id)
          }
          onClose={() => setSelectedEvent(null)}
          onRefetch={() => refetch()}
          onDelete={() => { refetch(); setSelectedEvent(null) }}
        />
      )}

      {showAbsenceModal && (
        <AbsencePeriodModal
          onClose={() => setShowAbsenceModal(false)}
          onSaved={() => { setShowAbsenceModal(false); refetch() }}
          currentDate={currentDate}
          view={view}
          getEventsForDay={getEventsForDay}
          getWeekDays={getWeekDays}
          absences={absences}
        />
      )}

      {dayAbsenceModal && (
        <DayAbsenceModal
          dateStr={dayAbsenceModal}
          absences={absences}
          onClose={() => setDayAbsenceModal(null)}
          onRefetch={() => { refetch(); setDayAbsenceModal(null) }}
        />
      )}
    </div>
  )
}

/* ============================================================
   WEEK VIEW
   ============================================================ */
function WeekView({ currentDate, getEventsForDay, onEventClick, getWeekDays, attendances, isAdmin, absences, onDayAbsenceClick }) {
  const navigate = useNavigate()
  const days = getWeekDays(currentDate)
  const todayStart = startOfDay(TODAY)

  const grouped = []
  let currentGroup = []
  days.forEach((d, i) => {
    currentGroup.push(d)
    const isLastDay = i === days.length - 1
    const isSunday = getDay(d) === 0
    if (isSunday || isLastDay) { grouped.push([...currentGroup]); currentGroup = [] }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {grouped.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
              <div style={{ flex: 1, height: 2, background: '#1a1a1a', borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>settimana successiva</span>
              <div style={{ flex: 1, height: 2, background: '#1a1a1a', borderRadius: 1 }} />
            </div>
          )}
          {group.map((d, di) => {
            const isToday = isSameDay(d, TODAY)
            const isPast = isBefore(startOfDay(d), todayStart)
            const evs = getEventsForDay(d)
            const dayName = format(d, 'EEE', { locale: it }).toUpperCase()
            const dayNum = format(d, 'd')
            const monthName = format(d, 'MMM', { locale: it })
            const dateStr = formatDateLocal(d)
            const isAbsent = isDateAbsent(absences, dateStr)

            return (
              <div key={di} style={{
                display: 'flex',
                border: isToday ? '2px solid var(--color-primary)' : '1px solid #e5e5e5',
                borderLeft: isAbsent ? '4px solid #b91c1c' : isToday ? '2px solid var(--color-primary)' : '1px solid #e5e5e5',
                borderRadius: 10, overflow: 'hidden', marginBottom: 4,
                opacity: isPast ? 0.65 : 1,
              }}>
                {/* Colonna giorno — cliccabile se assente */}
                <div
                  onClick={() => isAbsent && !isPast && onDayAbsenceClick(dateStr)}
                  style={{
                    width: 45, minWidth: 45,
                    background: isAbsent ? '#fff0f0' : isToday ? 'var(--color-primary)' : isPast ? '#f5f5f4' : '#f8f8f7',
                    padding: '8px 6px',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    flexShrink: 0,
                    cursor: isAbsent && !isPast ? 'pointer' : 'default',
                  }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', color: isToday ? 'rgba(255,255,255,0.65)' : '#aaa' }}>{dayName}</div>
                  <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.1, color: isAbsent ? '#b91c1c' : isToday ? '#fff' : isPast ? '#bbb' : '#1a1a1a' }}>{dayNum}</div>
                  <div style={{ fontSize: 10, color: isToday ? 'rgba(255,255,255,0.5)' : '#ccc' }}>{monthName}</div>
                  {/* Dot assenza giorno
                  {isAbsent && <div style={{ marginTop: 3, fontSize: 10, textAlign: 'center' }}>🚫</div>} */}
                </div>

                {/* Area eventi */}
                <div style={{
                  flex: 1, padding: evs.length > 0 ? '6px 6px' : '0 6px',
                  background: isAbsent ? '#fff9f9' : '#fff',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  justifyContent: evs.length === 0 ? 'center' : 'flex-start',
                  minHeight: 52,
                }}>
                  {evs.length === 0
                    ? <span style={{ fontSize: 11, color: '#ddd' }}>{isAbsent ? '' : 'Nessun evento'}</span>
                    : evs.map(ev => {
                      const color = ev.covColor || getCovColor(ev.coverage)
                      const c = covColors(color, isPast)
                      const myStatus = ev.myStatus // 'present' | 'absent' | null

                      return (
                        <div key={`${ev.id}-${ev.instance_id}-${ev.blockIdx ?? 'x'}`}
                          onClick={() => onEventClick(ev)}
                          style={{ borderRadius: 6, padding: '5px 6px', cursor: 'pointer', borderLeft: `3px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, position: 'relative' }}>

                          {/* Dot myStatus */}
                          {myStatus && (
                            <div style={{
                              position: 'absolute', top: 10, right: 50,
                              width: 7, height: 7, borderRadius: '50%',
                              background: myStatus === 'present' ? '#2e7d4f' : '#b91c1c',
                              flexShrink: 0,
                            }} />
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            {ev.eventType === 'school' && ev.classBlock?.length > 0 ? (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: isPast ? '#999' : '#1a1a1a', marginBottom: 2 }}>{ev.title} ★</div>
                                {ev.classBlock.map(cls => {
                                  const clsAtt = attendances.filter(a => a.school_class_instance_id === cls.id)
                                  const coaches = clsAtt.map(a => a.coach?.full_name).filter(Boolean)
                                  return (
                                    <div key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 1 }}>
                                      <span style={{ fontWeight: 600, color: isPast ? '#aaa' : '#1a1a1a', minWidth: 24 }}>{cls.grade}ª{cls.section}</span>
                                      <span style={{ color: coaches.length === 0 ? '#f59e0b' : c.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {coaches.length === 0 ? '⚠ nessuno' : coaches.join(', ')}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: isPast ? '#999' : '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: myStatus ? 12 : 0 }}>
                                  {ev.title}{ev.eventType !== 'training' && ev.eventType !== 'school' ? ' ★' : ''}
                                </div>
                                {ev.coachNames?.length > 0 && (
                                  <div style={{ fontSize: 10, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.coachNames.join(', ')}</div>
                                )}
                                {ev.coachNames?.length === 0 && !isPast && (
                                  <div style={{ fontSize: 10, color: '#bbb' }}>Nessuna presenza</div>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: isPast ? '#bbb' : '#888', flexShrink: 0, textAlign: 'right' }}>
                            {ev.start_time?.slice(0, 5)}
                            {ev.end_time && <><br /><span style={{ fontSize: 10 }}>→ {ev.end_time?.slice(0, 5)}</span></>}
                          </div>
                        </div>
                      )
                    })
                  }
                </div>

                {isAdmin && (
                  <div onClick={() => navigate(`/admin?date=${dateStr}&new=true`)}
                    style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderLeft: '1px solid #f0f0f0', cursor: 'pointer', color: '#ddd', fontSize: 20, fontWeight: 300, flexShrink: 0, transition: 'all 0.15s', userSelect: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.background = '#f8f8f7' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#ddd'; e.currentTarget.style.background = '#fff' }}>
                    +
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ============================================================
   MONTH VIEW
   ============================================================ */
const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MAX_EVENTS_SHOWN = 3

function MonthView({ currentDate, getEventsForDay, onEventClick, isAdmin, absences, onDayAbsenceClick }) {
  const navigate = useNavigate()
  const y = currentDate.getFullYear(), m = currentDate.getMonth()
  const first = new Date(y, m, 1)
  const fd = getDay(first) === 0 ? 7 : getDay(first)
  const start = new Date(first); start.setDate(start.getDate() - (fd - 1))
  const todayStart = startOfDay(TODAY)

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d
  })

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: 'center', padding: '6px 2px', fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f8f8f7', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #e5e5e5' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {cells.map((d, i) => {
          const isThisMonth = d.getMonth() === m
          const isToday = isSameDay(d, TODAY)
          const isPast = isBefore(startOfDay(d), todayStart)
          const evs = getEventsForDay(d)
          const isSunday = getDay(d) === 0
          const dateStr = formatDateLocal(d)
          const shown = evs.slice(0, MAX_EVENTS_SHOWN)
          const hidden = evs.length - MAX_EVENTS_SHOWN
          const isAbsent = isDateAbsent(absences, dateStr)

          return (
            <div key={i} style={{
              height: 90, overflow: 'hidden', padding: 0,
              borderRight: isSunday ? '3px solid #1a1a1a' : ((i + 1) % 7 !== 0 ? '1px solid #e5e5e5' : 'none'),
              borderBottom: '1px solid #e5e5e5',
              background: isPast ? '#fafafa' : isAbsent ? '#fff9f9' : '#fff',
              position: 'relative',
            }}>
              {/* Barra rossa assenza + cliccabile */}
              {isAbsent && (
                <div
                  onClick={() => !isPast && onDayAbsenceClick(dateStr)}
                  style={{ height: 3, background: '#b91c1c', width: '100%', cursor: isPast ? 'default' : 'pointer' }} />
              )}

              <div style={{ padding: '2px 3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 500, width: 20, height: 20, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: isToday ? 'var(--color-primary)' : 'transparent',
                    color: isToday ? '#fff' : isThisMonth ? (isPast ? '#ccc' : '#555') : '#ddd',
                  }}>{d.getDate()}</div>
                  {isAdmin && !isPast && (
                    <div onClick={e => { e.stopPropagation(); navigate(`/admin?date=${dateStr}&new=true`) }}
                      style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, cursor: 'pointer', color: '#ccc', fontWeight: 400, flexShrink: 0, transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.background = '#f0f0ee' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.background = 'transparent' }}
                      title="Aggiungi evento">+</div>
                  )}
                </div>

                {shown.map(ev => {
                  const color = ev.covColor || getCovColor(ev.coverage)
                  const c = covColors(color, isPast)
                  const myStatus = ev.myStatus
                  return (
                    <div key={`${ev.id}-${ev.instance_id}-${ev.blockIdx ?? 'x'}`}
                      onClick={() => onEventClick(ev)}
                      style={{ fontSize: 9, fontWeight: 500, borderRadius: 3, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', background: c.bg, color: c.text, borderLeft: `2px solid ${c.border}`, opacity: isPast ? 0.7 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
                      {/* Dot myStatus */}
                      {myStatus && (
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: myStatus === 'present' ? '#2e7d4f' : '#b91c1c', flexShrink: 0 }} />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.title}{ev.eventType !== 'training' && ev.eventType !== 'school' ? ' ★' : ''}
                        {ev.eventType === 'school' && ev.classBlock?.length > 0 && (
                          <span style={{ fontWeight: 400, opacity: 0.8 }}>{' '}{ev.classBlock.map(c => `${c.grade}${c.section}`).join('·')}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
                {hidden > 0 && <div style={{ fontSize: 9, color: '#888', fontWeight: 500, padding: '1px 4px' }}>+{hidden} altri</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}