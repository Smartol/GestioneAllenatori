import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, addMonths, subMonths, startOfWeek, format, isSameDay, getDay, isBefore, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { useCalendarData, computeCoverage, getCovColor, isDateAbsent } from '../hooks/useCalendarData'
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

/* ============================================================
   MODAL PERIODO ASSENZA
   ============================================================ */
function AbsencePeriodModal({ onClose, onSaved }) {
  const { profile } = useAuth()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!dateFrom || !dateTo) { setError('Seleziona entrambe le date.'); return }
    if (dateTo < dateFrom) { setError('La data di fine deve essere dopo quella di inizio.'); return }
    setError(''); setSaving(true)

    // Controlla conflitti con presenze esistenti nel periodo
    const { data: conflictingAtt } = await supabase
      .from('attendances_new')
      .select(`
        id,
        instance:event_instances(instance_date, event:events(title)),
        school_class:school_class_instances(instance_date, grade, section, event:events(title))
      `)
      .eq('coach_id', profile.id)

    const conflicting = (conflictingAtt || []).filter(a => {
      const dateStr = a.instance?.instance_date || a.school_class?.instance_date
      return dateStr && dateStr >= dateFrom && dateStr <= dateTo
    })

    if (conflicting.length > 0) {
      const ok = window.confirm(
        `Hai ${conflicting.length} presenza/e dichiarata/e in questo periodo. Vuoi annullarle e procedere con l'assenza?`
      )
      if (!ok) { setSaving(false); return }
      for (const att of conflicting) {
        await supabase.from('attendances_new').delete().eq('id', att.id)
      }
    }

    await supabase.from('absences').insert({
      coach_id: profile.id,
      date_from: dateFrom,
      date_to: dateTo,
      absence_type: 'period',
      note: note.trim() || null,
    })

    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <div className="modal-head" style={{ background: '#b91c1c' }}>
          <div className="modal-title">🚫 Dichiara periodo di assenza</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', marginBottom: 16, lineHeight: 1.5 }}>
            ℹ️ Usa questa funzione solo per giorni in cui <strong>non sei disponibile completamente</strong>. Per assenze su singole attività, usa il bottone 🚫 direttamente sull'evento.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Dal</label>
              <input type="date" value={dateFrom}
                min={format(TODAY, 'yyyy-MM-dd')}
                onChange={e => { setDateFrom(e.target.value); setError('') }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Al</label>
              <input type="date" value={dateTo}
                min={dateFrom || format(TODAY, 'yyyy-MM-dd')}
                onChange={e => { setDateTo(e.target.value); setError('') }} />
            </div>
          </div>
          <div className="field">
            <label>Nota (opzionale)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="es. Vacanze, trasferta lavorativa..." />
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save} disabled={!dateFrom || !dateTo || saving}
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
  const { isAdmin } = useAuth()

  const { events, attendances, absences, loading, refetch } = useCalendarData(currentDate, view)

  function navigate(dir) {
    if (view === 'week') {
      setCurrentDate(d => {
        const todayStart = startOfDay(TODAY)
        const dStart = startOfDay(d)
        if (isSameDay(dStart, todayStart) && dir > 0) {
          return startOfWeek(addDays(TODAY, 7), { weekStartsOn: 1 })
        }
        const mon = startOfWeek(d, { weekStartsOn: 1 })
        return addDays(mon, dir * 7)
      })
    } else {
      setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1))
    }
  }

  function goToCurrentWeek() { setCurrentDate(TODAY) }

  function periodLabel() {
    if (view === 'month') {
      return format(currentDate, 'MMMM yyyy', { locale: it })
    }
    const days = getWeekDays(currentDate)
    const first = days[0], last = days[6]
    const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()

    const full = `${format(first, 'd MMM', { locale: it })} – ${format(last, 'd MMM yyyy', { locale: it })}`
    const noYear = sameMonth
      ? `${format(first, 'd', { locale: it })} – ${format(last, 'd MMM', { locale: it })}`
      : `${format(first, 'd MMM', { locale: it })} – ${format(last, 'd MMM', { locale: it })}`
    const compact = sameMonth
      ? `${format(first, 'd', { locale: it })} – ${format(last, 'd MMM', { locale: it })}`
      : `${format(first, 'd MMM', { locale: it })} – ${format(last, 'd MMM', { locale: it })}`

    return (
      <span>
        <span className="date-full">{full}</span>
        <span className="date-no-year">{noYear}</span>
        <span className="date-compact">{compact}</span>
      </span>
    )
  }

  function getEventsForDay(date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayEvents = (events || []).filter(ev => ev.dateStr === dateStr)
    return dayEvents.map(ev => {
      let att = []
      if (ev.eventType === 'school') {
        att = attendances.filter(a => ev.classBlock?.some(cls => cls.id === a.school_class_instance_id))
      } else {
        att = attendances.filter(a => a.instance_id === ev.instance_id)
      }
      const coverage = computeCoverage(ev.slots, att)
      const coachNames = att.map(a => a.coach?.full_name).filter(Boolean)
      return { ...ev, coverage, coachNames }
    }).sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  }

  if (loading) return <div className="spinner">Caricamento calendario...</div>

  const isCurrentWeek = isSameDay(startOfDay(currentDate), startOfDay(TODAY))

  return (
    <div>
      {/* Header navigazione */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 6 }}>
  
          {/* Navigazione */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>↑</button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(1)}>↓</button>
            {!isCurrentWeek && view === 'week' && (
              <button className="btn btn-secondary btn-sm" onClick={goToCurrentWeek} style={{ fontSize: 11 }}>
                Oggi
              </button>
            )}
          </div>

          {/* Data — prende lo spazio disponibile */}
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', textAlign: 'center', flex: 1, minWidth: 0 }}>
            {periodLabel()}
          </span>

          {/* Azioni destra */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setShowAbsenceModal(true)}
              title="Dichiara periodo di assenza"
              style={{
                padding: '5px 8px', fontSize: 14, borderRadius: 7, cursor: 'pointer',
                background: '#fff5f5', border: '1px solid #fecaca',
                color: '#b91c1c', lineHeight: 1,
              }}>
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
            attendances={attendances} isAdmin={isAdmin} absences={absences} />
        : <MonthView currentDate={currentDate} getEventsForDay={getEventsForDay}
            onEventClick={setSelectedEvent} isAdmin={isAdmin} absences={absences} />
      }

      <div className="cal-legend" style={{ marginTop: 12 }}>
        <div className="leg-item"><div className="leg-dot green" /> Copertura soddisfatta</div>
        <div className="leg-item"><div className="leg-dot orange" /> Al limite / jolly</div>
        <div className="leg-item"><div className="leg-dot red" /> Insufficiente</div>
        <div className="leg-item"><div className="leg-rect" /> Festival / Attività</div>
        <div className="leg-item"><div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ccc' }} /> Passato</div>
        <div className="leg-item"><div style={{ width: 14, height: 4, borderRadius: 2, background: '#b91c1c' }} /> Tua assenza</div>
      </div>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          attendances={
            selectedEvent.eventType === 'school'
              ? attendances.filter(a =>
                  (selectedEvent.allClassesForDate || selectedEvent.classBlock || [])
                    .some(cls => a.school_class_instance_id === cls.id) || a.is_jolly
                )
              : attendances.filter(a => a.instance_id === selectedEvent.instance_id)
          }
          onClose={() => setSelectedEvent(null)}
          onRefetch={() => { refetch() }}
          onDelete={() => { refetch(); setSelectedEvent(null) }}
        />
      )}

      {showAbsenceModal && (
        <AbsencePeriodModal
          onClose={() => setShowAbsenceModal(false)}
          onSaved={() => { setShowAbsenceModal(false); refetch() }}
        />
      )}
    </div>
  )
}

