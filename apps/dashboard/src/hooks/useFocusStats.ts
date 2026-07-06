import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface FocusStatsRow {
  orgId: string
  userId: string
  day: string
  sessionsCompleted: number
  minutesFocused: number
  distractionsBlocked: number
}

export interface FocusTotals {
  sessionsCompleted: number
  minutesFocused: number
  distractionsBlocked: number
}

const EMPTY_TOTALS: FocusTotals = { sessionsCompleted: 0, minutesFocused: 0, distractionsBlocked: 0 }

function addTotals(a: FocusTotals, b: FocusStatsRow): FocusTotals {
  return {
    sessionsCompleted: a.sessionsCompleted + b.sessionsCompleted,
    minutesFocused: a.minutesFocused + b.minutesFocused,
    distractionsBlocked: a.distractionsBlocked + b.distractionsBlocked,
  }
}

/**
 * Reads the same `user_focus_stats` view used by both the admin drill-down
 * and an employee's own self-view -- pass `userId` to scope to one person,
 * omit it to get the whole org (e.g. for the team leaderboard).
 */
export function useFocusStats(orgId: string | null, userId?: string, sinceDays = 7) {
  const [rows, setRows] = useState<FocusStatsRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    setLoading(true)

    async function load() {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
      let query = supabase.from('user_focus_stats').select('*').eq('org_id', orgId as string).gte('day', since)
      if (userId) query = query.eq('user_id', userId)
      const { data } = await query
      if (cancelled) return
      setRows(
        (data ?? []).map((r) => ({
          orgId: r.org_id as string,
          userId: r.user_id as string,
          day: r.day as string,
          sessionsCompleted: Number(r.sessions_completed),
          minutesFocused: Number(r.minutes_focused ?? 0),
          distractionsBlocked: Number(r.distractions_blocked ?? 0),
        })),
      )
      setLoading(false)
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [orgId, userId, sinceDays])

  const totals = rows.reduce(addTotals, EMPTY_TOTALS)

  const byUser = new Map<string, FocusTotals>()
  for (const row of rows) {
    byUser.set(row.userId, addTotals(byUser.get(row.userId) ?? EMPTY_TOTALS, row))
  }

  return { rows, totals, byUser, loading }
}
