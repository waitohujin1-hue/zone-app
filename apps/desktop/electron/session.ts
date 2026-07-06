import { powerMonitor } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { store } from './store.ts'
import { ProcessGuard } from './processGuard.ts'
import { applyHostsBlock, clearHostsBlock } from './hostsBlocker.ts'
import { closeWindowsMatchingSites } from './windowCloser.ts'
import type { SessionConfig, SessionState, PomodoroConfig, FocusRecord, TodoItem } from '../src/shared/types.ts'

const TICK_MS = 1000
const SITE_ENFORCE_MS = 2000

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

  async start(config: SessionConfig): Promise<SessionState> {
    if (this.state.active) return this.state
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
    if (this.state.endsAt !== null && now >= this.state.endsAt) {
      this.finish()
      return
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
    } else {
      this.state.pomodoroPhase = 'work'
      this.state.phaseEndsAt = now + pomodoro.workMinutes * 60_000
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
        durationMinutes: Math.round((Date.now() - finished.startedAt) / 60_000),
        interruptionsBlocked: finished.interruptionsBlocked,
        mode: finished.mode,
      }
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
