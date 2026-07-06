import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useFocusStats } from '../hooks/useFocusStats'
import { FocusStatsView } from '../components/FocusStatsView'

export function MemberPage({ orgId }: { orgId: string }) {
  const { userId } = useParams<{ userId: string }>()
  const [email, setEmail] = useState('')
  const { totals, loading } = useFocusStats(orgId, userId, 7)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('memberships')
      .select('email')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setEmail(data?.email ?? ''))
  }, [orgId, userId])

  return (
    <div>
      <Link to="/team" className="link-button">
        ← チーム概要に戻る
      </Link>
      {/*
        Same FocusStatsView component as the employee's own self-view page --
        an admin never sees more detail about a person than that person sees
        about themselves.
      */}
      <FocusStatsView title={`${email || 'メンバー'}の集中スタッツ`} totals={totals} loading={loading} />
    </div>
  )
}
