import { useState, useEffect } from 'react'
import { format, addDays, differenceInCalendarDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import EventModal from './EventModal'

const TYPE_LABELS = {
  training: 'Allenamento',
  school: 'Scuola',
  festival: 'Festival',
  other: 'Evento',
}

const ALL_TYPES = Object.keys(TYPE_LABELS)

function dayLabel(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diff = differenceInCalendarDays(d, today)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  if (diff === 2) return 'Dopodomani'
  if (diff > 2) return `Fra ${diff} giorni`
  return format(date, 'dd/MM')
}

export default function NextEventPopup({ onClose }) {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [attendances, setAttendances] = useState([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [onlyWithout, setOnlyWithout] = useState(false)
  const [hiddenTypes, setHiddenTypes] = useState([])

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const endStr = format(addDays(today, 60), 'yyyy-MM-dd')

    const { data: instances } = await supabase
      .from('event_instances')
      .select('id, event_id, instance_date, override_start_time, override_end_time, override_location, status')
      .gte('instance_date', todayStr)
      .lte('instance_date', endStr)
      .neq('status', 'skipped')
      .order('instance_date')

    const { data: eventsData } = await supabase
      .from('events')
      .select(`
        id, type, title, start_time, end_time, location,
        day_of_week, days_of_week, start_date, end_date,
        event_slots(
          id, min_coaches, category_id, group_id, role_id,
          category:categories(id,name),
          group:category_groups(id,name),
          role:roles(id,name)
        )
      `)
      .eq('active', true)

    const { data: schoolClasses } = await supabase
      .from('school_class_instances')
      .select('*')
      .gte('instance_date', todayStr)
      .lte('instance_date', endStr)
      .eq('removed', false)

    const instanceIds = (instances || []).map(i => i.id)

    const { data: allAtt } = instanceIds.length > 0
      ? await supabase
          .from('attendances_new')
          .select('*, coach:profiles(id,full_name)')
          .in('instance_id', instanceIds)
      : { data: [] }

    // Presenze scuola (per school_class_instance_id)
    const schoolClassIds = (schoolClasses || []).map(c => c.id)
    const { data: schoolAtt } = schoolClassIds.length > 0
      ? await supabase
          .from('attendances_new')
          .select('*, coach:profiles(id,full_name)')
          .in('school_class_instance_id', schoolClassIds)
      : { data: [] }

    const result = []

    for (const inst of (instances || [])) {
      const ev = eventsData?.find(e => e.id === inst.event_id)
      if (!ev) continue

      if (ev.type === 'school') {
        const classesForDate = (schoolClasses || []).filter(
          c => c.event_id === ev.id && c.instance_date === inst.instance_date
        )
        if (classesForDate.length === 0) continue
        result.push({
          ...ev, eventType: ev.type,
          instance_id: inst.id, dateStr: inst.instance_date,
          date: new Date(inst.instance_date + 'T00:00:00'),
          start_time: inst.override_start_time || ev.start_time,
          end_time: inst.override_end_time || ev.end_time,
          location: inst.override_location || ev.location,
          slots: ev.event_slots || [],
          classBlock: classesForDate, allClassesForDate: classesForDate,
        })
      } else if (ev.type !== 'training') {
        result.push({
          ...ev, eventType: ev.type,
          instance_id: inst.id, dateStr: inst.instance_date,
          date: new Date(inst.instance_date + 'T00:00:00'),
          start_time: inst.override_start_time || ev.start_time,
          end_time: inst.override_end_time || ev.end_time,
          location: inst.override_location || ev.location,
          slots: ev.event_slots || [],
        })
      }
    }

    // Training ricorrenti
    const trainingEvents = (eventsData || []).filter(e => e.type === 'training')
    for (let i = 0; i < 60; i++) {
      const date = addDays(today, i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const jsDay = date.getDay()
      const isoDay = jsDay === 0 ? 7 : jsDay

      for (const tev of trainingEvents) {
        const days = tev.days_of_week?.length > 0 ? tev.days_of_week : tev.day_of_week ? [tev.day_of_week] : []
        if (!days.includes(isoDay)) continue
        if (tev.start_date && dateStr < tev.start_date) continue
        if (tev.end_date && dateStr > tev.end_date) continue
        if (result.find(e => e.id === tev.id && e.dateStr === dateStr)) continue

        const existingInst = (instances || []).find(i => i.event_id === tev.id && i.instance_date === dateStr)
        if (existingInst?.status === 'skipped') continue

        result.push({
          ...tev, eventType: 'training',
          instance_id: existingInst?.id || null,
          dateStr, date, slots: tev.event_slots || [],
        })
      }
    }

    result.sort((a, b) => {
      const dd = a.date - b.date
      if (dd !== 0) return dd
      return (a.start_time || '').localeCompare(b.start_time || '')
    })

    setEvents(result)
    setAttendances([...(allAtt || []), ...(schoolAtt || [])])
    setLoading(false)
  }

  function hasMyAttendance(ev) {
    if (!ev) return false
    // Per scuola controlla school_class_instance_id
    if (ev.eventType === 'school') {
      const classIds = (ev.allClassesForDate || ev.classBlock || []).map(c => c.id)
      return attendances.some(a => classIds.includes(a.school_class_instance_id) && a.coach_id === profile.id)
    }
    return attendances.some(a => a.instance_id === ev.instance_id && a.coach_id === profile.id)
  }

  function toggleType(type) {
    setHiddenTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    setIndex(0)
  }

  useEffect(() => { setIndex(0) }, [onlyWithout, hiddenTypes])

  const filtered = events.filter(ev => {
    if (onlyWithout && hasMyAttendance(ev)) return false
    if (hiddenTypes.includes(ev.eventType)) return false
    return true
  })

  const event = filtered[index]
  const isFirst = index === 0
  const isLast = filtered.length === 0 || index === filtered.length - 1

  const eventAttendances = event
    ? attendances.filter(a => {
        if (event.eventType === 'school') {
          const classIds = (event.allClassesForDate || event.classBlock || []).map(c => c.id)
          return classIds.includes(a.school_class_instance_id) || (a.instance_id === event.instance_id && a.is_jolly)
        }
        return a.instance_id === event.instance_id
      })
    : []

  const barStyle = {
    background: 'var(--color-primary)',
    borderRadius: 12,
    padding: '8px 14px',
    display: 'flex', alignItems: 'center', gap: 6,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16, gap: 8,
      background: 'rgba(0,0,0,0.5)',
    }}>

      {/* BARRA TOP — chip filtri + indicazione giorno */}
      <div style={{ ...barStyle, flexWrap: 'wrap', width: 420, maxWidth: '100%', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const visible = !hiddenTypes.includes(type)
            return (
              <div
                key={type}
                onClick={() => toggleType(type)}
                style={{
                  padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s',
                  background: visible ? '#fff' : 'rgba(255,255,255,0.1)',
                  color: visible ? 'var(--color-primary)' : 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  textDecoration: visible ? 'none' : 'line-through',
                }}
              >
                {label}
              </div>
            )
          })}
        </div>

        {/* Indicazione giorno */}
        {event && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#fff',
            background: 'rgba(255,255,255,0.2)', borderRadius: 8,
            padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {dayLabel(event.date)}
          </div>
        )}
      </div>

      {/* EVENT MODAL */}
      <div style={{ width: 420, maxWidth: '100%' }}>
        {loading ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
            Caricamento...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
            Nessun impegno trovato.
          </div>
        ) : (
          <EventModal
            event={event}
            attendances={eventAttendances}
            onClose={onClose}
            onRefetch={loadEvents}
            onDelete={loadEvents}
            embedded
          />
        )}
      </div>

      {/* BARRA BOTTOM — toggle + frecce */}
      <div style={{ ...barStyle, width: 420, maxWidth: '100%', justifyContent: 'space-between' }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: '#fff', cursor: 'pointer', userSelect: 'none',
        }}>
          <input type="checkbox" checked={onlyWithout} onChange={e => setOnlyWithout(e.target.checked)} />
          Solo senza presenza
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', minWidth: 36, textAlign: 'center' }}>
            {filtered.length > 0 ? `${index + 1} / ${filtered.length}` : '—'}
          </span>
          <button
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={isFirst}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              fontSize: 18, cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >‹</button>
          <button
            onClick={() => setIndex(i => Math.min(filtered.length - 1, i + 1))}
            disabled={isLast}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.8)', color: 'var(--color-primary)',
              fontSize: 18, cursor: isLast ? 'default' : 'pointer',
              opacity: isLast ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >›</button>
        </div>
      </div>

    </div>
  )
}