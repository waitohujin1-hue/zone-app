import { powerMonitor, Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { store } from './store.ts'
import { ProcessGuard } from './processGuard.ts'
import { applyHostsBlock, clearHostsBlock } from './hostsBlocker.ts'
import { closeWindowsMatchingSites } from './windowCloser.ts'
import type {
  SessionConfig,
  SessionState,
  PomodoroConfig,
  FocusRecord,
  TodoItem,
  PauseResult,
} from '../src/shared/types.ts'

const TICK_MS = 1000
const SITE_ENFORCE_MS = 2000
const MAX_PAUSES_PER_SESSION = 3
const MAX_PAUSE_DURATION_MS = 5 * 60_000
const END_WARNING_MS = 5 * 60_000

function notifyPhaseChange(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

function idleState(): SessionState {
  return {
    active: false,
    startedAt: null,
    endsAt: null,
    mode: 'simple',
    pomodoroPhase: null,
    phaseEndsAt: null,
    cycleCount: 0,
    blockedApps: [],
    blockedSites: [],
    focusTaskText: null,
    focusTodoId: null,
    interruptionsBlocked: 0,
    hostsBlockActive: false,
    idleSeconds: 0,
    idleNudgeSeconds: 0,
    paused: false,
    pauseStartedAt: null,
    pausesUsed: 0,
    pausesRemaining: 0,
    totalPausedMs: 0,
  }
}

/**
 * Owns the single active focus session. There is intentionally no `stop`/`cancel`
 * method exposed anywhere in this class or the IPC layer built on top of it —
 * a session only ever ends when `tick()` observes `endsAt` has passed.
 */
export class SessionManager {
  private state: SessionState
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private siteEnforceTimer: ReturnType<typeof setInterval> | null = null
  private processGuard = new ProcessGuard()
  private pomodoroConfigCache: PomodoroConfig | null = null
  private endWarningShown = false
  private getWindow: () => BrowserWindow | null
  private onSessionFinished?: (record: FocusRecord, updatedTodo: TodoItem | null) => void

  constructor(
    getWindow: () => BrowserWindow | null,
    onSessionFinished?: (record: FocusRecord, updatedTodo: TodoItem | null) => void,
  ) {
    this.getWindow = getWindow
    this.onSessionFinished = onSessionFinished
    const saved = store.get('session')
    if (saved && saved.active && saved.endsAt && saved.endsAt > Date.now()) {
      this.state = saved
      this.resumeEnforcement()
    } else {
      this.state = idleState()
    }
  }

  getState(): SessionState {
    return this.state
  }

  /**
   * Debug-only escape hatch (triggered by typing "stop" as a TODO in the
   * renderer) so testing the end-of-session flow doesn't require waiting
   * out a real timer. Everything else about "no manual stop" still holds --
   * this bypasses the endsAt check, it doesn't add a new way to cancel.
   */
  debugForceFinish(): void {
    if (!this.state.active) return
    this.finish()
  }

  /**
   * Pausing never lifts the lock -- blocking (processGuard/hosts) and
   * idle detection keep running exactly as before. All it does is stop
   * endsAt/phaseEndsAt from approaching; resume() pushes them back out by
   * however long the pause lasted, so the committed focus time is
   * preserved rather than shortened. Capped in count and duration (see
   * MAX_PAUSES_PER_SESSION/MAX_PAUSE_DURATION_MS) so this stays a tool for
   * brief real interruptions (a call, the bathroom) and not a loophole.
   */
  pause(): PauseResult {
    if (!this.state.active) return { ok: false, error: 'no active session', state: this.state }
    if (this.state.paused) return { ok: false, error: 'already paused', state: this.state }
    if (this.state.pausesUsed >= MAX_PAUSES_PER_SESSION) {
      return { ok: false, error: 'このセッションで使える一時停止の回数を使い切りました', state: this.state }
    }
    this.state.paused = true
    this.state.pauseStartedAt = Date.now()
    this.state.pausesUsed += 1
    this.state.pausesRemaining = MAX_PAUSES_PER_SESSION - this.state.pausesUsed
    this.persist()
    this.emit()
    return { ok: true, state: this.state }
  }

  resume(): SessionState {
    if (!this.state.active || !this.state.paused || this.state.pauseStartedAt === null) return this.state
    const pausedMs = Math.min(Date.now() - this.state.pauseStartedAt, MAX_PAUSE_DURATION_MS)
    this.state.totalPausedMs += pausedMs
    if (this.state.endsAt !== null) this.state.endsAt += pausedMs
    if (this.state.phaseEndsAt !== null) this.state.phaseEndsAt += pausedMs
    this.state.paused = false
    this.state.pauseStartedAt = null
    this.persist()
    this.emit()
    return this.state
  }

  /** Voluntary extension, offered via the 5-minutes-remaining warning (see tick()). */
  extendSession(minutes: number): SessionState {
    if (!this.state.active || this.state.endsAt === null) return this.state
    this.state.endsAt += Math.max(1, Math.round(minutes)) * 60_000
    // Re-arm the warning so it fires again ahead of the new (later) end time.
    this.endWarningShown = false
    this.persist()
    this.emit()
    return this.state
  }

  async start(config: SessionConfig): Promise<SessionState> {
    if (this.state.active) return this.state
    this.endWarningShown = false
    const now = Date.now()
    const linkedTodo = config.focusTodoId ? store.get('todos').find((t) => t.id === config.focusTodoId) : undefined
    this.state = {
      active: true,
      startedAt: now,
      endsAt: now + config.totalMinutes * 60_000,
      mode: config.mode,
      pomodoroPhase: config.mode === 'pomodoro' ? 'work' : null,
      phaseEndsAt: config.mode === 'pomodoro' ? now + config.pomodoro.workMinutes * 60_000 : null,
      cycleCount: 0,
      blockedApps: config.blockedApps,
      blockedSites: config.blockedSites,
      focusTaskText: linkedTodo?.text ?? config.focusTaskText ?? null,
      focusTodoId: config.focusTodoId ?? null,
      interruptionsBlocked: 0,
      hostsBlockActive: false,
      idleSeconds: 0,
      idleNudgeSeconds: store.get('settings').idleNudgeMinutes * 60,
      paused: false,
      pauseStartedAt: null,
      pausesUsed: 0,
      pausesRemaining: MAX_PAUSES_PER_SESSION,
      totalPausedMs: 0,
    }
    this.persist()
    await this.enforceStart(config.pomodoro)
    this.emit()
    return this.state
  }

  private async enforceStart(pomodoro: PomodoroConfig) {
    this.pomodoroConfigCache = pomodoro
    this.processGuard.start(this.state.blockedApps, () => this.onInterruptionBlocked())
    const hostsResult = await applyHostsBlock(this.state.blockedSites)
    this.state.hostsBlockActive = hostsResult.ok
    this.persist()
    this.siteEnforceTimer = setInterval(() => {
      closeWindowsMatchingSites(this.state.blockedSites)
    }, SITE_ENFORCE_MS)
    this.tickTimer = setInterval(() => this.tick(), TICK_MS)
  }

  private resumeEnforcement() {
    const pomodoro = store.get('settings').pomodoro
    void this.enforceStart(pomodoro)
  }

  private onInterruptionBlocked() {
    this.state.interruptionsBlocked += 1
    this.persist()
    this.emit()
  }

  private tick() {
    if (!this.state.active) return
    const now = Date.now()
    if (this.state.paused && this.state.pauseStartedAt !== null) {
      if (now - this.state.pauseStartedAt >= MAX_PAUSE_DURATION_MS) this.resume()
      else this.emit()
      return
    }
    if (this.state.endsAt !== null && now >= this.state.endsAt) {
      this.finish()
      return
    }
    if (!this.endWarningShown && this.state.endsAt !== null && this.state.endsAt - now <= END_WARNING_MS) {
      this.endWarningShown = true
      notifyPhaseChange('セッションがまもなく終了します', '残り5分です。延長しますか?')
    }
    if (this.state.mode === 'pomodoro' && this.state.phaseEndsAt !== null && now >= this.state.phaseEndsAt) {
      this.advancePomodoroPhase(now)
    }
    this.state.idleSeconds = powerMonitor.getSystemIdleTime()
    this.emit()
  }

  private advancePomodoroPhase(now: number) {
    const pomodoro = this.pomodoroConfigCache ?? store.get('settings').pomodoro
    if (this.state.pomodoroPhase === 'work') {
      const nextCycle = this.state.cycleCount + 1
      const isLong = nextCycle % pomodoro.cyclesBeforeLongBreak === 0
      this.state.cycleCount = nextCycle
      this.state.pomodoroPhase = isLong ? 'longBreak' : 'break'
      const minutes = isLong ? pomodoro.longBreakMinutes : pomodoro.breakMinutes
      this.state.phaseEndsAt = now + minutes * 60_000
      notifyPhaseChange(isLong ? '長休憩を始めましょう' : '休憩を始めましょう', `作業お疲れさまでした。${minutes}分休憩します。`)
    } else {
      this.state.pomodoroPhase = 'work'
      this.state.phaseEndsAt = now + pomodoro.workMinutes * 60_000
      notifyPhaseChange('作業を再開しましょう', `休憩終了です。${pomodoro.workMinutes}分の作業を始めます。`)
    }
    this.persist()
  }

  private finish() {
    const finished = this.state
    if (finished.startedAt) {
      const record: FocusRecord = {
        id: randomUUID(),
        startedAt: finished.startedAt,
        endedAt: Date.now(),
        durationMinutes: Math.round((Date.now() - finished.startedAt - finished.totalPausedMs) / 60_000),
        interruptionsBlocked: finished.interruptionsBlocked,
        mode: finished.mode,
      }
      notifyPhaseChange('セッション終了', `お疲れさまでした。${record.durationMinutes}分集中しました。`)
      const history = store.get('history')
      history.unshift(record)
      store.set('history', history.slice(0, 200))

      let updatedTodo: TodoItem | null = null
      if (finished.focusTodoId) {
        const todos = store.get('todos')
        const updated = todos.map((t) =>
          t.id === finished.focusTodoId
            ? { ...t, actualMinutes: t.actualMinutes + record.durationMinutes, updatedAt: Date.now() }
            : t,
        )
        store.set('todos', updated)
        updatedTodo = updated.find((t) => t.id === finished.focusTodoId) ?? null
      }
      this.onSessionFinished?.(record, updatedTodo)
    }
    this.teardownEnforcement()
    this.state = idleState()
    this.persist()
    this.emit()
  }

  private teardownEnforcement() {
    this.processGuard.stop()
    if (this.siteEnforceTimer) clearInterval(this.siteEnforceTimer)
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.siteEnforceTimer = null
    this.tickTimer = null
    void clearHostsBlock()
  }

  private persist() {
    store.set('session', this.state)
  }

  private emit() {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('session:update', this.state)
    }
  }
}