/* ============================================================
   WEEK VIEW
   ============================================================ */
function WeekView({ currentDate, getEventsForDay, onEventClick, getWeekDays, attendances, isAdmin, absences }) {
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
            const dateStr = format(d, 'yyyy-MM-dd')
            const isAbsent = isDateAbsent(absences, dateStr)

            return (
              <div key={di} style={{
                display: 'flex',
                border: isToday ? '2px solid var(--color-primary)' : '1px solid #e5e5e5',
                borderRadius: 10, overflow: 'hidden', marginBottom: 4,
                opacity: isPast ? 0.65 : 1,
                // Barra rossa sinistra se assente
                borderLeft: isAbsent ? '4px solid #b91c1c' : isToday ? '2px solid var(--color-primary)' : '1px solid #e5e5e5',
              }}>
                {/* Colonna giorno */}
                <div style={{
                  width: 72, minWidth: 72,
                  background: isToday ? 'var(--color-primary)' : isPast ? '#f5f5f4' : '#f8f8f7',
                  padding: '8px 10px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', color: isToday ? 'rgba(255,255,255,0.65)' : '#aaa' }}>{dayName}</div>
                  <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.1, color: isToday ? '#fff' : isPast ? '#bbb' : '#1a1a1a' }}>{dayNum}</div>
                  <div style={{ fontSize: 10, color: isToday ? 'rgba(255,255,255,0.5)' : '#ccc' }}>{monthName}</div>
                  {/* {isToday && <div style={{ marginTop: 4, fontSize: 9, background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 4, padding: '1px 4px', textAlign: 'center' }}>oggi</div>} */}

                </div>

                {/* Area eventi */}
                <div style={{
                  flex: 1, padding: evs.length > 0 ? '6px 8px' : '0 8px',
                  background: isAbsent ? '#fff9f9' : '#fff',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  justifyContent: evs.length === 0 ? 'center' : 'flex-start',
                  minHeight: 52,
                }}>
                  {evs.length === 0
                    ? <span style={{ fontSize: 11, color: '#ddd' }}>{isAbsent ? '' : 'Nessun evento'}</span>
                    : evs.map(ev => {
                      const color = getCovColor(ev.coverage)
                      const isActivity = ev.eventType !== 'training'
                      const borderColor = isPast ? '#ccc' : isActivity ? '#6b1a2a' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c'
                      const bgColor = isPast ? '#f0f0f0' : isActivity ? '#f5e6e9' : color === 'green' ? '#d4edda' : color === 'orange' ? '#fde8c8' : '#fcd5d5'
                      const coachColor = isPast ? '#aaa' : isActivity ? '#6b1a2a' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c'
                      return (
                        <div key={`${ev.id}-${ev.instance_id}-${ev.blockIdx ?? 'x'}`}
                          onClick={() => onEventClick(ev)}
                          style={{ borderRadius: 6, padding: '5px 8px', cursor: 'pointer', borderLeft: `3px solid ${borderColor}`, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
                                      <span style={{ color: coaches.length === 0 ? '#f59e0b' : coachColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{coaches.length === 0 ? '⚠ nessuno' : coaches.join(', ')}</span>
                                      <span style={{ color: '#aaa', flexShrink: 0 }}>{cls.start_time?.slice(0, 5)}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: isPast ? '#999' : '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}{isActivity ? ' ★' : ''}</div>
                                {ev.coachNames?.length > 0 && <div style={{ fontSize: 10, color: coachColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.coachNames.join(', ')}</div>}
                                {ev.coachNames?.length === 0 && !isPast && <div style={{ fontSize: 10, color: '#bbb' }}>Nessuna presenza</div>}
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

                {/* Bottone + admin */}
                {isAdmin && (
                  <div onClick={() => navigate(`/admin?date=${dateStr}&new=true`)}
                    style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderLeft: '1px solid #f0f0f0', cursor: 'pointer', color: '#ddd', fontSize: 20, fontWeight: 300, flexShrink: 0, transition: 'all 0.15s', userSelect: 'none' }}
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

function MonthView({ currentDate, getEventsForDay, onEventClick, isAdmin, absences }) {
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
          const dateStr = format(d, 'yyyy-MM-dd')
          const shown = evs.slice(0, MAX_EVENTS_SHOWN)
          const hidden = evs.length - MAX_EVENTS_SHOWN
          const isAbsent = isDateAbsent(absences, dateStr)

          return (
            <div key={i} style={{
              height: 90, overflow: 'hidden', padding: '0',
              borderRight: isSunday ? '3px solid #1a1a1a' : ((i + 1) % 7 !== 0 ? '1px solid #e5e5e5' : 'none'),
              borderBottom: '1px solid #e5e5e5',
              background: isPast ? '#fafafa' : isAbsent ? '#fff9f9' : '#fff',
              position: 'relative',
            }}>
              {/* Barra rossa in cima se assente */}
              {isAbsent && (
                <div style={{ height: 3, background: '#b91c1c', width: '100%' }} />
              )}

              <div style={{ padding: '2px 3px' }}>
                {/* Riga header: numero giorno + bottone + */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 500, width: 20, height: 20, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: isToday ? 'var(--color-primary)' : 'transparent',
                    color: isToday ? '#fff' : isThisMonth ? (isPast ? '#ccc' : '#555') : '#ddd',
                  }}>{d.getDate()}</div>
                  {isAdmin && !isPast && (
                    <div
                      onClick={e => { e.stopPropagation(); navigate(`/admin?date=${dateStr}&new=true`) }}
                      style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, cursor: 'pointer', color: '#ccc', fontWeight: 400, flexShrink: 0, transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary)'; e.currentTarget.style.background = '#f0f0ee' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.background = 'transparent' }}
                      title="Aggiungi evento"
                    >+</div>
                  )}
                </div>

                {/* Eventi */}
                {shown.map(ev => {
                  const color = getCovColor(ev.coverage)
                  const isActivity = ev.eventType !== 'training'
                  const bg = isPast ? '#ebebeb' : isActivity ? '#f5e6e9' : color === 'green' ? '#d4edda' : color === 'orange' ? '#fde8c8' : '#fcd5d5'
                  const fg = isPast ? '#aaa' : isActivity ? '#6b1a2a' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c'
                  return (
                    <div key={`${ev.id}-${ev.instance_id}-${ev.blockIdx ?? 'x'}`}
                      onClick={() => onEventClick(ev)}
                      style={{ fontSize: 9, fontWeight: 500, borderRadius: 3, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', background: bg, color: fg, borderLeft: `2px solid ${fg}`, opacity: isPast ? 0.7 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.title}{isActivity ? ' ★' : ''}
                      {ev.eventType === 'school' && ev.classBlock?.length > 0 && (
                        <span style={{ fontWeight: 400, opacity: 0.8 }}>{' '}{ev.classBlock.map(c => `${c.grade}${c.section}`).join('·')}</span>
                      )}
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