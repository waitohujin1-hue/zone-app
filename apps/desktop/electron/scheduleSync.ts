import { store } from './store.ts'
import { getAccountStatus } from './accountAuth.ts'
import { insertEvent, updateEvent, deleteEvent, listEvents } from './googleCalendarClient.ts'
import type { ScheduleBlock } from '../src/shared/types.ts'

function patchBlock(id: string, patch: Partial<ScheduleBlock>) {
  const blocks = store.get('scheduleBlocks')
  store.set(
    'scheduleBlocks',
    blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  )
}

// All three push* functions are meant to be called fire-and-forget from the
// IPC handlers, after the local store write already happened and was already
// returned to the renderer -- a failed/slow push must never be visible as
// lag or an error in the local CRUD experience.

export async function pushCreate(block: ScheduleBlock): Promise<void> {
  const status = await getAccountStatus()
  if (!status.loggedIn) return
  try {
    const googleEventId = await insertEvent(block)
    patchBlock(block.id, { googleEventId, syncStatus: 'synced' })
  } catch {
    patchBlock(block.id, { syncStatus: 'error' })
  }
}

export async function pushUpdate(block: ScheduleBlock): Promise<void> {
  const status = await getAccountStatus()
  if (!status.loggedIn) return
  try {
    if (block.googleEventId) {
      await updateEvent(block)
      patchBlock(block.id, { syncStatus: 'synced' })
    } else {
      const googleEventId = await insertEvent(block)
      patchBlock(block.id, { googleEventId, syncStatus: 'synced' })
    }
  } catch {
    patchBlock(block.id, { syncStatus: 'error' })
  }
}

export async function pushDelete(googleEventId: string | null | undefined): Promise<void> {
  if (!googleEventId) return
  const status = await getAccountStatus()
  if (!status.loggedIn) return
  try {
    await deleteEvent(googleEventId)
  } catch {
    // Best-effort: a stray event left behind in Google Calendar for an
    // already-deleted local block isn't worth retry bookkeeping.
  }
}

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

const PULL_WINDOW_BEFORE_DAYS = 3
const PULL_WINDOW_AFTER_DAYS = 4

export async function pullGoogleEvents(centerDate: Date): Promise<void> {
  const status = await getAccountStatus()
  if (!status.loggedIn) return

  const rangeStart = addDays(centerDate, -PULL_WINDOW_BEFORE_DAYS)
  const rangeEnd = addDays(centerDate, PULL_WINDOW_AFTER_DAYS)

  try {
    const events = await listEvents(rangeStart.toISOString(), rangeEnd.toISOString())
    const localGoogleIds = new Set(
      store
        .get('scheduleBlocks')
        .map((b) => b.googleEventId)
        .filter((id): id is string => Boolean(id)),
    )
    const now = Date.now()
    const fresh: ScheduleBlock[] = events
      .filter((e) => !localGoogleIds.has(e.id))
      .map((e) => ({
        id: `google:${e.id}`,
        date: e.date,
        startMinutes: e.startMinutes,
        durationMinutes: e.durationMinutes,
        title: e.summary,
        source: 'google',
        googleEventId: e.id,
        googleUpdatedAt: e.updated,
        lastModified: now,
        createdAt: now,
      }))

    const coveredDateKeys = new Set<string>()
    for (let i = -PULL_WINDOW_BEFORE_DAYS; i <= PULL_WINDOW_AFTER_DAYS; i++) {
      coveredDateKeys.add(toDateKey(addDays(centerDate, i)))
    }
    // Replace only the cache entries inside the freshly-pulled window so
    // out-of-range cached days (from a previous pull elsewhere) are kept.
    const outOfWindow = store.get('googleEventsCache').filter((b) => !coveredDateKeys.has(b.date))
    store.set('googleEventsCache', [...outOfWindow, ...fresh])
  } catch {
    // Offline, token expired, etc. -- leave the existing cache as-is so the
    // timeline still renders (visibly stale) instead of throwing.
  }
}
