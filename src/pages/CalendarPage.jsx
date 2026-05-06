import { useState } from 'react'
import { addWeeks, subWeeks, addMonths, subMonths, startOfWeek, format, isSameDay, getDay } from 'date-fns'
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
    if (view === 'week') setCurrentDate(d => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1))
    else setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1))
  }

  function periodLabel() {
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
      const we = new Date(ws); we.setDate(ws.getDate() + 6)
      return `${format(ws, 'd MMM', { locale: it })} – ${format(we, 'd MMM yyyy', { locale: it })}`
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

    // Ordina per orario
    result.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    return result
  }

  if (loading) return <div className="spinner">Caricamento calendario...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 160, textAlign: 'center' }}>{periodLabel()}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(1)}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#f0f0ee', borderRadius: 8, padding: 3 }}>
          {['week', 'month'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
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
        ? <WeekView currentDate={currentDate} getEventsForDay={getEventsForDay} onEventClick={setSelectedEvent} />
        : <MonthView currentDate={currentDate} getEventsForDay={getEventsForDay} onEventClick={setSelectedEvent} />
      }

      <div className="cal-legend">
        <div className="leg-item"><div className="leg-dot green" /> Copertura soddisfatta</div>
        <div className="leg-item"><div className="leg-dot orange" /> Al limite / jolly</div>
        <div className="leg-item"><div className="leg-dot red" /> Insufficiente</div>
        <div className="leg-item"><div className="leg-rect" /> Festival / Attività</div>
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

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function WeekView({ currentDate, getEventsForDay, onEventClick }) {
  const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i); return d
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', minWidth: 480 }}>
        {/* Header giorni */}
        {days.map((d, i) => {
          const isToday = isSameDay(d, new Date())
          return (
            <div key={i} style={{
              textAlign: 'center', padding: '6px 2px',
              background: '#f8f8f7',
              borderBottom: '1px solid #e5e5e5',
              borderRight: i < 6 ? '1px solid #e5e5e5' : 'none',
            }}>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{DAYS[i]}</div>
              <div style={{
                fontSize: 15, fontWeight: 500, width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0',
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : '#1a1a1a',
              }}>{d.getDate()}</div>
            </div>
          )
        })}

        {/* Celle giorni con eventi */}
        {days.map((d, di) => {
          const evs = getEventsForDay(d)
          return (
            <div key={di} style={{
              minHeight: 60,
              padding: 4,
              borderRight: di < 6 ? '1px solid #e5e5e5' : 'none',
              background: '#fff',
              verticalAlign: 'top',
            }}>
              {evs.map(ev => {
                const color = getCovColor(ev.coverage)
                const isActivity = ev.eventType === 'activity'
                return (
                  <div
                    key={ev.id + ev.eventType}
                    onClick={() => onEventClick(ev)}
                    style={{
                      borderRadius: 6,
                      padding: '4px 6px',
                      marginBottom: 4,
                      cursor: 'pointer',
                      borderLeft: `3px solid ${isActivity ? 'var(--bordeaux)' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c'}`,
                      background: isActivity
                        ? 'var(--bordeaux-light)'
                        : color === 'green' ? '#d4edda' : color === 'orange' ? '#fde8c8' : '#fcd5d5',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.title || 'Allenamento'}{isActivity ? ' ★' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: '#666' }}>
                      {ev.start_time?.slice(0,5)}{ev.end_time ? ` → ${ev.end_time?.slice(0,5)}` : ''}
                    </div>
                    {ev.coachNames?.length > 0 && (
                      <div style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

function MonthView({ currentDate, getEventsForDay, onEventClick }) {
  const y = currentDate.getFullYear(), m = currentDate.getMonth()
  const first = new Date(y, m, 1)
  const fd = getDay(first) === 0 ? 7 : getDay(first)
  const start = new Date(first); start.setDate(start.getDate() - (fd - 1))

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
          const evs = getEventsForDay(d)
          return (
            <div key={i} style={{ minHeight: 72, padding: 3, borderRight: (i + 1) % 7 !== 0 ? '1px solid #e5e5e5' : 'none', borderBottom: '1px solid #e5e5e5' }}>
              <div style={{
                fontSize: 11, fontWeight: 500, width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2,
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : isThisMonth ? '#555' : '#ccc',
              }}>{d.getDate()}</div>
              {evs.map(ev => {
                const color = getCovColor(ev.coverage)
                const isActivity = ev.eventType === 'activity'
                return (
                  <div key={ev.id + ev.eventType}
                    style={{
                      fontSize: 9, fontWeight: 500, borderRadius: 3, padding: '2px 4px', marginBottom: 2,
                      cursor: 'pointer', overflow: 'hidden',
                      background: isActivity ? 'var(--bordeaux-light)' : color === 'green' ? '#d4edda' : color === 'orange' ? '#fde8c8' : '#fcd5d5',
                      color: isActivity ? 'var(--bordeaux)' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c',
                      borderLeft: `2px solid ${isActivity ? 'var(--bordeaux)' : color === 'green' ? '#2e7d4f' : color === 'orange' ? '#b8610a' : '#b91c1c'}`,
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
