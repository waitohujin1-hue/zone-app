import { getValidGoogleAccessToken as getValidAccessToken } from './accountAuth.ts'
import type { ScheduleBlock } from '../src/shared/types.ts'

const CALENDAR_ID = 'primary'
const API_BASE = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`

function getTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Google accepts a bare local datetime (no Z/offset suffix) paired with a
// separate IANA `timeZone` field -- simpler than computing UTC offsets here.
function dateAndMinutesToIso(date: string, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 0, minutes, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`
}

function isoToDateAndMinutes(iso: string): { date: string; minutes: number } {
  const dt = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    minutes: dt.getHours() * 60 + dt.getMinutes(),
  }
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('not connected')
  return fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
}

export async function insertEvent(block: ScheduleBlock): Promise<string> {
  const timeZone = getTimeZone()
  const res = await authedFetch(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      summary: block.title,
      start: { dateTime: dateAndMinutesToIso(block.date, block.startMinutes), timeZone },
      end: { dateTime: dateAndMinutesToIso(block.date, block.startMinutes + block.durationMinutes), timeZone },
    }),
  })
  if (!res.ok) throw new Error(`insertEvent failed: ${await res.text()}`)
  const data = (await res.json()) as { id: string }
  return data.id
}

export async function updateEvent(block: ScheduleBlock): Promise<void> {
  if (!block.googleEventId) throw new Error('no googleEventId')
  const timeZone = getTimeZone()
  const res = await authedFetch(`${API_BASE}/${block.googleEventId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      summary: block.title,
      start: { dateTime: dateAndMinutesToIso(block.date, block.startMinutes), timeZone },
      end: { dateTime: dateAndMinutesToIso(block.date, block.startMinutes + block.durationMinutes), timeZone },
    }),
  })
  if (!res.ok) throw new Error(`updateEvent failed: ${await res.text()}`)
}

export async function deleteEvent(googleEventId: string): Promise<void> {
  const res = await authedFetch(`${API_BASE}/${googleEventId}`, { method: 'DELETE' })
  // 410/404 just mean it's already gone on Google's side -- not a failure for our purposes.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`deleteEvent failed: ${await res.text()}`)
  }
}

export interface RemoteEvent {
  id: string
  summary: string
  date: string
  startMinutes: number
  durationMinutes: number
  updated: string
}

export async function listEvents(timeMinIso: string, timeMaxIso: string): Promise<RemoteEvent[]> {
  const url = new URL(API_BASE)
  url.searchParams.set('timeMin', timeMinIso)
  url.searchParams.set('timeMax', timeMaxIso)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  const res = await authedFetch(url.toString())
  if (!res.ok) throw new Error(`listEvents failed: ${await res.text()}`)
  const data = (await res.json()) as {
    items: {
      id: string
      summary?: string
      start?: { dateTime?: string }
      end?: { dateTime?: string }
      updated: string
    }[]
  }
  const events: RemoteEvent[] = []
  for (const item of data.items) {
    if (!item.start?.dateTime || !item.end?.dateTime) continue // skip all-day events
    const start = isoToDateAndMinutes(item.start.dateTime)
    const end = isoToDateAndMinutes(item.end.dateTime)
    if (start.date !== end.date) continue // our blocks never span midnight
    events.push({
      id: item.id,
      summary: item.summary ?? '(無題の予定)',
      date: start.date,
      startMinutes: start.minutes,
      durationMinutes: Math.max(15, end.minutes - start.minutes),
      updated: item.updated,
    })
  }
  return events
}
