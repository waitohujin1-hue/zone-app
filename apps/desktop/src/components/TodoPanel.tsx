import { useEffect, useState } from 'react'
import type { TodoItem } from '../shared/types'

export function TodoPanel({ compact = false }: { compact?: boolean }) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [text, setText] = useState('')
  const [newEstimate, setNewEstimate] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null)
  const [estimateInput, setEstimateInput] = useState('')
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')

  useEffect(() => {
    window.zone.todos.list().then(setTodos)
  }, [])

  const add = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    // Debug-only escape hatch: typing "stop" force-ends the active session
    // instead of adding a todo, so testing end-of-session doesn't require
    // waiting out a real timer. NFKC first so IME full-width "ｓｔｏｐ" (a
    // common input-conversion artifact) still matches.
    if (trimmed.normalize('NFKC').toLowerCase() === 'stop') {
      await window.zone.session.debugStop()
      setText('')
      return
    }
    const estimateTrimmed = newEstimate.trim()
    const estimatedMinutes = estimateTrimmed === '' ? null : Math.max(0, Math.round(Number(estimateTrimmed)))
    setTodos(await window.zone.todos.add(trimmed, Number.isFinite(estimatedMinutes) ? estimatedMinutes : null))
    setText('')
    setNewEstimate('')
  }

  const toggle = async (id: string) => {
    setTodos(await window.zone.todos.toggle(id))
  }

  const remove = async (id: string) => {
    setTodos(await window.zone.todos.remove(id))
  }

  const handleDrop = async (targetId: string) => {
    const draggedFrom = draggedId
    setDraggedId(null)
    if (!draggedFrom || draggedFrom === targetId) return
    const fromIndex = todos.findIndex((t) => t.id === draggedFrom)
    const toIndex = todos.findIndex((t) => t.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return
    const next = [...todos]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setTodos(next)
    setTodos(await window.zone.todos.reorder(next.map((t) => t.id)))
  }

  const startEditText = (t: TodoItem) => {
    setEditingTextId(t.id)
    setTextInput(t.text)
  }

  const saveText = async (id: string) => {
    const trimmed = textInput.trim()
    if (trimmed) setTodos(await window.zone.todos.rename(id, trimmed))
    setEditingTextId(null)
  }

  const startEditEstimate = (t: TodoItem) => {
    setEditingEstimateId(t.id)
    setEstimateInput(t.estimatedMinutes != null ? String(t.estimatedMinutes) : '')
  }

  const saveEstimate = async (id: string) => {
    const trimmed = estimateInput.trim()
    const minutes = trimmed === '' ? null : Math.max(0, Math.round(Number(trimmed)))
    setTodos(await window.zone.todos.setEstimate(id, Number.isFinite(minutes) ? minutes : null))
    setEditingEstimateId(null)
  }

  return (
    <div className={`todo-panel ${compact ? 'todo-panel--compact' : ''}`}>
      {!compact && <h3>TODO</h3>}
      <div className="todo-add-row">
        <input
          type="text"
          value={text}
          placeholder="タスクを追加"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <input
          type="number"
          min={0}
          className="todo-add-estimate"
          value={newEstimate}
          placeholder="分"
          onChange={(e) => setNewEstimate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <button onClick={() => void add()}>追加</button>
      </div>
      <ul className="todo-list">
        {todos.map((t) => (
          <li
            key={t.id}
            draggable
            onDragStart={() => setDraggedId(t.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void handleDrop(t.id)}
            className={
              t.done
                ? 'todo-item todo-item--done'
                : draggedId === t.id
                  ? 'todo-item todo-item--dragging'
                  : 'todo-item'
            }
          >
            <span
              className="todo-priority-badge"
              title="優先順位(タスクの並び順そのもの。ドラッグして並べ替えると変わります)"
            >
              優先度 {t.priority ?? '-'}
            </span>
            <span className="todo-text-row">
              <input type="checkbox" checked={t.done} onChange={() => void toggle(t.id)} />
              {editingTextId === t.id ? (
                <>
                  <input
                    type="text"
                    autoFocus
                    className="todo-text-input"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onBlur={() => void saveText(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveText(t.id)
                      if (e.key === 'Escape') setEditingTextId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="todo-text-confirm"
                    aria-label="確定"
                    // Without this, clicking the button first blurs the input,
                    // which saves via onBlur and re-renders the button away
                    // before its own click ever fires -- same end result, but
                    // suppressing the blur here makes it fire once, on purpose.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void saveText(t.id)}
                  >
                    ✓
                  </button>
                </>
              ) : (
                <span className="todo-text" onClick={() => startEditText(t)}>
                  {t.text}
                </span>
              )}
            </span>
            <span className="todo-drag-handle" aria-hidden="true">
              ⋮⋮
            </span>
            {editingEstimateId === t.id ? (
              <input
                type="number"
                min={0}
                autoFocus
                className="todo-estimate-input"
                value={estimateInput}
                placeholder="見積(分)"
                onChange={(e) => setEstimateInput(e.target.value)}
                onBlur={() => void saveEstimate(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveEstimate(t.id)
                }}
              />
            ) : (
              <button className="todo-estimate-badge" onClick={() => startEditEstimate(t)}>
                {t.actualMinutes}分{t.estimatedMinutes != null ? ` / 見積${t.estimatedMinutes}分` : ''}
              </button>
            )}
            <button className="todo-remove" onClick={() => void remove(t.id)} aria-label="削除">
              ×
            </button>
          </li>
        ))}
        {todos.length === 0 && <li className="todo-empty">タスクはまだありません</li>}
      </ul>
    </div>
  )
}
