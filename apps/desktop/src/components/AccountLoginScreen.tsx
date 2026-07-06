import { useState } from 'react'

export function AccountLoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.zone.account.loginWithGoogle()
      if (result.ok) {
        onLoggedIn()
      } else {
        setError(result.error ?? 'ログインに失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-login-screen">
      <h1 className="account-login-logo">zone</h1>
      <p className="account-login-tagline">最新の科学を基にあなたの集中をサポート</p>
      {error && <p className="warning">{error}</p>}
      <button className="start-button" onClick={() => void login()} disabled={loading}>
        {loading ? 'ブラウザで認可してください…' : 'Googleでログイン'}
      </button>
      <p className="hint">
        ログインすると、TODO・スケジュール・集中履歴がWeb版など他の端末とも同期されます。同じ画面でGoogleカレンダーへのアクセスも許可され、タイムラインの同期がすぐ使えるようになります。
      </p>
    </div>
  )
}
