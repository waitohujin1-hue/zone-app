import { useEffect, useState } from 'react'
import type { FocusRecord } from '../shared/types'
import { generateAdvice } from '../lib/advice'

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

export function StatsScreen() {
  const [history, setHistory] = useState<FocusRecord[]>([])

  useEffect(() => {
    window.zone.history.list().then(setHistory)
  }, [])

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thisWeek = history.filter((h) => h.startedAt >= weekAgo)
  const totalMinutesThisWeek = thisWeek.reduce((sum, h) => sum + h.durationMinutes, 0)
  const totalInterruptionsThisWeek = thisWeek.reduce((sum, h) => sum + h.interruptionsBlocked, 0)
  const advice = generateAdvice(history)

  return (
    <div className="stats-screen">
      <h2>統計</h2>
      <div className="stats-summary">
        <div className="stat-tile">
          <div className="stat-tile-value">{thisWeek.length}</div>
          <div className="stat-tile-label">今週のセッション数</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{totalMinutesThisWeek}</div>
          <div className="stat-tile-label">今週の集中時間(分)</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{totalInterruptionsThisWeek}</div>
          <div className="stat-tile-label">今週ブロックした妨害回数</div>
        </div>
      </div>

      <h3 className="section-heading">アドバイス</h3>
      <ul className="advice-list">
        {advice.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ul>

      <table className="history-table">
        <thead>
          <tr>
            <th>日時</th>
            <th>モード</th>
            <th>時間(分)</th>
            <th>ブロック回数</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td>{formatDate(h.startedAt)}</td>
              <td>{h.mode === 'pomodoro' ? 'ポモドーロ' : 'シンプル'}</td>
              <td>{h.durationMinutes}</td>
              <td>{h.interruptionsBlocked}</td>
            </tr>
          ))}
          {history.length === 0 && (
            <tr>
              <td colSpan={4} className="history-empty">
                まだ記録がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
