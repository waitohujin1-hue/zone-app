export type FocusMode = 'simple' | 'pomodoro'

export interface PomodoroConfig {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
}

/** Mirrors the `todos` table. Wire format for desktop<->Supabase<->web sync. */
export interface SyncedTodo {
  id: string
  userId: string
  text: string
  done: boolean
  estimatedMinutes: number | null
  actualMinutes: number
  /** Priority rank -- lower number = higher priority (1 is top priority). null = unranked. */
  priority: number | null
  position: number
  updatedAt: string
}

/** Mirrors the `schedule_blocks` table. */
export interface SyncedScheduleBlock {
  id: string
  userId: string
  date: string
  startMinutes: number
  durationMinutes: number
  title: string
  todoId: string | null
  updatedAt: string
}

/** Mirrors the `focus_history` table. */
export interface SyncedFocusRecord {
  id: string
  userId: string
  startedAt: string
  endedAt: string
  durationMinutes: number
  interruptionsBlocked: number
  mode: FocusMode
}

/** Mirrors the `user_settings` table. blockedApps/blockedSites/BGM prefs stay device-local, not synced. */
export interface SyncedUserSettings {
  userId: string
  defaultTotalMinutes: number
  pomodoro: PomodoroConfig
  idleNudgeMinutes: number
  updatedAt: string
}

// --- Focus advice engine -----------------------------------------------
// Shared between the desktop app (local FocusRecord history, epoch-ms
// timestamps) and the web app (SyncedFocusRecord, ISO timestamps) -- both
// adapt their own record shape into this minimal one before calling in.

export interface AdviceInput {
  startedAt: number
  durationMinutes: number
  interruptionsBlocked: number
}

const DAY_MS = 24 * 60 * 60 * 1000

interface TimeBucket {
  label: string
  startHour: number
  endHour: number
}

const BUCKETS: TimeBucket[] = [
  { label: '朝(5時〜11時)', startHour: 5, endHour: 11 },
  { label: '昼(11時〜17時)', startHour: 11, endHour: 17 },
  { label: '夕方〜夜(17時〜22時)', startHour: 17, endHour: 22 },
  { label: '深夜(22時〜5時)', startHour: 22, endHour: 5 },
]

function bucketLabelFor(hour: number): string {
  const bucket = BUCKETS.find((b) =>
    b.startHour < b.endHour ? hour >= b.startHour && hour < b.endHour : hour >= b.startHour || hour < b.endHour,
  )
  return bucket?.label ?? BUCKETS[0].label
}

/**
 * All heuristics here run entirely on already-recorded session history --
 * no new tracking, just turning what's already recorded into a few concrete,
 * rule-based suggestions rather than only raw numbers.
 */
export function generateAdvice(history: AdviceInput[]): string[] {
  if (history.length < 3) {
    return ['セッションを重ねると、ここに集中パターンの分析結果が表示されます。']
  }

  const advice: string[] = []

  const bucketStats = new Map<string, { count: number; interruptions: number }>()
  for (const record of history) {
    const label = bucketLabelFor(new Date(record.startedAt).getHours())
    const stat = bucketStats.get(label) ?? { count: 0, interruptions: 0 }
    stat.count += 1
    stat.interruptions += record.interruptionsBlocked
    bucketStats.set(label, stat)
  }
  const eligibleBuckets = Array.from(bucketStats.entries()).filter(([, s]) => s.count >= 2)
  if (eligibleBuckets.length > 0) {
    const [bestLabel] = eligibleBuckets.reduce((a, b) =>
      a[1].interruptions / a[1].count <= b[1].interruptions / b[1].count ? a : b,
    )
    advice.push(`${bestLabel}に集中セッションを行うと、妨害ブロック件数が少ない傾向があります。`)
  }

  const now = Date.now()
  const thisWeek = history.filter((r) => now - r.startedAt < 7 * DAY_MS)
  const lastWeek = history.filter((r) => now - r.startedAt >= 7 * DAY_MS && now - r.startedAt < 14 * DAY_MS)
  const thisWeekMinutes = thisWeek.reduce((sum, r) => sum + r.durationMinutes, 0)
  const lastWeekMinutes = lastWeek.reduce((sum, r) => sum + r.durationMinutes, 0)
  if (lastWeekMinutes > 0) {
    const pct = Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100)
    if (pct >= 10) {
      advice.push(`今週の集中時間は先週より${pct}%増えています。この調子です。`)
    } else if (pct <= -10) {
      advice.push(`今週の集中時間は先週より${Math.abs(pct)}%減っています。短めのセッションから再開してみましょう。`)
    }
  } else if (thisWeekMinutes > 0) {
    advice.push('今週から集中セッションを始めていますね。まずは継続を目標にしましょう。')
  }

  const avgInterruptions = history.reduce((sum, r) => sum + r.interruptionsBlocked, 0) / history.length
  if (avgInterruptions >= 3) {
    advice.push(
      `1セッションあたり平均${avgInterruptions.toFixed(1)}回の妨害をブロックしています。ブロック対象をさらに追加するか、セッション時間を短くすることを検討してみましょう。`,
    )
  }

  if (advice.length === 0) {
    advice.push('順調に集中セッションを継続できています。')
  }

  return advice
}
