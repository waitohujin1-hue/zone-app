const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function formatDateLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_LABELS[d.getDay()]})`
}

export function TimelineDayNav({
  date,
  onPrev,
  onNext,
  onToday,
  syncing,
}: {
  date: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  syncing?: boolean
}) {
  return (
    <div className="timeline-day-nav">
      <button onClick={onPrev} aria-label="前の日">
        ←
      </button>
      <span className="timeline-day-label">{formatDateLabel(date)}</span>
      <button onClick={onNext} aria-label="次の日">
        →
      </button>
      <button className="link-button" onClick={onToday}>
        今日
      </button>
      {syncing && <span className="timeline-sync-indicator">Googleと同期中…</span>}
    </div>
  )
}
