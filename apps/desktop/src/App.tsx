import { useState } from 'react'
import './App.css'
import { useSessionState } from './hooks/useSessionState'
import { useAccountState } from './hooks/useAccountState'
import { AccountLoginScreen } from './components/AccountLoginScreen'
import { SetupScreen, type SetupPrefill } from './components/SetupScreen'
import { SessionScreen } from './components/SessionScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { StatsScreen } from './components/StatsScreen'
import { TodoPanel } from './components/TodoPanel'
import { TimelineScreen } from './components/timeline/TimelineScreen'

type Tab = 'setup' | 'timeline' | 'todo' | 'settings' | 'stats'

const TAB_LABELS: Record<Tab, string> = {
  setup: 'セッション開始',
  timeline: 'タイムライン',
  todo: 'TODO',
  settings: '設定',
  stats: '統計',
}

function App() {
  const session = useSessionState()
  const { status: account, loading: accountLoading, refresh: refreshAccount } = useAccountState()
  const [tab, setTab] = useState<Tab>('setup')
  const [prefill, setPrefill] = useState<SetupPrefill | null>(null)

  if (accountLoading) {
    return <div className="app" />
  }

  if (!account.loggedIn) {
    return (
      <div className="app">
        <main className="app-main">
          <AccountLoginScreen onLoggedIn={() => void refreshAccount()} />
        </main>
      </div>
    )
  }

  if (session.active) {
    return (
      <div className="app app--locked">
        <header className="app-header">
          <span className="app-logo">zone</span>
        </header>
        <main className="app-main">
          <SessionScreen session={session} />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">zone</span>
        <nav className="app-nav">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? 'nav-button nav-button--active' : 'nav-button'}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>
      <main className={tab === 'timeline' ? 'app-main app-main--wide' : 'app-main'}>
        {tab === 'setup' && <SetupScreen onGoToSettings={() => setTab('settings')} prefill={prefill} />}
        {tab === 'timeline' && (
          <TimelineScreen
            onStartSession={(input) => {
              setPrefill({
                todoId: input.todoId,
                taskText: input.taskText,
                minutes: input.minutes,
                requestId: Date.now(),
              })
              setTab('setup')
            }}
          />
        )}
        {tab === 'todo' && <TodoPanel />}
        {tab === 'settings' && <SettingsScreen onLoggedOut={() => void refreshAccount()} />}
        {tab === 'stats' && <StatsScreen />}
      </main>
    </div>
  )
}

export default App
