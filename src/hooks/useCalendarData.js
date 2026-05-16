import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOfMonth, endOfMonth, startOfDay, isSameDay, addDays, format, startOfWeek } from 'date-fns'

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

// Raggruppa classi in blocchi: consecutive (diff <= pausa) → stesso blocco
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
      const last     = current[current.length - 1]
      const lastMin  = toMin(last.start_time)
      const thisMin  = toMin(cls.start_time)
      // Se non c'è orario o sono "consecutive" (diff <= pauseMinutes) → stesso blocco
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
  const [events, setEvents] = useState([])
  const [attendances, setAttendances] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [currentDate, view])

  async function fetchData() {
    setLoading(true)
    const { rangeStart, rangeEnd } = getRange(currentDate, view)
    const startStr = format(rangeStart, 'yyyy-MM-dd')
    const endStr   = format(rangeEnd,   'yyyy-MM-dd')

    try {
      // 1. Tutti gli eventi attivi con slot
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

      // 2. Istanze nel range (per festival/other + training con overrides)
      const { data: instances, error: instError } = await supabase
        .from('event_instances')
        .select('id,event_id,instance_date,override_start_time,override_end_time,override_location,status')
        .gte('instance_date', startStr)
        .lte('instance_date', endStr)
      if (instError) throw instError

      const instanceMap = {}
      ;(instances || []).forEach(i => { instanceMap[`${i.event_id}_${i.instance_date}`] = i })

      // 3. Classi scuola nel range (per eventi school)
      const { data: schoolClasses, error: scError } = await supabase
        .from('school_class_instances')
        .select('*')
        .gte('instance_date', startStr)
        .lte('instance_date', endStr)
      if (scError && scError.code !== '42P01') throw scError // ignora se tabella non esiste ancora

      // Raggruppa classi per event_id + instance_date
      const classByEventDate = {}
      ;(schoolClasses || []).filter(c => !c.removed).forEach(c => {
        const key = `${c.event_id}_${c.instance_date}`
        if (!classByEventDate[key]) classByEventDate[key] = []
        classByEventDate[key].push(c)
      })

      // 4. Costruisci eventi da mostrare
      const result = []

      for (const ev of (allEvents || [])) {
        if (ev.type === 'training') {
          // Training: genera date ricorrenti
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
          // School: un blocco per ogni gruppo di classi consecutive per data
          // Trova tutte le date distinte che hanno classi per questo evento nel range
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
          // Festival / other: istanza esplicita
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

            // 5. Presenze per training/festival/other
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

      // 5b. Presenze per scuole
      const schoolClassIds = schoolClasses?.map(c => c.id).filter(Boolean) || []
      if (schoolClassIds.length > 0) {
        const { data: schoolAtt, error: schoolAttError } = await supabase
          .from('attendances_new')
          .select('*,coach:profiles(id,full_name),category:categories(id,name),school_class_instance:school_class_instances(id,grade,section)')
          .in('school_class_instance_id', schoolClassIds)
        if (schoolAttError) throw schoolAttError
        attendancesData = [...attendancesData, ...(schoolAtt || [])]
      }

      setEvents(result)
      setAttendances(attendancesData)
    } catch (err) {
      console.error('Errore nel fetch dei dati:', err)
      setEvents([])
      setAttendances([])
    } finally {
      setLoading(false)
    }
  }

  return { events, attendances, loading, refetch: fetchData }
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
  let anyRed = false, anyOrange = false
  for (const d of Object.values(coverage)) {
    if (d.covered < d.min) anyRed = true
    else if (d.jolly > 0 || d.covered === d.min) anyOrange = true
  }
  return anyRed ? 'red' : anyOrange ? 'orange' : 'green'
}

export { groupClasses }