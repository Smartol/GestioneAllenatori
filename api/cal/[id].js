// api/cal/[id].js
// Vercel Serverless Function — restituisce feed iCal per un coach
// URL: https://tuoapp.vercel.app/api/cal/[coach_id]

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// Formatta una data in formato iCal: YYYYMMDDTHHMMSSZ
function toIcalDate(dateStr, timeStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!timeStr) {
    // All-day event
    return `${String(y)}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`
  }
  const [h, min] = timeStr.split(':').map(Number)
  return `${String(y)}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}${String(min).padStart(2,'0')}00`
}

function escapeIcal(str) {
  if (!str) return ''
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function generateUID(eventId, dateStr, coachId) {
  return `event-${eventId}-${dateStr}-${coachId}@scuola-ovale`
}

export default async function handler(req, res) {
  const { id: coachId } = req.query

  if (!coachId) {
    res.status(400).send('Coach ID mancante')
    return
  }

  // Verifica che il coach esista
  const { data: coach, error: coachError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', coachId)
    .single()

  if (coachError || !coach) {
    res.status(404).send('Utente non trovato')
    return
  }

  // Carica le presenze del coach con i dettagli degli eventi
  const { data: attendances, error: attError } = await supabase
    .from('attendances_new')
    .select(`
      id, is_jolly, instance_id, school_class_instance_id,
      instance:event_instances(
        id, instance_date, override_start_time, override_end_time, override_location,
        event:events(id, type, title, start_time, end_time, location)
      ),
      school_class:school_class_instances(
        id, grade, section, instance_date, start_time,
        event:events(id, type, title, location)
      )
    `)
    .eq('coach_id', coachId)

  if (attError) {
    res.status(500).send('Errore nel caricamento presenze')
    return
  }

  const now = new Date()
  const stamp = toIcalDate(
    `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  ) + 'Z'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scuola Ovale//Calendario Presenze//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:SO — ${escapeIcal(coach.full_name)}`,
    'X-WR-TIMEZONE:Europe/Rome',
    'X-WR-CALDESC:Calendario presenze Scuola Ovale',
  ]

  const events = []

  for (const att of (attendances || [])) {
    // Presenza a training/festival/other
    if (att.instance && att.instance.event) {
      const inst = att.instance
      const ev = inst.event
      const dateStr = inst.instance_date
      if (!dateStr) continue

      const startTime = inst.override_start_time || ev.start_time
      const endTime   = inst.override_end_time   || ev.end_time
      const location  = inst.override_location   || ev.location

      const typeLabel = { training:'Allenamento', festival:'Festival', school:'Scuola', other:'Evento' }
      const title = ev.title || typeLabel[ev.type] || 'Evento'
      const summary = att.is_jolly ? `⭐ ${title} (Jolly)` : title

      const dtstart = startTime
        ? `DTSTART;TZID=Europe/Rome:${toIcalDate(dateStr, startTime)}`
        : `DTSTART;VALUE=DATE:${toIcalDate(dateStr, null)}`

      const dtend = endTime
        ? `DTEND;TZID=Europe/Rome:${toIcalDate(dateStr, endTime)}`
        : startTime
          ? `DTEND;TZID=Europe/Rome:${toIcalDate(dateStr, startTime)}` // stessa ora se manca end
          : `DTEND;VALUE=DATE:${toIcalDate(dateStr, null)}`

      events.push([
        'BEGIN:VEVENT',
        `UID:${generateUID(ev.id, dateStr, coachId)}`,
        `DTSTAMP:${stamp}`,
        dtstart,
        dtend,
        `SUMMARY:${escapeIcal(summary)}`,
        location ? `LOCATION:${escapeIcal(location)}` : null,
        `DESCRIPTION:Scuola Ovale — ${escapeIcal(coach.full_name)}`,
        'END:VEVENT',
      ].filter(Boolean))
    }

    // Presenza a scuola
    if (att.school_class && att.school_class.event) {
      const cls = att.school_class
      const ev = cls.event
      const dateStr = cls.instance_date
      if (!dateStr) continue

      const startTime = cls.start_time
      const title = ev.title || 'Scuola'
      const summary = `📚 ${title} — ${cls.grade}ª${cls.section}`

      const dtstart = startTime
        ? `DTSTART;TZID=Europe/Rome:${toIcalDate(dateStr, startTime)}`
        : `DTSTART;VALUE=DATE:${toIcalDate(dateStr, null)}`

      // Durata default 1 ora per lezione scuola
      let dtend = dtstart
      if (startTime) {
        const [h, m] = startTime.split(':').map(Number)
        const totalMin = h * 60 + m + 60
        const endH = Math.floor(totalMin / 60) % 24
        const endM = totalMin % 60
        const endTimeStr = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`
        dtend = `DTEND;TZID=Europe/Rome:${toIcalDate(dateStr, endTimeStr)}`
      }

      events.push([
        'BEGIN:VEVENT',
        `UID:${generateUID(`school-${cls.id}`, dateStr, coachId)}`,
        `DTSTAMP:${stamp}`,
        dtstart,
        dtend,
        `SUMMARY:${escapeIcal(summary)}`,
        ev.location ? `LOCATION:${escapeIcal(ev.location)}` : null,
        `DESCRIPTION:Scuola Ovale — ${escapeIcal(coach.full_name)}`,
        'END:VEVENT',
      ].filter(Boolean))
    }
  }

  for (const ev of events) {
    lines.push(...ev)
  }

  lines.push('END:VCALENDAR')

  const icsContent = lines.join('\r\n')

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="scuola-ovale-${coachId}.ics"`)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.status(200).send(icsContent)
}