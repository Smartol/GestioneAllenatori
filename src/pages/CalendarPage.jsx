import { useState } from 'react'
import { addDays, addMonths, subMonths, format, isSameDay, getDay, startOfWeek, isBefore, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { useCalendarData, computeCoverage, getCovColor } from '../hooks/useCalendarData'
import EventModal from '../components/EventModal'

const TODAY = new Date()

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function CalendarPage() {
  const [view, setView] = useState('week')
  const [currentDate, setCurrentDate] = useState(TODAY)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const { trainings, activities, attendances, overrides, exceptions, loading, refetch } = useCalendarData(currentDate, view)

  function navigate(dir) {
    if (view === 'week') setCurrentDate(d => addDays(d, dir * 7))
    else setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1))
  }

  function periodLabel() {
    if (view === 'week') {
      const end = addDays(currentDate, 6)
      return `${format(currentDate, 'd MMM', { locale: it })} – ${format(end, 'd MMM yyyy', { locale: it })}`
    }
    return format(currentDate, 'MMMM yyyy', { locale: it })
  }

  function isException(trainingId, dateStr) {
    return exceptions.some(e => e.training_id === trainingId && e.instance_date === dateStr)
  }

  function isInRange(training, dateStr) {
    if (training.start_date && dateStr < training.start_date) return false
    if (training.end_date && dateStr > training.end_date) return false
    return true
  }

  function getEventsForDay(date) {
    const dow = getDay(date) === 0 ? 7 : getDay(date)
    const dateStr = format(date, 'yyyy-MM-dd')
    const result = []

    trainings.forEach(t => {
      if (t.day_of_week !== dow) return
      if (!isInRange(t, dateStr)) return
      if (isException(t.id, dateStr)) return
      const override = overrides.find(o => o.training_id === t.id && o.instance_date === dateStr)
      const slots = override ? override.instance_override_categories : t.recurring_training_categories
      const att = attendances.filter(a => a.training_id === t.id && a.instance_date === dateStr)
      const coverage = computeCoverage(slots, att)
      const coachNames = att.map(a => a.coach?.full_name).filter(Boolean)
      result.push({ ...t, eventType: 'training', date, dateStr, slots, coverage, override, coachNames })
    })

    activities.forEach(act => {
      if (isSameDay(new Date(act.date + 'T00:00:00'), date)) {
        const att = attendances.filter(a => a.activity_id === act.id)
        const coverage = computeCoverage(act.activity_categories, att)
        const coachNames = att.map(a => a.coach?.full_name).filter(Boolean)
        result.push({ ...act, eventType: 'activity', date, dateStr: act.date, slots: act.activity_categories, coverage, coachNames })
      }
    })

    result.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    return result
  }

  if (loading) return <div className="spinner">Caricamento calendario...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
            {view === 'week' ? '↑' : '‹'}
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 160, textAlign: 'center' }}>{periodLabel()}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(1)}>
            {view === 'week' ? '↓' : '›'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#f0f0ee', borderRadius: 8, padding: 3 }}>
          {['week', 'month'].map(v => (
            <button key={v} onClick={() => { setView(v); setCurrentDate(TODAY) }} style={{
              padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              background: view === v ? '#fff' : 'transparent',
              fontWeight: view === v ? 600 : 400,
              color: view === v ? '#1a1a1a' : '#888',
              border: view === v ? '1px solid #e5e5e5' : 'none',
            }}>
              {v === 'week' ? 'Settimana' : 'Mese'}
            </button>
          ))}
        </div>
      </div>

      {view === 'week'
        ? <WeekView startDate={currentDate} getEventsForDay={getEventsForDay} onEventClick={setSelectedEvent} />
        : <MonthView currentDate={currentDate} getEventsForDay={getEventsForDay} onEventClick={setSelectedEvent} />
      }

      <div className="cal-legend" style={{ marginTop: 12 }}>
        <div className="leg-item"><div className="leg-dot green" /> Copertura soddisfatta</div>
        <div className="leg-item"><div className="leg-dot orange" /> Al limite / jolly</div>
        <div className="leg-item"><div className="leg-dot red" /> Insufficiente</div>
        <div className="leg-item"><div className="leg-rect" /> Festival / Attività</div>
        <div className="leg-item"><div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ccc' }} /> Passato</div>
      </div>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          attendances={attendances.filter(a =>
            selectedEvent.eventType === 'training'
              ? a.training_id === selectedEvent.id && a.instance_date === selectedEvent.dateStr
              : a.activity_id === selectedEvent.id
          )}
          onClose={() => setSelectedEvent(null)}
          onRefetch={() => { refetch(); setSelectedEvent(null) }}
          onDelete={() => { refetch(); setSelectedEvent(null) }}
        />
      )}
    </div>
  )
}

/* ============================================================
   WEEK VIEW — verticale, oggi + 6 giorni
   ============================================================ */
