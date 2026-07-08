import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs, constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { store } from './store.ts'
import type { SessionManager } from './session.ts'
import type {
  SessionConfig,
  AppSettings,
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
  TodoItem,
} from '../src/shared/types.ts'
import { listVisibleApps } from './visibleApps.ts'
import { listFrequentSites } from './browserHistory.ts'
import { loginWithGoogle, logout, getAccountStatus } from './accountAuth.ts'
import { pushCreate, pushUpdate, pushDelete, pullGoogleEvents } from './scheduleSync.ts'
import {
  pushTodoUpsert,
  pushTodoDelete,
  pushScheduleBlockUpsert,
  pushScheduleBlockDelete,
  pullAccountData,
} from './accountSync.ts'

const HOSTS_PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')

// Blocks don't span midnight -- start/duration are always clamped to the
// same calendar day so `date` stays a clean single-day key.
function clampBlockTimes(startMinutes: number, durationMinutes: number) {
  const start = Math.min(Math.max(0, Math.round(startMinutes)), 1439)
  const duration = Math.min(Math.max(15, Math.round(durationMinutes)), 1440 - start)
  return { start, duration }
}

// TODO order IS priority: every todo's `priority` always equals its 1-based
// position in the list. Whenever the list's order changes (add/remove/move),
// the whole array gets renumbered so the two can never drift apart.
function renumberPriorities(todos: TodoItem[]): TodoItem[] {
  return todos.map((t, i) => (t.priority === i + 1 ? t : { ...t, priority: i + 1, updatedAt: Date.now() }))
}

// Every schedule:* handler returns this same merged (zone + google-cache)
// shape for the affected date, so a local mutation never makes the
// previously-fetched Google events disappear from the renderer's view.
function listForDateMerged(date: string) {
  return [
    ...store.get('scheduleBlocks').filter((b) => b.date === date),
    ...store.get('googleEventsCache').filter((b) => b.date === date),
  ]
}

