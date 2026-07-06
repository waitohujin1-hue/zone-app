import { useEffect, useState } from 'react'
import type { AppSettings, SessionMode, PomodoroConfig, TodoItem } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

const DURATION_PRESETS = [15, 25, 45, 60, 90]

export interface SetupPrefill {
  todoId?: string
  taskText: string
  minutes: number
  requestId: number
}

export function SetupScreen({
  onGoToSettings,
  prefill,
}: {
  onGoToSettings: () => void
  prefill?: SetupPrefill | null
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [totalMinutes, setTotalMinutes] = useState(25)
  const [mode, setMode] = useState<SessionMode>('simple')
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>(DEFAULT_SETTINGS.pomodoro)
  const [focusTaskText, setFocusTaskText] = useState('')
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [focusTodoId, setFocusTodoId] = useState('')
  const [starting, setStarting] = useState(false)
  const [hostsWritable, setHostsWritable] = useState<boolean | null>(null)

  useEffect(() => {
    window.zone.settings.get().then((s) => {
      setSettings(s)
      setTotalMinutes(s.defaultTotalMinutes)
      setPomodoro(s.pomodoro)
    })
    window.zone.system.checkHostsWritable().then(setHostsWritable)
    window.zone.todos.list().then(setTodos)
  }, [])

  useEffect(() => {
    if (!prefill) return
    setTotalMinutes(prefill.minutes)
    if (prefill.todoId) {
      setFocusTodoId(prefill.todoId)
    } else {
      setFocusTodoId('')
      setFocusTaskText(prefill.taskText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.requestId])

  const start = async () => {
    setStarting(true)
    try {
      await window.zone.session.start({
        mode,
        totalMinutes,
        pomodoro,
        blockedApps: settings.blockedApps,
        blockedSites: settings.blockedSites,
        focusTodoId: focusTodoId || undefined,
        focusTaskText: focusTodoId ? undefined : focusTaskText.trim() || undefined,
      })
    } finally {
      setStarting(false)
    }
  }

  const incompleteTodos = todos.filter((t) => !t.done)

  return (
    <div className="setup-screen">
      <h2>集中セッションを開始</h2>

      <section className="setup-section">
        <h3>時間</h3>
        <div className="preset-row">
          {DURATION_PRESETS.map((m) => (
            <button
              key={m}
              className={m === totalMinutes ? 'preset preset--active' : 'preset'}
              onClick={() => setTotalMinutes(m)}
            >
              {m}分
            </button>
          ))}
          <input
            type="number"
            min={1}
            className="preset-custom"
            value={totalMinutes}
            onChange={(e) => setTotalMinutes(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <p className="hint">開始すると、この時間が経過するまでセッションを止めることはできません。</p>
      </section>

      <section className="setup-section">
        <h3>モード</h3>
        <div className="mode-row">
          <label>
            <input type="radio" checked={mode === 'simple'} onChange={() => setMode('simple')} />
            シンプルタイマー
          </label>
          <label>
            <input type="radio" checked={mode === 'pomodoro'} onChange={() => setMode('pomodoro')} />
            ポモドーロ
          </label>
        </div>
        {mode === 'pomodoro' && (
          <div className="pomodoro-config">
            <label>
              作業(分)
              <input
                type="number"
                min={1}
                value={pomodoro.workMinutes}
                onChange={(e) => setPomodoro({ ...pomodoro, workMinutes: Number(e.target.value) })}
              />
            </label>
            <label>
              小休憩(分)
              <input
                type="number"
                min={1}
                value={pomodoro.breakMinutes}
                onChange={(e) => setPomodoro({ ...pomodoro, breakMinutes: Number(e.target.value) })}
              />
            </label>
            <label>
              長休憩(分)
              <input
                type="number"
                min={1}
                value={pomodoro.longBreakMinutes}
                onChange={(e) => setPomodoro({ ...pomodoro, longBreakMinutes: Number(e.target.value) })}
              />
            </label>
            <label>
              サイクル数
              <input
                type="number"
                min={1}
                value={pomodoro.cyclesBeforeLongBreak}
                onChange={(e) => setPomodoro({ ...pomodoro, cyclesBeforeLongBreak: Number(e.target.value) })}
              />
            </label>
          </div>
        )}
      </section>

      <section className="setup-section">
        <h3>今回のフォーカスタスク(任意)</h3>
        <select
          className="focus-task-select"
          value={focusTodoId}
          onChange={(e) => setFocusTodoId(e.target.value)}
        >
          <option value="">(TODOから選ばず自由入力する)</option>
          {incompleteTodos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.text}
              {t.estimatedMinutes != null ? `(見積${t.estimatedMinutes}分)` : ''}
            </option>
          ))}
        </select>
        {!focusTodoId && (
          <input
            type="text"
            className="focus-task-input"
            placeholder="例: 資料のドラフトを書き上げる"
            value={focusTaskText}
            onChange={(e) => setFocusTaskText(e.target.value)}
          />
        )}
        {focusTodoId && (
          <p className="hint">
            このセッションの実働時間は、選択したTODOの実績時間として記録されます。
          </p>
        )}
      </section>

      <section className="setup-section">
        <h3>ブロック対象</h3>
        <p className="hint">
          アプリ {settings.blockedApps.length} 件・サイト {settings.blockedSites.length} 件を設定中。
          <button className="link-button" onClick={onGoToSettings}>
            設定を編集
          </button>
        </p>
        {hostsWritable === false && (
          <p className="warning">
            サイトブロックには管理者権限が必要です。アプリを「管理者として実行」で起動し直してください。
          </p>
        )}
      </section>

      <button className="start-button" onClick={() => void start()} disabled={starting}>
        {starting ? '開始中…' : 'セッションを開始する'}
      </button>
    </div>
  )
}
