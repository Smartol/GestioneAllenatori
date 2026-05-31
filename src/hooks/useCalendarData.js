import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOfMonth, endOfMonth, startOfDay, isSameDay, addDays, format, startOfWeek } from 'date-fns'
import { useAuth } from '../hooks/useAuth'

const TODAY = new Date()

function getRange(currentDate, view) {
  if (view === 'month') {
    return { rangeStart: startOfMonth(currentDate), rangeEnd: endOfMonth(currentDate) }
  }
  if (isSameDay(startOfDay(currentDate), startOfDay(TODAY))) {
    return { rangeStart: TODAY, rangeEnd: addDays(TODAY, 6) }
  }
  const mon = startOfWeek(currentDate, { weekStartsOn: 1 })
  return { rangeStart: mon, rangeEnd: addDays(mon, 6) }
}

function generateRecurringDates(event, rangeStart, rangeEnd) {
  const dates = []
  const days = event.days_of_week?.length > 0
    ? event.days_of_week
    : event.day_of_week ? [event.day_of_week] : []
  if (days.length === 0) return dates

  const eventStart = event.start_date ? new Date(event.start_date + 'T00:00:00') : null
  const eventEnd   = event.end_date   ? new Date(event.end_date   + 'T00:00:00') : null

  let cursor = new Date(rangeStart); cursor.setHours(0,0,0,0)
  const end  = new Date(rangeEnd);   end.setHours(23,59,59,999)

  while (cursor <= end) {
    const jsDay  = cursor.getDay()
    const isoDay = jsDay === 0 ? 7 : jsDay
    if (days.includes(isoDay)) {
      if (eventStart && cursor < eventStart) { cursor = addDays(cursor,1); continue }
      if (eventEnd   && cursor > eventEnd)   { cursor = addDays(cursor,1); continue }
      dates.push(format(cursor, 'yyyy-MM-dd'))
    }
    cursor = addDays(cursor, 1)
  }
  return dates
}

