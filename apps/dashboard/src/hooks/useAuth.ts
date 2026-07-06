import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { MembershipRole } from '@zone/shared-types'

export interface AuthState {
  loading: boolean
  userId: string | null
  email: string | null
  orgId: string | null
  orgName: string | null
  role: MembershipRole | null
}

const EMPTY: AuthState = { loading: true, userId: null, email: null, orgId: null, orgName: null, role: null }

async function loadMembership(userId: string, email: string | undefined): Promise<AuthState> {
  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) {
    return { loading: false, userId, email: email ?? null, orgId: null, orgName: null, role: null }
  }

  const { data: org } = await supabase.from('organizations').select('name').eq('id', membership.org_id).maybeSingle()

  return {
    loading: false,
    userId,
    email: email ?? null,
    orgId: membership.org_id,
    orgName: org?.name ?? null,
    role: membership.role as MembershipRole,
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(EMPTY)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) setState({ ...EMPTY, loading: false })
        return
      }
      const next = await loadMembership(session.user.id, session.user.email)
      if (!cancelled) setState(next)
    }
    void init()

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState({ ...EMPTY, loading: false })
        return
      }
      void loadMembership(session.user.id, session.user.email).then((next) => {
        if (!cancelled) setState(next)
      })
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { ok: !error, error: error?.message }
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  return { ...state, login, logout }
}
