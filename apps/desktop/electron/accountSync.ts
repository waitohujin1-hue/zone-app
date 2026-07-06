import { store } from './store.ts'
import { getSupabaseClient, getUserId } from './accountAuth.ts'
import type { TodoItem, ScheduleBlock, FocusRecord } from '../src/shared/types.ts'

// Scope note: only todos, schedule blocks (source:'zone' only -- Google's own
// events are never pushed back), and focus history are synced. Settings and
// blockedApps/blockedSites/BGM prefs stay device-local (see plan notes) --
// same "local writes first, sync is best-effort after" principle as the
// Google Calendar sync in scheduleSync.ts.

export async function pushTodoUpsert(todo: TodoItem, position: number): Promise<void> {
  const client = await getSupabaseClient()
  const userId = await getUserId()
  if (!client || !userId) return
  try {
    await client.from('todos').upsert({
      id: todo.id,
      user_id: userId,
      text: todo.text,
      done: todo.done,
      estimated_minutes: todo.estimatedMinutes,
      actual_minutes: todo.actualMinutes,
      position,
      updated_at: new Date(todo.updatedAt).toISOString(),
    })
  } catch {
    // best-effort; local store already has the authoritative copy
  }
}

export async function pushTodoDelete(id: string): Promise<void> {
  const client = await getSupabaseClient()
  if (!client) return
  try {
    await client.from('todos').delete().eq('id', id)
  } catch {
    /* best-effort */
  }
}

export async function pushScheduleBlockUpsert(block: ScheduleBlock): Promise<void> {
  if (block.source !== 'zone') return
  const client = await getSupabaseClient()
  const userId = await getUserId()
  if (!client || !userId) return
  try {
    await client.from('schedule_blocks').upsert({
      id: block.id,
      user_id: userId,
      date: block.date,
      start_minutes: block.startMinutes,
      duration_minutes: block.durationMinutes,
      title: block.title,
      todo_id: block.todoId ?? null,
      updated_at: new Date(block.lastModified).toISOString(),
    })
  } catch {
    /* best-effort */
  }
}

export async function pushScheduleBlockDelete(id: string): Promise<void> {
  const client = await getSupabaseClient()
  if (!client) return
  try {
    await client.from('schedule_blocks').delete().eq('id', id)
  } catch {
    /* best-effort */
  }
}

export async function pushFocusRecord(record: FocusRecord): Promise<void> {
  const client = await getSupabaseClient()
  const userId = await getUserId()
  if (!client || !userId) return
  try {
    await client.from('focus_history').upsert({
      id: record.id,
      user_id: userId,
      started_at: new Date(record.startedAt).toISOString(),
      ended_at: new Date(record.endedAt).toISOString(),
      duration_minutes: record.durationMinutes,
      interruptions_blocked: record.interruptionsBlocked,
      mode: record.mode,
    })
  } catch {
    /* best-effort */
  }
}

interface RemoteTodoRow {
  id: string
  text: string
  done: boolean
  estimated_minutes: number | null
  actual_minutes: number
  position: number
  updated_at: string
}

interface RemoteScheduleBlockRow {
  id: string
  date: string
  start_minutes: number
  duration_minutes: number
  title: string
  todo_id: string | null
  updated_at: string
}

interface RemoteFocusHistoryRow {
  id: string
  started_at: string
  ended_at: string
  duration_minutes: number
  interruptions_blocked: number
  mode: 'simple' | 'pomodoro'
}

function mergeTodos(remoteRows: RemoteTodoRow[]) {
  const local = store.get('todos')
  const localById = new Map(local.map((t) => [t.id, t]))
  const merged = new Map(localById)

  for (const row of remoteRows) {
    const existing = localById.get(row.id)
    const remoteUpdatedAt = new Date(row.updated_at).getTime()
    if (!existing || remoteUpdatedAt > existing.updatedAt) {
      merged.set(row.id, {
        id: row.id,
        text: row.text,
        done: row.done,
        createdAt: existing?.createdAt ?? remoteUpdatedAt,
        updatedAt: remoteUpdatedAt,
        estimatedMinutes: row.estimated_minutes,
        actualMinutes: row.actual_minutes,
      })
    }
  }

  const sorted = [...merged.values()].sort((a, b) => {
    const ra = remoteRows.find((r) => r.id === a.id)?.position
    const rb = remoteRows.find((r) => r.id === b.id)?.position
    if (ra !== undefined && rb !== undefined) return ra - rb
    return b.createdAt - a.createdAt
  })
  store.set('todos', sorted)
}

function mergeScheduleBlocks(remoteRows: RemoteScheduleBlockRow[]) {
  const local = store.get('scheduleBlocks')
  const localById = new Map(local.map((b) => [b.id, b]))
  const merged = new Map(localById)

  for (const row of remoteRows) {
    const existing = localById.get(row.id)
    const remoteUpdatedAt = new Date(row.updated_at).getTime()
    if (!existing || existing.source !== 'zone' || remoteUpdatedAt > existing.lastModified) {
      merged.set(row.id, {
        id: row.id,
        date: row.date,
        startMinutes: row.start_minutes,
        durationMinutes: row.duration_minutes,
        title: row.title,
        todoId: row.todo_id ?? undefined,
        source: 'zone',
        googleEventId: existing?.googleEventId ?? null,
        googleUpdatedAt: existing?.googleUpdatedAt ?? null,
        syncStatus: existing?.syncStatus,
        lastModified: remoteUpdatedAt,
        createdAt: existing?.createdAt ?? remoteUpdatedAt,
      })
    }
  }
  store.set('scheduleBlocks', [...merged.values()])
}

function mergeFocusHistory(remoteRows: RemoteFocusHistoryRow[]) {
  const local = store.get('history')
  const localIds = new Set(local.map((r) => r.id))
  const additions: FocusRecord[] = remoteRows
    .filter((row) => !localIds.has(row.id))
    .map((row) => ({
      id: row.id,
      startedAt: new Date(row.started_at).getTime(),
      endedAt: new Date(row.ended_at).getTime(),
      durationMinutes: row.duration_minutes,
      interruptionsBlocked: row.interruptions_blocked,
      mode: row.mode,
    }))
  if (additions.length === 0) return
  const merged = [...local, ...additions].sort((a, b) => b.startedAt - a.startedAt)
  store.set('history', merged.slice(0, 200))
}

export async function pullAccountData(): Promise<void> {
  const client = await getSupabaseClient()
  const userId = await getUserId()
  if (!client || !userId) return

  try {
    const [todosRes, blocksRes, historyRes] = await Promise.all([
      client.from('todos').select('*').eq('user_id', userId),
      client.from('schedule_blocks').select('*').eq('user_id', userId),
      client.from('focus_history').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(200),
    ])
    if (todosRes.data) mergeTodos(todosRes.data as RemoteTodoRow[])
    if (blocksRes.data) mergeScheduleBlocks(blocksRes.data as RemoteScheduleBlockRow[])
    if (historyRes.data) mergeFocusHistory(historyRes.data as RemoteFocusHistoryRow[])
  } catch {
    // Offline or transient failure -- local data remains the source of truth.
  }
}
