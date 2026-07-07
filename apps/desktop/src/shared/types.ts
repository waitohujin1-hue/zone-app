export type SessionMode = 'simple' | 'pomodoro'
export type PomodoroPhase = 'work' | 'break' | 'longBreak'

export interface PomodoroConfig {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
}

export interface SessionConfig {
  mode: SessionMode
  totalMinutes: number
  pomodoro: PomodoroConfig
  blockedApps: string[]
  blockedSites: string[]
  focusTaskText?: string
  focusTodoId?: string
}

export interface SessionState {
  active: boolean
  startedAt: number | null
  endsAt: number | null
  mode: SessionMode
  pomodoroPhase: PomodoroPhase | null
  phaseEndsAt: number | null
  cycleCount: number
  blockedApps: string[]
  blockedSites: string[]
  focusTaskText: string | null
  focusTodoId: string | null
  interruptionsBlocked: number
  hostsBlockActive: boolean
  idleSeconds: number
  idleNudgeSeconds: number
}

/** Priority rank -- lower number = higher priority (1 is top priority). null = unranked. */
export type TodoPriority = number | null

export interface TodoItem {
  id: string
  text: string
  done: boolean
  createdAt: number
  updatedAt: number
  estimatedMinutes: number | null
  actualMinutes: number
  priority: TodoPriority
}

export interface FocusRecord {
  id: string
  startedAt: number
  endedAt: number
  durationMinutes: number
  interruptionsBlocked: number
  mode: SessionMode
}

export interface AppSettings {
  blockedApps: string[]
  blockedSites: string[]
  defaultTotalMinutes: number
  pomodoro: PomodoroConfig
  idleNudgeMinutes: number
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
}

export const DEFAULT_SETTINGS: AppSettings = {
  blockedApps: [],
  blockedSites: [],
  defaultTotalMinutes: 25,
  pomodoro: DEFAULT_POMODORO,
  idleNudgeMinutes: 5,
}

export interface VisibleApp {
  exeName: string
  title: string
  iconDataUrl: string | null
}

export interface SiteFrequency {
  domain: string
  visits: number
}

export type BlockSource = 'zone' | 'google'

export interface ScheduleBlock {
  id: string
  date: string
  startMinutes: number
  durationMinutes: number
  title: string
  todoId?: string
  source: BlockSource
  googleEventId?: string | null
  googleUpdatedAt?: string | null
  syncStatus?: 'synced' | 'pending' | 'error'
  lastModified: number
  createdAt: number
}

export interface CreateScheduleBlockInput {
  date: string
  startMinutes: number
  durationMinutes: number
  title: string
  todoId?: string
}

export interface UpdateScheduleBlockInput {
  title?: string
  startMinutes?: number
  durationMinutes?: number
  todoId?: string | null
}

export interface AccountAuthStatus {
  loggedIn: boolean
  email: string | null
}

export interface AccountLoginResult {
  ok: boolean
  error?: string
}

export interface ZoneApi {
  session: {
    get: () => Promise<SessionState>
    start: (config: SessionConfig) => Promise<SessionState>
    onUpdate: (cb: (state: SessionState) => void) => () => void
    /** Debug-only: force-ends the active session immediately. */
    debugStop: () => Promise<void>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (settings: AppSettings) => Promise<void>
  }
  todos: {
    list: () => Promise<TodoItem[]>
    add: (text: string, estimatedMinutes: number | null) => Promise<TodoItem[]>
    toggle: (id: string) => Promise<TodoItem[]>
    remove: (id: string) => Promise<TodoItem[]>
    reorder: (orderedIds: string[]) => Promise<TodoItem[]>
    rename: (id: string, text: string) => Promise<TodoItem[]>
    setEstimate: (id: string, minutes: number | null) => Promise<TodoItem[]>
  }
  history: {
    list: () => Promise<FocusRecord[]>
  }
  system: {
    listVisibleApps: () => Promise<VisibleApp[]>
    listFrequentSites: () => Promise<SiteFrequency[]>
    checkHostsWritable: () => Promise<boolean>
  }
  schedule: {
    listForDate: (date: string) => Promise<ScheduleBlock[]>
    create: (input: CreateScheduleBlockInput) => Promise<ScheduleBlock[]>
    update: (id: string, patch: UpdateScheduleBlockInput) => Promise<ScheduleBlock[]>
    remove: (id: string) => Promise<ScheduleBlock[]>
    addToTodoList: (id: string) => Promise<ScheduleBlock[]>
    pullGoogle: (date: string) => Promise<void>
  }
  account: {
    getStatus: () => Promise<AccountAuthStatus>
    loginWithGoogle: () => Promise<AccountLoginResult>
    logout: () => Promise<void>
  }
}