function WeekView({ startDate, getEventsForDay, onEventClick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
  const todayStart = startOfDay(new Date())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {days.map((d, i) => {
        const isToday = isSameDay(d, new Date())
        const isPast = isBefore(startOfDay(d), todayStart)
        const evs = getEventsForDay(d)
        const dayLabel = format(d, 'EEEE d MMMM', { locale: it })

        return (
          <div key={i} style={{
            border: `1px solid ${isToday ? '#1a1a1a' : '#e5e5e5'}`,
            borderRadius: 12,
            overflow: 'hidden',
            opacity: isPast ? 0.6 : 1,
          }}>
            {/* Header giorno */}
            <div style={{
              padding: '8px 12px',
              background: isToday ? '#1a1a1a' : isPast ? '#f5f5f4' : '#f8f8f7',
              display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: evs.length > 0 ? '1px solid #e5e5e5' : 'none',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: isToday ? '#fff' : isPast ? '#aaa' : '#1a1a1a',
                textTransform: 'capitalize',
              }}>
                {dayLabel}
              </div>
              {evs.length === 0 && (
                <span style={{ fontSize: 11, color: isToday ? 'rgba(255,255,255,0.6)' : '#ccc' }}>
                  Nessun evento
                </span>
              )}
            </div>

            {/* Eventi del giorno */}
            {evs.length > 0 && (
              <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {evs.map(ev => {
                  const color = getCovColor(ev.coverage)
                  const isActivity = ev.eventType === 'activity'
                  const borderColor = isPast ? '#bbb'
                    : isActivity ? '#6b1a2a'
                    : color === 'green' ? '#2e7d4f'
                    : color === 'orange' ? '#b8610a' : '#b91c1c'
                  const bgColor = isPast ? '#f0f0f0'
                    : isActivity ? '#f5e6e9'
                    : color === 'green' ? '#d4edda'
                    : color === 'orange' ? '#fde8c8' : '#fcd5d5'
                  const textColor = isPast ? '#999' : '#1a1a1a'

                  return (
                    <div
                      key={ev.id + ev.eventType}
                      onClick={() => onEventClick(ev)}
                      style={{
                        borderRadius: 8, padding: '7px 10px',
                        cursor: 'pointer',
                        borderLeft: `3px solid ${borderColor}`,
                        background: bgColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.title || 'Allenamento'}{isActivity ? ' ★' : ''}
                        </div>
                        {ev.coachNames?.length > 0 && (
                          <div style={{ fontSize: 11, color: isPast ? '#aaa' : '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ev.coachNames.join(', ')}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: isPast ? '#aaa' : '#888', flexShrink: 0 }}>
                        {ev.start_time?.slice(0,5)}{ev.end_time ? ` → ${ev.end_time?.slice(0,5)}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
   MONTH VIEW
   ============================================================ */
const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function MonthView({ currentDate, getEventsForDay, onEventClick }) {
  const y = currentDate.getFullYear(), m = currentDate.getMonth()
  const first = new Date(y, m, 1)
  const fd = getDay(first) === 0 ? 7 : getDay(first)
  const start = new Date(first); start.setDate(start.getDate() - (fd - 1))
  const todayStart = startOfDay(new Date())

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d
  })

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', padding: '6px 2px', fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f8f8f7', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #e5e5e5' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const isThisMonth = d.getMonth() === m
          const isToday = isSameDay(d, new Date())
          const isPast = isBefore(startOfDay(d), todayStart)
          const evs = getEventsForDay(d)
          return (
            <div key={i} style={{
              minHeight: 72, padding: 3,
              borderRight: (i + 1) % 7 !== 0 ? '1px solid #e5e5e5' : 'none',
              borderBottom: '1px solid #e5e5e5',
              background: isPast ? '#fafafa' : '#fff',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2,
                background: isToday ? '#1a1a1a' : 'transparent',
                color: isToday ? '#fff' : isThisMonth ? (isPast ? '#bbb' : '#555') : '#ddd',
              }}>{d.getDate()}</div>
              {evs.map(ev => {
                const color = getCovColor(ev.coverage)
                const isActivity = ev.eventType === 'activity'
                const bg = isPast ? '#ebebeb'
                  : isActivity ? '#f5e6e9'
                  : color === 'green' ? '#d4edda'
                  : color === 'orange' ? '#fde8c8' : '#fcd5d5'
                const fg = isPast ? '#999'
                  : isActivity ? '#6b1a2a'
                  : color === 'green' ? '#2e7d4f'
                  : color === 'orange' ? '#b8610a' : '#b91c1c'
                const border = isPast ? '#ccc'
                  : isActivity ? '#6b1a2a'
                  : color === 'green' ? '#2e7d4f'
                  : color === 'orange' ? '#b8610a' : '#b91c1c'
                return (
                  <div key={ev.id + ev.eventType}
                    style={{
                      fontSize: 9, fontWeight: 500, borderRadius: 3, padding: '2px 4px', marginBottom: 2,
                      cursor: 'pointer', overflow: 'hidden',
                      background: bg, color: fg,
                      borderLeft: `2px solid ${border}`,
                      opacity: isPast ? 0.7 : 1,
                    }}
                    onClick={() => onEventClick(ev)}
                  >
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.title || 'Allenamento'}{isActivity ? ' ★' : ''}
                    </div>
                    {ev.coachNames?.length > 0 && (
                      <div style={{ fontSize: 8, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.coachNames.join(', ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
