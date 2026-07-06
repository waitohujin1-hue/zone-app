import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '../shared/types'
import { playBreakChime, playWorkChime } from '../lib/chime'

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
  const prevPhaseRef = useRef<SessionState['pomodoroPhase']>(null)

  const applyUpdate = (s: SessionState) => {
    const prevPhase = prevPhaseRef.current
    if (s.active && prevPhase !== null && s.pomodoroPhase !== null && s.pomodoroPhase !== prevPhase) {
      if (s.pomodoroPhase === 'work') playWorkChime()
      else playBreakChime()
    }
    prevPhaseRef.current = s.pomodoroPhase
    setState(s)
  }

  useEffect(() => {
    let cancelled = false
    window.zone.session.get().then((s) => {
      if (!cancelled) applyUpdate(s)
    })
    const unsubscribe = window.zone.session.onUpdate((s) => applyUpdate(s))
    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
