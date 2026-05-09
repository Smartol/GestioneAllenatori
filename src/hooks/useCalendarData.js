import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, isSameDay, addDays, format } from 'date-fns'

const TODAY = new Date()

// Replica esatta della logica di CalendarPage per calcolare i giorni mostrati
function getWeekRange(currentDate) {
  const todayStart = startOfDay(TODAY)
  const refStart = startOfDay(currentDate)

  if (isSameDay(refStart, todayStart)) {
    // Vista "Oggi": oggi + 6 giorni
    const start = TODAY
    const end = addDays(TODAY, 6)
    return { rangeStart: start, rangeEnd: end }
  } else {
    // Altre settimane: lunedì–domenica
    const mon = startOfWeek(currentDate, { weekStartsOn: 1 })
    return {
      rangeStart: mon,
      rangeEnd: addDays(mon, 6),
    }
  }
}

export function useCalendarData(currentDate, view) {
  const [trainings, setTrainings] = useState([])
  const [activities, setActivities] = useState([])
  const [attendances, setAttendances] = useState([])
  const [overrides, setOverrides] = useState([])
  const [exceptions, setExceptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [currentDate, view])

  async function fetchData() {
    setLoading(true)

    let rangeStart, rangeEnd
    if (view === 'week') {
      const range = getWeekRange(currentDate)
      rangeStart = range.rangeStart
      rangeEnd = range.rangeEnd
    } else {
      rangeStart = startOfMonth(currentDate)
      rangeEnd = endOfMonth(currentDate)
    }

    const startStr = format(rangeStart, 'yyyy-MM-dd')
    const endStr = format(rangeEnd, 'yyyy-MM-dd')

    const [trainingsRes, activitiesRes, attendancesRes, overridesRes, exceptionsRes] = await Promise.all([
      supabase
        .from('recurring_trainings')
        .select(`
          *,
          recurring_training_categories (
            min_coaches, category_id, group_id,
            category:categories(id, name),
            group:category_groups(id, name, category_group_members(category:categories(id,name)))
          )
        `)
        .eq('active', true),

      supabase
        .from('activities')
        .select(`
          *,
          activity_categories (
            min_coaches, category_id, group_id,
            category:categories(id, name),
            group:category_groups(id, name, category_group_members(category:categories(id,name)))
          )
        `)
        .gte('date', startStr)
        .lte('date', endStr),

      supabase
        .from('attendances')
        .select(`*, coach:profiles(id, full_name), category:categories(id, name)`)
        .or(
          `and(training_id.not.is.null,instance_date.gte.${startStr},instance_date.lte.${endStr}),and(activity_id.not.is.null)`
        ),

      supabase
        .from('training_instance_overrides')
        .select(`
          *,
          instance_override_categories (
            min_coaches, category_id, group_id,
            category:categories(id, name),
            group:category_groups(id, name)
          )
        `)
        .gte('instance_date', startStr)
        .lte('instance_date', endStr),

      supabase
        .from('training_instance_exceptions')
        .select('training_id, instance_date')
        .gte('instance_date', startStr)
        .lte('instance_date', endStr),
    ])

    setTrainings(trainingsRes.data || [])
    setActivities(activitiesRes.data || [])
    setAttendances(attendancesRes.data || [])
    setOverrides(overridesRes.data || [])
    setExceptions(exceptionsRes.data || [])
    setLoading(false)
  }

  return { trainings, activities, attendances, overrides, exceptions, loading, refetch: fetchData }
}

export function computeCoverage(slots, attendances) {
  const result = {}
  if (!slots) return result

  for (const slot of slots) {
    const label = slot.category?.name
      || slot.group?.name
      || slot.group?.category_group_members?.map(m => m.category?.name).join('+')
      || '?'

    const present = attendances.filter(a => {
      if (slot.category_id) return a.category_id === slot.category_id && !a.is_jolly
      if (slot.group_id) return a.group_id === slot.group_id && !a.is_jolly
      return false
    }).length

    const jolly = attendances.filter(a => a.is_jolly).length

    result[label] = {
      present,
      jolly,
      min: slot.min_coaches,
      covered: present + jolly,
    }
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
