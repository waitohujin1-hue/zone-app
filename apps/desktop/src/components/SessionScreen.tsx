import type { SessionState } from '../shared/types'
import { TodoPanel } from './TodoPanel'
import { BgmPlayer } from './BgmPlayer'

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

const PHASE_LABELS: Record<string, string> = {
  work: '作業中',
  break: '小休憩',
  longBreak: '長休憩',
}

export function SessionScreen({ session }: { session: SessionState }) {
  const now = Date.now()
  const remaining = session.endsAt ? session.endsAt - now : 0
  const phaseRemaining = session.phaseEndsAt ? session.phaseEndsAt - now : 0

  return (
    <div className="session-screen">
      <div className="session-lock-banner">
        セッション実行中 — 終了までロックされています(自分で停止することはできません)
      </div>

      {session.focusTaskText && <div className="session-focus-task">🎯 {session.focusTaskText}</div>}

      {session.idleNudgeSeconds > 0 && session.idleSeconds >= session.idleNudgeSeconds && (
        <div className="session-idle-nudge">
          しばらく操作が止まっています。集中が途切れていませんか？深呼吸して作業に戻りましょう。
        </div>
      )}

      <div className="session-timer">
        <div className="session-timer-value">{formatDuration(remaining)}</div>
        <div className="session-timer-label">セッション終了まで</div>
      </div>

      {session.mode === 'pomodoro' && session.pomodoroPhase && (
        <div className="session-pomodoro">
          <span className={`pomodoro-phase pomodoro-phase--${session.pomodoroPhase}`}>
            {PHASE_LABELS[session.pomodoroPhase]}
          </span>
          <span className="pomodoro-phase-time">{formatDuration(phaseRemaining)}</span>
          <span className="pomodoro-cycle">サイクル {session.cycleCount}</span>
        </div>
      )}

      <div className="session-guard-status">
        <div>
          ブロック中のアプリ: {session.blockedApps.length}件 / サイト: {session.blockedSites.length}件
        </div>
        <div>妨害をブロックした回数: {session.interruptionsBlocked}</div>
        {!session.hostsBlockActive && session.blockedSites.length > 0 && (
          <div className="warning">
            サイトブロックが有効化できていません(管理者権限を確認してください)
          </div>
        )}
      </div>

      <div className="session-panels">
        <TodoPanel compact />
        <BgmPlayer />
      </div>
    </div>
  )
}
