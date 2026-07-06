import { useCallback, useEffect, useState } from 'react'
import type { ScheduleBlock, TodoItem, UpdateScheduleBlockInput } from '../../shared/types'
import { TimelineDayNav } from './TimelineDayNav'
import { TimelineGrid } from './TimelineGrid'
import { TimelineBlockEditor } from './TimelineBlockEditor'

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

const GOOGLE_REFRESH_MS = 5 * 60 * 1000

export function TimelineScreen({
  onStartSession,
}: {
  onStartSession: (input: { todoId?: string; taskText: string; minutes: number }) => void
}) {
  const [date, setDate] = useState(() => new Date())
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncingGoogle, setSyncingGoogle] = useState(false)

  const dateKey = toDateKey(date)

  const reload = useCallback(() => {
    window.zone.schedule.listForDate(dateKey).then(setBlocks)
  }, [dateKey])

  const syncGoogle = useCallback(() => {
    setSyncingGoogle(true)
    window.zone.schedule
      .pullGoogle(dateKey)
      .then(reload)
      .finally(() => setSyncingGoogle(false))
  }, [dateKey, reload])

  useEffect(() => {
    reload()
    setSelectedId(null)
    // Paint local blocks immediately, then merge in Google's events once the
    // pull finishes -- never block the timeline on network round-trips.
    syncGoogle()
    const interval = setInterval(syncGoogle, GOOGLE_REFRESH_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey])

  useEffect(() => {
    window.zone.todos.list().then(setTodos)
  }, [])

  const createBlock = async (startMinutes: number, durationMinutes: number) => {
    const next = await window.zone.schedule.create({ date: dateKey, startMinutes, durationMinutes, title: '予定' })
    setBlocks(next)
    const created = next.reduce<ScheduleBlock | null>(
      (latest, b) => (b.createdAt > (latest?.createdAt ?? 0) ? b : latest),
      null,
    )
    if (created) setSelectedId(created.id)
  }

  const updateBlock = async (id: string, patch: UpdateScheduleBlockInput) => {
    setBlocks(await window.zone.schedule.update(id, patch))
  }

  const removeBlock = async (id: string) => {
    setBlocks(await window.zone.schedule.remove(id))
    if (selectedId === id) setSelectedId(null)
  }

  const addToTodoList = async (id: string) => {
    setBlocks(await window.zone.schedule.addToTodoList(id))
    window.zone.todos.list().then(setTodos)
  }

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  return (
    <div className="timeline-screen">
      <TimelineDayNav
        date={date}
        onPrev={() => setDate((d) => addDays(d, -1))}
        onNext={() => setDate((d) => addDays(d, 1))}
        onToday={() => setDate(new Date())}
        syncing={syncingGoogle}
      />
      <div className="timeline-layout">
        <TimelineGrid
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={(start, duration) => void createBlock(start, duration)}
          onMove={(id, startMinutes) => void updateBlock(id, { startMinutes })}
          onResize={(id, durationMinutes) => void updateBlock(id, { durationMinutes })}
        />
        {selectedBlock && (
          <TimelineBlockEditor
            block={selectedBlock}
            todos={todos}
            onRename={(title) => void updateBlock(selectedBlock.id, { title })}
            onLinkTodo={(todoId) => void updateBlock(selectedBlock.id, { todoId: todoId || null })}
            onDelete={() => void removeBlock(selectedBlock.id)}
            onAddToTodoList={() => void addToTodoList(selectedBlock.id)}
            onStartSession={() =>
              onStartSession({
                todoId: selectedBlock.todoId,
                taskText: selectedBlock.title,
                minutes: selectedBlock.durationMinutes,
              })
            }
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
