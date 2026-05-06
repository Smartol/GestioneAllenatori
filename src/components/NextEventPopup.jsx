import { useState, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { computeCoverage } from '../hooks/useCalendarData'

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getDayOfWeek(date) {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

export default function NextEventPopup({ onClose }) {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [onlyWithout, setOnlyWithout] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const endStr = format(addDays(today, 30), 'yyyy-MM-dd')

    const [trainingsRes, activitiesRes, attendancesRes, exceptionsRes] = await Promise.all([
      supabase.from('recurring_trainings')
        .select(`*, recurring_training_categories(min_coaches, category_id, group_id,
          category:categories(id,name),
          group:category_groups(id,name,category_group_members(category:categories(id,name)))
        )`)
        .eq('active', true),

      supabase.from('activities')
        .select(`*, activity_categories(min_coaches, category_id, group_id,
          category:categories(id,name),
          group:category_groups(id,name,category_group_members(category:categories(id,name)))
        )`)
        .gte('date', todayStr)
        .lte('date', endStr),

      supabase.from('attendances')
        .select('*')
        .eq('coach_id', profile.id),

      supabase.from('training_instance_exceptions')
        .select('training_id, instance_date')
        .gte('instance_date', todayStr)
        .lte('instance_date', endStr),
    ])

    const trainings = trainingsRes.data || []
    const activities = activitiesRes.data || []
    const attendances = attendancesRes.data || []
    const exceptions = exceptionsRes.data || []

    const result = []

    // Genera istanze degli allenamenti ricorrenti nei prossimi 30 giorni
    for (let i = 0; i < 30; i++) {
      const date = addDays(today, i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dow = getDayOfWeek(date)

      trainings.forEach(t => {
        if (t.day_of_week !== dow) return
        if (t.start_date && dateStr < t.start_date) return
        if (t.end_date && dateStr > t.end_date) return
        if (exceptions.some(e => e.training_id === t.id && e.instance_date === dateStr)) return

        const myAtt = attendances.find(a => a.training_id === t.id && a.instance_date === dateStr)
        result.push({
          id: t.id,
          eventType: 'training',
          title: t.title || 'Allenamento',
          date,
          dateStr,
          start_time: t.start_time,
          end_time: t.end_time,
          slots: t.recurring_training_categories,
          myAttendance: myAtt || null,
        })
      })
    }

    // Aggiungi attività
    activities.forEach(act => {
      const myAtt = attendances.find(a => a.activity_id === act.id)
      result.push({
        id: act.id,
        eventType: 'activity',
        type: act.type,
        title: act.title || 'Festival',
        date: new Date(act.date + 'T00:00:00'),
        dateStr: act.date,
        start_time: act.start_time,
        end_time: act.end_time,
        location: act.location,
        slots: act.activity_categories,
        myAttendance: myAtt || null,
      })
    })

    // Ordina per data e orario
    result.sort((a, b) => {
      const dateDiff = a.date - b.date
      if (dateDiff !== 0) return dateDiff
      return timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
    })

    setEvents(result)
    setLoading(false)
  }

  const filtered = onlyWithout ? events.filter(e => !e.myAttendance) : events
  const event = filtered[index]

  // Reset indice e stato quando cambia il filtro
  useEffect(() => {
    setIndex(0)
    setSelectedSlot(null)
    setConfirmed(false)
  }, [onlyWithout])

  // Reset stato presenza quando cambia evento
  useEffect(() => {
    setSelectedSlot(null)
    setConfirmed(false)
  }, [index])

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
    setConfirmed(true)
    // Ricarica per aggiornare myAttendance
    await loadEvents()
  }

  function slotOptions(ev) {
    const slots = (ev.slots || []).map(s => {
      if (s.category) return { key: `cat_${s.category_id}`, label: s.category.name, category_id: s.category_id, group_id: null }
      if (s.group) {
        const label = s.group.name || s.group.category_group_members?.map(m => m.category?.name).join('+') || 'Gruppo'
        return { key: `grp_${s.group_id}`, label, category_id: null, group_id: s.group_id }
      }
      return null
    }).filter(Boolean)
    return [...slots, { key: 'jolly', label: '⭐ Jolly' }]
  }

  function presenceLabel(att) {
    if (!att) return null
    if (att.is_jolly) return '⭐ Jolly'
    if (att.category_id) {
      const slot = event?.slots?.find(s => s.category_id === att.category_id)
      return slot?.category?.name || 'Categoria'
    }
    if (att.group_id) {
      const slot = event?.slots?.find(s => s.group_id === att.group_id)
      return slot?.group?.name || 'Gruppo'
    }
    return 'Presente'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 380, maxWidth: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>
        {/* Header verde */}
        <div style={{ background: 'var(--accent)', padding: '16px 20px 14px', position: 'relative' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            Prossimi impegni
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
            {loading ? 'Caricamento...' : filtered.length === 0 ? 'Nessun impegno' : event?.title}
          </div>
          <button onClick={onClose} style={{
            position: 'absolute', top: 14, right: 16,
            background: '#fff', border: 'none', color: 'var(--accent)',
            borderRadius: '50%', width: 28, height: 28, fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
            Nessun impegno nei prossimi 30 giorni.
          </div>
        ) : (
          <>
            {/* Data e dettagli */}
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>
                {format(event.date, 'EEEE d MMMM', { locale: it })}
              </div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
                {format(event.date, 'yyyy', { locale: it })}
                {event.start_time && ` · ${event.start_time.slice(0,5)}${event.end_time ? ` → ${event.end_time.slice(0,5)}` : ''}`}
              </div>
              {event.location && (
                <div style={{ fontSize: 12, color: '#888' }}>📍 {event.location}</div>
              )}
              {event.eventType === 'activity' && (
                <span className={`badge ${event.type === 'festival' ? 'badge-purple' : 'badge-coach'}`} style={{ marginTop: 4 }}>
                  {event.type === 'festival' ? 'Festival' : 'Attività'}
                </span>
              )}
            </div>

            {/* Presenza */}
            <div style={{ padding: '12px 20px' }}>
              {event.myAttendance ? (
                <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
                  ✓ Presenza già confermata — {presenceLabel(event.myAttendance)}
                </div>
              ) : confirmed ? (
                <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
                  ✓ Presenza confermata!
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 500 }}>Sei disponibile?</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {slotOptions(event).map(opt => (
                      <div
                        key={opt.key}
                        className={`chip${selectedSlot?.key === opt.key ? ' selected' : ''}`}
                        onClick={() => setSelectedSlot(opt)}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={confirmPresence}
                    disabled={!selectedSlot || saving}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {saving ? 'Salvataggio...' : 'Conferma presenza'}
                  </button>
                </div>
              )}
            </div>

            {/* Footer navigazione */}
            <div style={{
              padding: '10px 20px 16px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              {/* Filtro */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyWithout}
                  onChange={e => setOnlyWithout(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Solo senza presenza
              </label>

              {/* Frecce navigazione */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  {index + 1} / {filtered.length}
                </span>
                <button
                  onClick={() => setIndex(i => Math.max(0, i - 1))}
                  disabled={index === 0}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', border: '1px solid #e5e5e5',
                    background: index === 0 ? '#f5f5f4' : '#fff', cursor: index === 0 ? 'default' : 'pointer',
                    fontSize: 16, color: index === 0 ? '#ccc' : '#1a1a1a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >‹</button>
                <button
                  onClick={() => setIndex(i => Math.min(filtered.length - 1, i + 1))}
                  disabled={index === filtered.length - 1}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', border: '1px solid #e5e5e5',
                    background: index === filtered.length - 1 ? '#f5f5f4' : 'var(--accent)',
                    cursor: index === filtered.length - 1 ? 'default' : 'pointer',
                    fontSize: 16, color: index === filtered.length - 1 ? '#ccc' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >›</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
