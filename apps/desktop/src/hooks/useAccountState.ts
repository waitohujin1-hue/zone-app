import { useCallback, useEffect, useState } from 'react'
import type { AccountAuthStatus } from '../shared/types'

const SIGNED_OUT: AccountAuthStatus = { loggedIn: false, email: null }

export function useAccountState() {
  const [status, setStatus] = useState<AccountAuthStatus>(SIGNED_OUT)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const s = await window.zone.account.getStatus()
    setStatus(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, loading, refresh }
}
