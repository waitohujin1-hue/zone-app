import { useRef, useState } from 'react'
import type { ScheduleBlock } from '../../shared/types'
import { TimelineBlock } from './TimelineBlock'

const PIXELS_PER_MINUTE = 1
const SNAP_MINUTES = 15
const MIN_DURATION_MINUTES = 15

function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface DragCreateState {
  anchorMinutes: number
  currentMinutes: number
}

export function TimelineGrid({
  blocks,
  selectedId,
  onSelect,
  onCreate,
  onMove,
  onResize,
}: {
  blocks: ScheduleBlock[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (startMinutes: number, durationMinutes: number) => void
  onMove: (id: string, startMinutes: number) => void
  onResize: (id: string, durationMinutes: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragCreate, setDragCreate] = useState<DragCreateState | null>(null)

  const minutesFromPointer = (clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return clamp(snap((clientY - rect.top) / PIXELS_PER_MINUTE), 0, 1440)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const minutes = minutesFromPointer(e.clientY)
    setDragCreate({ anchorMinutes: minutes, currentMinutes: minutes })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragCreate) return
    setDragCreate((prev) => (prev ? { ...prev, currentMinutes: minutesFromPointer(e.clientY) } : prev))
  }

  const handlePointerUp = () => {
    if (!dragCreate) return
    const start = Math.min(dragCreate.anchorMinutes, dragCreate.currentMinutes)
    const end = Math.max(dragCreate.anchorMinutes, dragCreate.currentMinutes)
    setDragCreate(null)
    onCreate(start, Math.max(MIN_DURATION_MINUTES, end - start))
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="timeline-scroll">
      <div
        ref={containerRef}
        className="timeline-grid"
        style={{ height: 1440 * PIXELS_PER_MINUTE }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {hours.map((h) => (
          <div key={h} className="timeline-hour-line" style={{ top: h * 60 * PIXELS_PER_MINUTE }}>
            <span className="timeline-hour-label">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
        {dragCreate && (
          <div
            className="timeline-block timeline-block--ghost"
            style={{
              top: Math.min(dragCreate.anchorMinutes, dragCreate.currentMinutes) * PIXELS_PER_MINUTE,
              height:
                Math.max(MIN_DURATION_MINUTES, Math.abs(dragCreate.currentMinutes - dragCreate.anchorMinutes)) *
                PIXELS_PER_MINUTE,
            }}
          />
        )}
        {blocks.map((b) => (
          <TimelineBlock
            key={b.id}
            block={b}
            pixelsPerMinute={PIXELS_PER_MINUTE}
            selected={b.id === selectedId}
            onSelect={() => onSelect(b.id)}
            onMove={(startMinutes) => onMove(b.id, startMinutes)}
            onResize={(durationMinutes) => onResize(b.id, durationMinutes)}
            getMinutesFromPointer={minutesFromPointer}
          />
        ))}
      </div>
    </div>
  )
}
