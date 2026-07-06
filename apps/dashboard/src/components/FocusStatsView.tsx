import type { FocusTotals } from '../hooks/useFocusStats'

/**
 * The exact same component is used for an employee's own self-view and for
 * an admin's drill-down into that employee -- there is deliberately no
 * "admin-only" variant with extra detail, so what management sees about a
 * person is structurally identical to what that person sees about themselves.
 */
export function FocusStatsView({ title, totals, loading }: { title: string; totals: FocusTotals; loading: boolean }) {
  return (
    <div>
      <h2>{title}</h2>
      {loading ? (
        <p className="hint">読み込み中…</p>
      ) : (
        <div className="stats-summary">
          <div className="stat-tile">
            <div className="stat-tile-value">{totals.minutesFocused}</div>
            <div className="stat-tile-label">集中時間(分)</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{totals.sessionsCompleted}</div>
            <div className="stat-tile-label">完了セッション数</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{totals.distractionsBlocked}</div>
            <div className="stat-tile-label">ブロックした妨害の件数</div>
          </div>
        </div>
      )}
    </div>
  )
}
