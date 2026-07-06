import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useFocusStats } from '../hooks/useFocusStats'
import { FocusStatsView } from '../components/FocusStatsView'

interface MemberRow {
  userId: string
  email: string
}

export function TeamOverviewPage({ orgId }: { orgId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const { totals, byUser, loading } = useFocusStats(orgId, undefined, 7)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('memberships')
      .select('user_id, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .then(({ data }) => {
        if (cancelled) return
        setMembers((data ?? []).filter((m) => m.user_id).map((m) => ({ userId: m.user_id as string, email: m.email ?? '(不明)' })))
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  // Ranked by a positive metric only -- this is a recognition list, not a
  // "who's slacking" ranking.
  const leaderboard = [...members].sort(
    (a, b) => (byUser.get(b.userId)?.minutesFocused ?? 0) - (byUser.get(a.userId)?.minutesFocused ?? 0),
  )

  return (
    <div>
      <FocusStatsView title="チーム概要(過去7日間)" totals={totals} loading={loading} />

      <h3 className="section-heading">メンバー別(集中時間順)</h3>
      <table className="history-table">
        <thead>
          <tr>
            <th>メンバー</th>
            <th>集中時間(分)</th>
            <th>完了セッション数</th>
            <th>ブロック件数</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((m) => {
            const s = byUser.get(m.userId)
            return (
              <tr key={m.userId}>
                <td>
                  <Link to={`/team/${m.userId}`}>{m.email}</Link>
                </td>
                <td>{s?.minutesFocused ?? 0}</td>
                <td>{s?.sessionsCompleted ?? 0}</td>
                <td>{s?.distractionsBlocked ?? 0}</td>
              </tr>
            )
          })}
          {leaderboard.length === 0 && (
            <tr>
              <td colSpan={4} className="history-empty">
                まだメンバーがいません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
