import { useState } from 'react'
import type { useAuth } from '../hooks/useAuth'

export function LoginPage({ login }: { login: ReturnType<typeof useAuth>['login'] }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    const result = await login(email, password)
    if (!result.ok) setError(result.error ?? 'ログインに失敗しました')
    setSubmitting(false)
  }

  return (
    <div className="login-page">
      <h1 className="login-logo">zone</h1>
      <p className="login-tagline">チーム管理ダッシュボード</p>
      <form
        className="login-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label>
          メールアドレス
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          パスワード
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="warning">{error}</p>}
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
      <p className="hint">
        アカウントはデスクトップアプリで招待コードを使って作成してください。管理者・従業員とも同じログイン情報でここから閲覧できます。
      </p>
    </div>
  )
}
