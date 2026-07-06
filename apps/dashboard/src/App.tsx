import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom'
import './App.css'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { SelfViewPage } from './pages/SelfViewPage'
import { TeamOverviewPage } from './pages/TeamOverviewPage'
import { MemberPage } from './pages/MemberPage'
import { SeatsPage } from './pages/SeatsPage'

function App() {
  const auth = useAuth()

  if (auth.loading) {
    return <div className="app" />
  }

  if (!auth.userId) {
    return (
      <div className="app">
        <LoginPage login={auth.login} />
      </div>
    )
  }

  if (!auth.orgId) {
    return (
      <div className="app">
        <p className="hint">所属する組織が見つかりません。管理者に招待コードを発行してもらってください。</p>
      </div>
    )
  }

  const isAdmin = auth.role === 'admin'

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <span className="app-logo">zone</span>
          <nav className="app-nav">
            {isAdmin && <Link to="/team">チーム概要</Link>}
            {isAdmin && <Link to="/seats">シート管理</Link>}
            {!isAdmin && <Link to="/me">自分の統計</Link>}
          </nav>
          <div className="app-header-org">
            <span className="app-header-org-name">{auth.orgName}</span>
            <button className="link-button" onClick={() => void auth.logout()}>
              ログアウト
            </button>
          </div>
        </header>
        <main className="app-main">
          <Routes>
            {isAdmin ? (
              <>
                <Route path="/team" element={<TeamOverviewPage orgId={auth.orgId} />} />
                <Route path="/team/:userId" element={<MemberPage orgId={auth.orgId} />} />
                <Route path="/seats" element={<SeatsPage orgId={auth.orgId} />} />
                <Route path="*" element={<Navigate to="/team" replace />} />
              </>
            ) : (
              <>
                <Route path="/me" element={<SelfViewPage orgId={auth.orgId} userId={auth.userId} />} />
                <Route path="*" element={<Navigate to="/me" replace />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
