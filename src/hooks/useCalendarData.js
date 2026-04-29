import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'

export function useCalendarData(currentDate, view) {
  const [trainings, setTrainings] = useState([])
  const [festivals, setFestivals] = useState([])
  const [attendances, setAttendances] = useState([])
  const [overrides, setOverrides] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [currentDate, view])

  async function fetchData() {
    setLoading(true)
    const rangeStart = view === 'week'
      ? startOfWeek(currentDate, { weekStartsOn: 1 })
      : startOfMonth(currentDate)
    const rangeEnd = view === 'week'
      ? endOfWeek(currentDate, { weekStartsOn: 1 })
      : endOfMonth(currentDate)

    const startStr = format(rangeStart, 'yyyy-MM-dd')
    const endStr = format(rangeEnd, 'yyyy-MM-dd')

    const [trainingsRes, festivalsRes, attendancesRes, overridesRes] = await Promise.all([
      supabase
        .from('recurring_trainings')
        .select(`
          *,
          recurring_training_categories (
            min_coaches,
            category:categories (id, name)
          )
        `)
        .eq('active', true),

      supabase
        .from('festivals')
        .select(`
          *,
          festival_categories (
            min_coaches,
            category:categories (id, name)
          )
        `)
        .gte('date', startStr)
        .lte('date', endStr),

      supabase
        .from('attendances')
        .select(`
          *,
          coach:profiles (id, full_name),
          category:categories (id, name)
        `)
        .or(
          `and(training_id.not.is.null,instance_date.gte.${startStr},instance_date.lte.${endStr}),and(festival_id.not.is.null)`
        ),

      supabase
        .from('training_instance_overrides')
        .select(`
          *,
          instance_override_categories (
            min_coaches,
            category:categories (id, name)
          )
        `)
        .gte('instance_date', startStr)
        .lte('instance_date', endStr),
    ])

    setTrainings(trainingsRes.data || [])
    setFestivals(festivalsRes.data || [])
    setAttendances(attendancesRes.data || [])
    setOverrides(overridesRes.data || [])
    setLoading(false)
  }

  return { trainings, festivals, attendances, overrides, loading, refetch: fetchData }
}

// Calcola la copertura per colore (rosso/arancione/verde)
export function computeCoverage(cats, attendances) {
  const result = {}
  for (const cat of cats) {
    const present = attendances.filter(a => a.category?.name === cat.category.name).length
    const jolly = attendances.filter(a => a.category === null).length
    const covered = present + jolly
    result[cat.category.name] = {
      present,
      jolly,
      min: cat.min_coaches,
      covered,
    }
  }
  return result
}

export function getCovColor(coverage) {
  let anyRed = false, anyOrange = false
  for (const d of Object.values(coverage)) {
    if (d.covered < d.min) anyRed = true
    else if (d.jolly > 0 || d.covered === d.min) anyOrange = true
  }
  return anyRed ? 'red' : anyOrange ? 'orange' : 'green'
}
