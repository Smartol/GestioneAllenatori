import { useState } from 'react'
import { addWeeks, subWeeks, addMonths, subMonths, startOfWeek, format, isSameDay, getDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { useCalendarData, computeCoverage, getCovColor } from '../hooks/useCalendarData'
import EventModal from '../components/EventModal'

const TODAY = new Date()

export default function CalendarPage() {
  const [view, setView] = useState('week')
  const [currentDate, setCurrentDate] = useState(TODAY)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const { trainings, festivals, attendances, overrides, loading, refetch } = useCalendarData(currentDate, view)

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

  function getEventsForDay(date) {
    const dow = getDay(date) === 0 ? 7 : getDay(date) // 1=Lun, 7=Dom
    const result = []

    trainings.forEach(t => {
      if (t.day_of_week === dow) {
        const dateStr = format(date, 'yyyy-MM-dd')
        const override = overrides.find(o => o.training_id === t.id && o.instance_date === dateStr)
        const cats = override
          ? override.instance_override_categories
          : t.recurring_training_categories
        const att = attendances.filter(a => a.training_id === t.id && a.instance_date === dateStr)
        const coverage = computeCoverage(cats, att)
        result.push({ ...t, eventType: 'training', date, dateStr, cats, coverage, override })
      }
    })

    festivals.forEach(f => {
      if (isSameDay(new Date(f.date), date)) {
        const att = attendances.filter(a => a.festival_id === f.id)
        const coverage = computeCoverage(f.festival_categories, att)
        result.push({ ...f, eventType: 'festival', date, dateStr: f.date, cats: f.festival_categories, coverage })
      }
    })

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
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent',
                fontWeight: view === v ? 500 : 400,
                color: view === v ? '#1a1a1a' : '#888',
                border: view === v ? '1px solid #e5e5e5' : 'none',
              }}
            >
              {v === 'week' ? 'Settimana' : 'Mese'}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {view === 'week'
        ? <WeekView currentDate={currentDate} getEventsForDay={getEventsForDay} onEventClick={setSelectedEvent} />
        : <MonthView currentDate={currentDate} getEventsForDay={getEventsForDay} onEventClick={setSelectedEvent} />
      }

      {/* Legend */}
      <div className="cal-legend">
        <div className="leg-item"><div className="leg-dot green" /> Copertura soddisfatta</div>
        <div className="leg-item"><div className="leg-dot orange" /> Al limite / jolly</div>
        <div className="leg-item"><div className="leg-dot red" /> Insufficiente</div>
        <div className="leg-item"><div className="leg-rect" /> Festival</div>
      </div>

      {/* Modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          attendances={attendances.filter(a =>
            selectedEvent.eventType === 'training'
              ? a.training_id === selectedEvent.id && a.instance_date === selectedEvent.dateStr
              : a.festival_id === selectedEvent.id
          )}
          onClose={() => setSelectedEvent(null)}
          onRefetch={() => { refetch(); setSelectedEvent(null) }}
        />
      )}
    </div>
  )
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const TIMES = ['15:00', '16:00', '17:00', '17:30', '18:00', '19:00', '20:00']

function WeekView({ currentDate, getEventsForDay, onEventClick }) {
  const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d })

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', minWidth: 480 }}>
        {/* Header */}
        <div style={{ background: '#f8f8f7', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #e5e5e5' }} />
        {days.map((d, i) => {
          const isToday = isSameDay(d, new Date())
          return (
            <div key={i} style={{ textAlign: 'center', padding: '6px 2px', background: '#f8f8f7', borderBottom: '1px solid #e5e5e5', borderRight: i < 6 ? '1px solid #e5e5e5' : 'none' }}>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{DAYS[i]}</div>
              <div style={{
                fontSize: 15, fontWeight: 500, width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0',
                background: isToday ? '#1a1a1a' : 'transparent',
                color: isToday ? '#fff' : '#1a1a1a',
              }}>{d.getDate()}</div>
            </div>
          )
        })}

        {/* Time rows */}
        {TIMES.map((time, ti) => (
          <>
            <div key={'t' + ti} style={{ fontSize: 10, color: '#bbb', textAlign: 'right', padding: '4px 4px 0 0', height: 52, borderRight: '1px solid #e5e5e5', borderBottom: '1px solid #e5e5e5', background: '#f8f8f7' }}>{time}</div>
            {days.map((d, di) => {
              const evs = getEventsForDay(d).filter(ev =>
                ev.eventType === 'training' ? ev.start_time?.startsWith(time) : ti === 1
              )
              return (
                <div key={'d' + ti + di} style={{ height: 52, position: 'relative', borderRight: di < 6 ? '1px solid #e5e5e5' : 'none', borderBottom: '1px solid #e5e5e5' }}>
                  {evs.map(ev => ev.eventType === 'training' || ti === 1 ? (
                    <div
                      key={ev.id}
                      className={`ev-block ${getCovColor(ev.coverage)}`}
                      style={{ position: 'absolute', left: 2, right: 2, top: 2 }}
                      onClick={() => onEventClick(ev)}
                    >
                      <div className="ev-title">{ev.name || ev.title || 'Allenamento'}{ev.eventType === 'festival' ? ' ★' : ''}</div>
                      <div className="ev-meta">{ev.cats?.map(c => c.category?.name).join(', ')}</div>
                    </div>
                  ) : null)}
                </div>
              )
            })}
          </>
        ))}
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
                background: isToday ? '#1a1a1a' : 'transparent',
                color: isToday ? '#fff' : isThisMonth ? '#555' : '#ccc',
              }}>{d.getDate()}</div>
              {evs.map(ev => (
                <div
                  key={ev.id + ev.eventType}
                  className={`mev ${getCovColor(ev.coverage)}${ev.eventType === 'festival' ? ' festival' : ''}`}
                  style={{
                    fontSize: 9, fontWeight: 500, borderRadius: 3, padding: '1px 4px', marginBottom: 2,
                    cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    background: getCovColor(ev.coverage) === 'green' ? '#d4edda' : getCovColor(ev.coverage) === 'orange' ? '#fde8c8' : '#fcd5d5',
                    color: getCovColor(ev.coverage) === 'green' ? '#2e7d4f' : getCovColor(ev.coverage) === 'orange' ? '#b8610a' : '#b91c1c',
                    borderLeft: ev.eventType === 'festival' ? '2px solid #7c3aed' : 'none',
                  }}
                  onClick={() => onEventClick(ev)}
                >
                  {ev.name || 'Allenamento'}{ev.eventType === 'festival' ? ' ★' : ''}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