function groupClasses(classes, pauseMinutes = 15) {
  if (!classes || classes.length === 0) return []

  function toMin(t) {
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }

  const sorted = [...classes]
    .filter(c => !c.removed)
    .sort((a, b) => (toMin(a.start_time) ?? 0) - (toMin(b.start_time) ?? 0))

  const blocks = []
  let current = []

  for (const cls of sorted) {
    if (current.length === 0) {
      current.push(cls)
    } else {
      const last    = current[current.length - 1]
      const lastMin = toMin(last.start_time)
      const thisMin = toMin(cls.start_time)
      if (lastMin === null || thisMin === null || (thisMin - lastMin) <= pauseMinutes) {
        current.push(cls)
      } else {
        blocks.push(current)
        current = [cls]
      }
    }
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

export function useCalendarData(currentDate, view) {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [attendances, setAttendances] = useState([])
  const [absences, setAbsences] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [currentDate, view])

  async function fetchData() {
    setLoading(true)
    const { rangeStart, rangeEnd } = getRange(currentDate, view)
    const startStr = format(rangeStart, 'yyyy-MM-dd')
    const endStr   = format(rangeEnd,   'yyyy-MM-dd')

    try {
      const { data: allEvents, error: evError } = await supabase
        .from('events')
        .select(`
          id, type, title, active,
          day_of_week, days_of_week,
          start_date, end_date,
          start_time, end_time,
          location, hosting_team,
          event_slots(
            id, min_coaches, category_id, group_id, role_id,
            category:categories(id,name),
            group:category_groups(id,name,category_group_members(category:categories(id,name))),
            role:roles(id,name)
          )
        `)
        .eq('active', true)
      if (evError) throw evError

      const { data: instances, error: instError } = await supabase
        .from('event_instances')
        .select('id,event_id,instance_date,override_start_time,override_end_time,override_location,status')
        .gte('instance_date', startStr)
        .lte('instance_date', endStr)
      if (instError) throw instError

      const instanceMap = {}
      ;(instances || []).forEach(i => { instanceMap[`${i.event_id}_${i.instance_date}`] = i })

      const { data: schoolClasses, error: scError } = await supabase
        .from('school_class_instances')
        .select('*')
        .gte('instance_date', startStr)
        .lte('instance_date', endStr)
      if (scError && scError.code !== '42P01') throw scError

      const classByEventDate = {}
      ;(schoolClasses || []).filter(c => !c.removed).forEach(c => {
        const key = `${c.event_id}_${c.instance_date}`
        if (!classByEventDate[key]) classByEventDate[key] = []
        classByEventDate[key].push(c)
      })

      // Carica assenze proprie nel range (sia 'event' che 'period')
      const { data: absencesData } = profile?.id ? await supabase
        .from('absences')
        .select('*')
        .eq('coach_id', profile.id)
        .or(`and(date_from.lte.${endStr},date_to.gte.${startStr})`)
        : { data: [] }

      const result = []

      for (const ev of (allEvents || [])) {
        if (ev.type === 'training') {
          const dates = generateRecurringDates(ev, rangeStart, rangeEnd)
          for (const dateStr of dates) {
            const inst = instanceMap[`${ev.id}_${dateStr}`]
            if (inst?.status === 'skipped') continue
            const effectiveDate = inst?.instance_date || dateStr
            result.push({
              id: ev.id, eventType: 'training',
              title: ev.title || 'Allenamento',
              slots: ev.event_slots || [],
              instance_id: inst?.id || null,
              dateStr: effectiveDate,
              originalDateStr: dateStr,
              date: new Date(effectiveDate + 'T00:00:00'),
              start_time: inst?.override_start_time || ev.start_time,
              end_time: inst?.override_end_time || ev.end_time,
              location: inst?.override_location || ev.location,
            })
          }
        } else if (ev.type === 'school') {
          const eventClasses = (schoolClasses || []).filter(c => c.event_id === ev.id && !c.removed)
          const dates = [...new Set(eventClasses.map(c => c.instance_date))].sort()

          for (const dateStr of dates) {
            const classesForDate = classByEventDate[`${ev.id}_${dateStr}`] || []
            const blocks = groupClasses(classesForDate)

            blocks.forEach((block, blockIdx) => {
              const firstTime = block[0]?.start_time || ev.start_time
              result.push({
                id: ev.id, eventType: 'school',
                title: ev.title || 'Scuola',
                slots: [],
                instance_id: null,
                blockIdx,
                classBlock: block,
                allClassesForDate: classesForDate,
                dateStr,
                date: new Date(dateStr + 'T00:00:00'),
                start_time: firstTime,
                end_time: ev.end_time,
                location: ev.location,
              })
            })
          }
        } else {
          const inst = (instances || []).find(i => i.event_id === ev.id)
          if (!inst || inst.status === 'skipped') continue
          if (inst.instance_date < startStr || inst.instance_date > endStr) continue
          result.push({
            id: ev.id, eventType: ev.type,
            title: ev.title || (ev.type === 'festival' ? 'Festival' : 'Evento'),
            slots: ev.event_slots || [],
            instance_id: inst.id,
            dateStr: inst.instance_date,
            date: new Date(inst.instance_date + 'T00:00:00'),
            start_time: inst.override_start_time || ev.start_time,
            end_time: inst.override_end_time || ev.end_time,
            location: inst.override_location || ev.location,
          })
        }
      }

      const instanceIds = result.map(e => e.instance_id).filter(Boolean)
      let attendancesData = []
      if (instanceIds.length > 0) {
        const { data: att, error: attError } = await supabase
          .from('attendances_new')
          .select('*,coach:profiles(id,full_name),category:categories(id,name),school_class_instance:school_class_instances(id,grade,section)')
          .in('instance_id', instanceIds)
        if (attError) throw attError
        attendancesData = att || []
      }

      const schoolClassIds = schoolClasses?.map(c => c.id).filter(Boolean) || []
      if (schoolClassIds.length > 0) {
        const { data: schoolAtt, error: schoolAttError } = await supabase
          .from('attendances_new')
          .select('*,coach:profiles(id,full_name),category:categories(id,name),school_class_instance:school_class_instances(id,grade,section)')
          .in('school_class_instance_id', schoolClassIds)
        if (schoolAttError) throw schoolAttError
        attendancesData = [...attendancesData, ...(schoolAtt || [])]
      }

      // Calcola myStatus per ogni evento
      // 'present' = ho una presenza, 'absent' = ho un'assenza, null = nessuna indicazione
      const myId = profile?.id
      const resultWithStatus = result.map(ev => {
        let myStatus = null

        if (myId) {
          // Controlla assenza per singolo evento
          const hasEventAbsence = (absencesData || []).some(a =>
            a.coach_id === myId &&
            a.absence_type === 'event' &&
            a.event_id === ev.id &&
            a.instance_date === ev.dateStr
          )
          // Controlla assenza per periodo
          const hasPeriodAbsence = (absencesData || []).some(a =>
            a.coach_id === myId &&
            a.absence_type === 'period' &&
            a.date_from <= ev.dateStr &&
            a.date_to >= ev.dateStr
          )

          if (hasEventAbsence || hasPeriodAbsence) {
            myStatus = 'absent'
          } else {
            // Controlla presenza
            if (ev.eventType === 'school') {
              const classIds = new Set((ev.classBlock || []).map(c => c.id))
              const hasPresence = attendancesData.some(a =>
                a.coach_id === myId &&
                a.school_class_instance_id &&
                classIds.has(a.school_class_instance_id)
              )
              if (hasPresence) myStatus = 'present'
            } else if (ev.instance_id) {
              const hasPresence = attendancesData.some(a =>
                a.coach_id === myId &&
                a.instance_id === ev.instance_id &&
                !a.school_class_instance_id
              )
              if (hasPresence) myStatus = 'present'
            }
          }
        }

        return { ...ev, myStatus }
      })

      setEvents(resultWithStatus)
      setAttendances(attendancesData)
      setAbsences(absencesData || [])
    } catch (err) {
      console.error('Errore nel fetch dei dati:', err)
      setEvents([])
      setAttendances([])
      setAbsences([])
    } finally {
      setLoading(false)
    }
  }

  return { events, attendances, absences, loading, refetch: fetchData }
}

// Controlla se una data è coperta da almeno un'assenza periodica
export function isDateAbsent(absences, dateStr) {
  return absences.some(a =>
    a.absence_type === 'period' &&
    a.date_from <= dateStr &&
    a.date_to >= dateStr
  )
}

// Restituisce 'present' | 'absent' | null per un evento specifico
export function getMyEventStatus(absences, attendances, ev, myId) {
  if (!myId) return null

  const hasEventAbsence = (absences || []).some(a =>
    a.coach_id === myId &&
    a.absence_type === 'event' &&
    a.event_id === ev.id &&
    a.instance_date === ev.dateStr
  )
  const hasPeriodAbsence = (absences || []).some(a =>
    a.coach_id === myId &&
    a.absence_type === 'period' &&
    a.date_from <= ev.dateStr &&
    a.date_to >= ev.dateStr
  )
  if (hasEventAbsence || hasPeriodAbsence) return 'absent'

  if (ev.eventType === 'school') {
    const classIds = new Set((ev.classBlock || []).map(c => c.id))
    const hasPresence = (attendances || []).some(a =>
      a.coach_id === myId &&
      a.school_class_instance_id &&
      classIds.has(a.school_class_instance_id)
    )
    return hasPresence ? 'present' : null
  }

  if (ev.instance_id) {
    const hasPresence = (attendances || []).some(a =>
      a.coach_id === myId &&
      a.instance_id === ev.instance_id &&
      !a.school_class_instance_id
    )
    return hasPresence ? 'present' : null
  }

  return null
}

export function computeCoverage(slots, attendances) {
  const result = {}
  if (!slots || slots.length === 0) return result
  for (const slot of slots) {
    let label = '?'
    if (slot.category?.name) label = slot.category.name
    else if (slot.group?.name) label = slot.group.name
    else if (slot.group?.category_group_members?.length)
      label = slot.group.category_group_members.map(m => m.category?.name).filter(Boolean).join('+')
    else if (slot.role?.name) label = slot.role.name

    const present = (attendances || []).filter(a => {
      if (a.is_jolly) return false
      if (slot.category_id) return a.category_id === slot.category_id
      if (slot.group_id)    return a.group_id    === slot.group_id
      if (slot.role_id)     return a.role_id     === slot.role_id
      return false
    }).length
    const jolly = (attendances || []).filter(a => a.is_jolly).length
    result[label] = { present, jolly, min: slot.min_coaches, covered: present + jolly }
  }
  return result
}

export function getCovColor(coverage) {
  if (!coverage || Object.keys(coverage).length === 0) return 'orange'
  const values = Object.values(coverage)
  const totalCovered = values.reduce((sum, d) => sum + d.covered, 0)
  const totalMin = values.reduce((sum, d) => sum + d.min, 0)
  if (totalCovered === 0 || totalCovered <= totalMin - 2) return 'red'
  if (totalCovered === totalMin - 1) return 'orange'
  return 'green'
}

export function getSchoolCovColor(classBlock, attendances) {
  if (!classBlock?.length) return 'orange'
  let worst = 'green'
  for (const cls of classBlock) {
    const present = (attendances || []).filter(a =>
      a.school_class_instance_id === cls.id || a.is_jolly
    ).length
    const min = cls.min_coaches || 2
    if (present === 0 || present <= min - 2) return 'red'
    if (present === min - 1 && worst !== 'red') worst = 'orange'
  }
  return worst
}

export { groupClasses }