export function registerIpcHandlers(sessionManager: SessionManager) {
  ipcMain.handle('session:get', () => sessionManager.getState())
  ipcMain.handle('session:start', (_event, config: SessionConfig) => sessionManager.start(config))
  ipcMain.handle('session:pause', () => sessionManager.pause())
  ipcMain.handle('session:resume', () => sessionManager.resume())
  ipcMain.handle('session:extend', (_event, minutes: number) => sessionManager.extendSession(minutes))
  ipcMain.handle('session:debugStop', () => sessionManager.debugForceFinish())

  ipcMain.handle('settings:get', () => store.get('settings'))
  ipcMain.handle('settings:set', (_event, settings: AppSettings) => {
    store.set('settings', settings)
  })

  ipcMain.handle('todos:get', () => {
    const todos = renumberPriorities(store.get('todos'))
    store.set('todos', todos)
    return todos
  })
  ipcMain.handle('todos:add', (_event, text: string, estimatedMinutes: number | null) => {
    const todos = store.get('todos')
    const created = {
      id: randomUUID(),
      text,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      estimatedMinutes,
      actualMinutes: 0,
      priority: null,
    }
    todos.unshift(created)
    const renumbered = renumberPriorities(todos)
    store.set('todos', renumbered)
    renumbered.forEach((t, index) => void pushTodoUpsert(t, index))
    return renumbered
  })
  ipcMain.handle('todos:toggle', (_event, id: string) => {
    const todos = store.get('todos').map((t) => (t.id === id ? { ...t, done: !t.done, updatedAt: Date.now() } : t))
    store.set('todos', todos)
    const toggled = todos.find((t) => t.id === id)
    if (toggled) void pushTodoUpsert(toggled, todos.indexOf(toggled))
    return todos
  })
  ipcMain.handle('todos:remove', (_event, id: string) => {
    const remaining = store.get('todos').filter((t) => t.id !== id)
    const renumbered = renumberPriorities(remaining)
    store.set('todos', renumbered)
    void pushTodoDelete(id)
    renumbered.forEach((t, index) => void pushTodoUpsert(t, index))
    return renumbered
  })
  ipcMain.handle('todos:reorder', (_event, orderedIds: string[]) => {
    const byId = new Map(store.get('todos').map((t) => [t.id, t]))
    const reordered = orderedIds.map((id) => byId.get(id)).filter((t) => t !== undefined)
    const renumbered = renumberPriorities(reordered)
    store.set('todos', renumbered)
    renumbered.forEach((todo, index) => void pushTodoUpsert(todo, index))
    return renumbered
  })
  ipcMain.handle('todos:rename', (_event, id: string, text: string) => {
    const trimmed = text.trim()
    const todos = store.get('todos')
    if (!trimmed) return todos
    const updated = todos.map((t) => (t.id === id ? { ...t, text: trimmed, updatedAt: Date.now() } : t))
    store.set('todos', updated)
    const renamed = updated.find((t) => t.id === id)
    if (renamed) void pushTodoUpsert(renamed, updated.indexOf(renamed))
    return updated
  })
  ipcMain.handle('todos:setEstimate', (_event, id: string, minutes: number | null) => {
    const todos = store
      .get('todos')
      .map((t) => (t.id === id ? { ...t, estimatedMinutes: minutes, updatedAt: Date.now() } : t))
    store.set('todos', todos)
    const updated = todos.find((t) => t.id === id)
    if (updated) void pushTodoUpsert(updated, todos.indexOf(updated))
    return todos
  })

  ipcMain.handle('history:get', () => store.get('history'))

  ipcMain.handle('schedule:listForDate', (_event, date: string) => listForDateMerged(date))
  ipcMain.handle('schedule:create', (_event, input: CreateScheduleBlockInput) => {
    const { start, duration } = clampBlockTimes(input.startMinutes, input.durationMinutes)
    const now = Date.now()
    const blocks = store.get('scheduleBlocks')
    const created = {
      id: randomUUID(),
      date: input.date,
      startMinutes: start,
      durationMinutes: duration,
      title: input.title,
      todoId: input.todoId,
      source: 'zone' as const,
      googleEventId: null,
      googleUpdatedAt: null,
      syncStatus: undefined,
      lastModified: now,
      createdAt: now,
    }
    blocks.push(created)
    store.set('scheduleBlocks', blocks)
    void pushCreate(created)
    void pushScheduleBlockUpsert(created)
    return listForDateMerged(input.date)
  })
  ipcMain.handle('schedule:update', (_event, id: string, patch: UpdateScheduleBlockInput) => {
    const blocks = store.get('scheduleBlocks')
    const existing = blocks.find((b) => b.id === id)
    if (!existing || existing.source !== 'zone') {
      return listForDateMerged(existing?.date ?? '')
    }
    const { start, duration } = clampBlockTimes(
      patch.startMinutes ?? existing.startMinutes,
      patch.durationMinutes ?? existing.durationMinutes,
    )
    let updatedBlock = existing
    const updated = blocks.map((b) => {
      if (b.id !== id) return b
      updatedBlock = {
        ...b,
        title: patch.title ?? b.title,
        startMinutes: start,
        durationMinutes: duration,
        todoId: patch.todoId === null ? undefined : (patch.todoId ?? b.todoId),
        lastModified: Date.now(),
      }
      return updatedBlock
    })
    store.set('scheduleBlocks', updated)
    void pushUpdate(updatedBlock)
    void pushScheduleBlockUpsert(updatedBlock)
    return listForDateMerged(existing.date)
  })
  ipcMain.handle('schedule:remove', (_event, id: string) => {
    const blocks = store.get('scheduleBlocks')
    const existing = blocks.find((b) => b.id === id)
    if (!existing || existing.source !== 'zone') {
      return listForDateMerged(existing?.date ?? '')
    }
    const remaining = blocks.filter((b) => b.id !== id)
    store.set('scheduleBlocks', remaining)
    void pushDelete(existing.googleEventId)
    void pushScheduleBlockDelete(id)
    return listForDateMerged(existing.date)
  })
  ipcMain.handle('schedule:addToTodoList', (_event, id: string) => {
    const blocks = store.get('scheduleBlocks')
    const existing = blocks.find((b) => b.id === id)
    if (!existing || existing.source !== 'zone' || existing.todoId) {
      return listForDateMerged(existing?.date ?? '')
    }
    const todos = store.get('todos')
    const newTodo = {
      id: randomUUID(),
      text: existing.title,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      estimatedMinutes: existing.durationMinutes,
      actualMinutes: 0,
      priority: null,
    }
    todos.unshift(newTodo)
    const renumbered = renumberPriorities(todos)
    store.set('todos', renumbered)
    renumbered.forEach((t, index) => void pushTodoUpsert(t, index))
    const updated = blocks.map((b) => (b.id === id ? { ...b, todoId: newTodo.id, lastModified: Date.now() } : b))
    store.set('scheduleBlocks', updated)
    const updatedBlock = updated.find((b) => b.id === id)
    if (updatedBlock) void pushScheduleBlockUpsert(updatedBlock)
    return listForDateMerged(existing.date)
  })
  ipcMain.handle('schedule:pullGoogle', async (_event, dateKey: string) => {
    const [y, m, d] = dateKey.split('-').map(Number)
    await pullGoogleEvents(new Date(y, m - 1, d))
  })

  ipcMain.handle('account:getStatus', () => getAccountStatus())
  ipcMain.handle('account:loginWithGoogle', async () => {
    const result = await loginWithGoogle()
    if (result.ok) void pullAccountData()
    return result
  })
  ipcMain.handle('account:logout', () => logout())

  ipcMain.handle('system:listVisibleApps', () => listVisibleApps())
  ipcMain.handle('system:listFrequentSites', () => listFrequentSites())
  ipcMain.handle('system:checkHostsWritable', async () => {
    try {
      await fs.access(HOSTS_PATH, fsConstants.W_OK)
      return true
    } catch {
      return false
    }
  })
}
