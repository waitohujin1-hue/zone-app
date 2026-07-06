import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface MembershipRow {
  id: string
  userId: string | null
  email: string | null
  invitedEmail: string | null
  role: string
  status: string
}

interface InviteRow {
  id: string
  code: string
  role: string
  usedCount: number
  maxUses: number
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0/O, 1/I)

function generateCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return `ZONE-${code}`
}

export function SeatsPage({ orgId }: { orgId: string }) {
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [generating, setGenerating] = useState(false)

  const reload = async () => {
    const [{ data: memberData }, { data: inviteData }] = await Promise.all([
      supabase
        .from('memberships')
        .select('id, user_id, email, invited_email, role, status')
        .eq('org_id', orgId),
      supabase.from('org_invites').select('id, code, role, used_count, max_uses').eq('org_id', orgId),
    ])
    setMemberships(
      (memberData ?? []).map((m) => ({
        id: m.id,
        userId: m.user_id,
        email: m.email,
        invitedEmail: m.invited_email,
        role: m.role,
        status: m.status,
      })),
    )
    setInvites(
      (inviteData ?? []).map((i) => ({ id: i.id, code: i.code, role: i.role, usedCount: i.used_count, maxUses: i.max_uses })),
    )
  }

  useEffect(() => {
    void reload()
  }, [orgId])

  const createInvite = async () => {
    setGenerating(true)
    try {
      await supabase.from('org_invites').insert({ org_id: orgId, code: generateCode(), role: 'member', max_uses: 1 })
      await reload()
    } finally {
      setGenerating(false)
    }
  }

  const deactivate = async (membershipId: string) => {
    await supabase
      .from('memberships')
      .update({ status: 'removed', removed_at: new Date().toISOString() })
      .eq('id', membershipId)
    await reload()
  }

  return (
    <div>
      <h2>シート管理</h2>

      <section className="setup-section">
        <h3>招待コード</h3>
        <button className="primary-button" onClick={() => void createInvite()} disabled={generating}>
          {generating ? '発行中…' : '新しい招待コードを発行'}
        </button>
        <ul className="chip-list">
          {invites.map((i) => (
            <li key={i.id} className="chip">
              {i.code}({i.usedCount}/{i.maxUses}使用)
            </li>
          ))}
        </ul>
      </section>

      <section className="setup-section">
        <h3>メンバー</h3>
        <table className="history-table">
          <thead>
            <tr>
              <th>メール</th>
              <th>ロール</th>
              <th>ステータス</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.id}>
                <td>{m.email ?? m.invitedEmail ?? '(不明)'}</td>
                <td>{m.role === 'admin' ? '管理者' : 'メンバー'}</td>
                <td>{m.status}</td>
                <td>
                  {m.status === 'active' && (
                    <button className="link-button" onClick={() => void deactivate(m.id)}>
                      無効化
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
