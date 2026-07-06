import { useEffect, useState } from 'react'
import type { SessionState } from '../shared/types'

const IDLE_STATE: SessionState = {
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

export function useSessionState() {
  const [state, setState] = useState<SessionState>(IDLE_STATE)

  useEffect(() => {
    let cancelled = false
    window.zone.session.get().then((s) => {
      if (!cancelled) setState(s)
    })
    const unsubscribe = window.zone.session.onUpdate((s) => setState(s))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
