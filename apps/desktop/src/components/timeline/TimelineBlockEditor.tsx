import { useEffect, useState } from 'react'
import type { ScheduleBlock, TodoItem } from '../../shared/types'

function formatTimeRange(startMinutes: number, durationMinutes: number): string {
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${fmt(startMinutes)} - ${fmt(startMinutes + durationMinutes)}`
}

export function TimelineBlockEditor({
  block,
  todos,
  onRename,
  onLinkTodo,
  onDelete,
  onAddToTodoList,
  onStartSession,
  onClose,
}: {
  block: ScheduleBlock
  todos: TodoItem[]
  onRename: (title: string) => void
  onLinkTodo: (todoId: string) => void
  onDelete: () => void
  onAddToTodoList: () => void
  onStartSession: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(block.title)
  const isReadOnly = block.source !== 'zone'

  useEffect(() => {
    setTitle(block.title)
  }, [block.id, block.title])

  const incompleteTodos = todos.filter((t) => !t.done)

  return (
    <div className="timeline-editor">
      <div className="timeline-editor-header">
        <span>{formatTimeRange(block.startMinutes, block.durationMinutes)}</span>
        <button className="link-button" onClick={onClose}>
          閉じる
        </button>
      </div>

      {isReadOnly ? (
        <>
          <p className="timeline-editor-title">{block.title}</p>
          <p className="hint">Googleカレンダーの予定です(zoneからは編集できません)</p>
        </>
      ) : (
        <>
          <input
            type="text"
            className="timeline-editor-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && onRename(title.trim())}
          />

          <label className="timeline-editor-field">
            紐づくTODO
            <select value={block.todoId ?? ''} onChange={(e) => onLinkTodo(e.target.value)}>
              <option value="">(リンクしない)</option>
              {incompleteTodos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.text}
                </option>
              ))}
            </select>
          </label>

          {!block.todoId && (
            <button className="link-button" onClick={onAddToTodoList}>
              TODOにも追加する
            </button>
          )}

          <div className="timeline-editor-actions">
            <button className="start-button" onClick={onStartSession}>
              このタスクでセッション開始
            </button>
            <button className="danger-button" onClick={onDelete}>
              削除
            </button>
          </div>
        </>
      )}
    </div>
  )
}
