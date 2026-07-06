import { useRef, useState } from 'react'
import type { ScheduleBlock } from '../../shared/types'

const DRAG_THRESHOLD_PX = 4
const MIN_DURATION_MINUTES = 15

type DragMode = 'move' | 'resize'

interface DragRef {
  mode: DragMode
  startClientY: number
  startMinutes: number
  moved: boolean
}

export function TimelineBlock({
  block,
  pixelsPerMinute,
  selected,
  onSelect,
  onMove,
  onResize,
  getMinutesFromPointer,
}: {
  block: ScheduleBlock
  pixelsPerMinute: number
  selected: boolean
  onSelect: () => void
  onMove: (startMinutes: number) => void
  onResize: (durationMinutes: number) => void
  getMinutesFromPointer: (clientY: number) => number
}) {
  const dragRef = useRef<DragRef | null>(null)
  const [previewTop, setPreviewTop] = useState<number | null>(null)
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)

  const isReadOnly = block.source !== 'zone'

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
    if (isReadOnly) return
    e.stopPropagation()
    dragRef.current = { mode, startClientY: e.clientY, startMinutes: block.startMinutes, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (Math.abs(e.clientY - drag.startClientY) < DRAG_THRESHOLD_PX && !drag.moved) return
    drag.moved = true

    const deltaMinutes = getMinutesFromPointer(e.clientY) - getMinutesFromPointer(drag.startClientY)
    if (drag.mode === 'move') {
      const nextStart = Math.min(Math.max(0, drag.startMinutes + deltaMinutes), 1440 - block.durationMinutes)
      setPreviewTop(nextStart * pixelsPerMinute)
    } else {
      const nextDuration = Math.max(
        MIN_DURATION_MINUTES,
        Math.min(block.durationMinutes + deltaMinutes, 1440 - block.startMinutes),
      )
      setPreviewHeight(nextDuration * pixelsPerMinute)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setPreviewTop(null)
    setPreviewHeight(null)
    if (!drag) return
    if (!drag.moved) {
      onSelect()
      return
    }

    const deltaMinutes = getMinutesFromPointer(e.clientY) - getMinutesFromPointer(drag.startClientY)
    if (drag.mode === 'move') {
      const nextStart = Math.min(Math.max(0, drag.startMinutes + deltaMinutes), 1440 - block.durationMinutes)
      onMove(nextStart)
    } else {
      const nextDuration = Math.max(
        MIN_DURATION_MINUTES,
        Math.min(block.durationMinutes + deltaMinutes, 1440 - block.startMinutes),
      )
      onResize(nextDuration)
    }
  }

  const top = previewTop ?? block.startMinutes * pixelsPerMinute
  const height = previewHeight ?? block.durationMinutes * pixelsPerMinute

  return (
    <div
      className={[
        'timeline-block',
        selected ? 'timeline-block--selected' : '',
        isReadOnly ? 'timeline-block--google' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ top, height }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="timeline-block-title">{block.title}</span>
      {!isReadOnly && (
        <div className="timeline-block-resize-handle" onPointerDown={(e) => handlePointerDown(e, 'resize')} />
      )}
    </div>
  )
}
