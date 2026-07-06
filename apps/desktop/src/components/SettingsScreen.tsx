import { useEffect, useState } from 'react'
import type { AppSettings, VisibleApp, SiteFrequency } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

export function SettingsScreen({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [appInput, setAppInput] = useState('')
  const [siteInput, setSiteInput] = useState('')
  const [visibleApps, setVisibleApps] = useState<VisibleApp[]>([])
  const [showAppPicker, setShowAppPicker] = useState(false)
  const [loadingApps, setLoadingApps] = useState(false)
  const [frequentSites, setFrequentSites] = useState<SiteFrequency[]>([])
  const [showSitePicker, setShowSitePicker] = useState(false)
  const [loadingSites, setLoadingSites] = useState(false)
  const [hostsWritable, setHostsWritable] = useState<boolean | null>(null)
  const [saved, setSaved] = useState(false)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)

  useEffect(() => {
    window.zone.settings.get().then(setSettings)
    window.zone.system.checkHostsWritable().then(setHostsWritable)
    window.zone.account.getStatus().then((s) => setAccountEmail(s.email))
  }, [])

  const logout = async () => {
    await window.zone.account.logout()
    onLoggedOut()
  }

  const persist = async (next: AppSettings) => {
    setSettings(next)
    await window.zone.settings.set(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const addApp = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || settings.blockedApps.includes(trimmed)) return
    void persist({ ...settings, blockedApps: [...settings.blockedApps, trimmed] })
  }

  const removeApp = (name: string) => {
    void persist({ ...settings, blockedApps: settings.blockedApps.filter((a) => a !== name) })
  }

  const addSite = (domain: string) => {
    const trimmed = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!trimmed || settings.blockedSites.includes(trimmed)) return
    void persist({ ...settings, blockedSites: [...settings.blockedSites, trimmed] })
  }

  const removeSite = (domain: string) => {
    void persist({ ...settings, blockedSites: settings.blockedSites.filter((s) => s !== domain) })
  }

  const openAppPicker = async () => {
    setShowAppPicker(true)
    setLoadingApps(true)
    setVisibleApps(await window.zone.system.listVisibleApps())
    setLoadingApps(false)
  }

  const openSitePicker = async () => {
    setShowSitePicker(true)
    setLoadingSites(true)
    setFrequentSites(await window.zone.system.listFrequentSites())
    setLoadingSites(false)
  }

  return (
    <div className="settings-screen">
      <h2>設定</h2>
      {saved && <div className="saved-indicator">保存しました</div>}

      <section className="setup-section">
        <h3>ブロックするアプリ(実行ファイル名)</h3>
        <div className="setup-add-row">
          <input
            type="text"
            placeholder="例: steam.exe"
            value={appInput}
            onChange={(e) => setAppInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addApp(appInput)
                setAppInput('')
              }
            }}
          />
          <button
            onClick={() => {
              addApp(appInput)
              setAppInput('')
            }}
          >
            追加
          </button>
          <button onClick={() => void openAppPicker()}>起動中のアプリから選ぶ</button>
        </div>
        {showAppPicker && (
          <div className="app-picker">
            {loadingApps && <p className="hint">読み込み中…</p>}
            {!loadingApps && visibleApps.length === 0 && (
              <p className="hint">タスクバーに表示されているアプリが見つかりませんでした</p>
            )}
            {!loadingApps &&
              visibleApps.map((a) => (
                <button
                  key={a.exeName}
                  className="app-picker-item"
                  onClick={() => {
                    addApp(a.exeName)
                    setShowAppPicker(false)
                  }}
                >
                  {a.iconDataUrl ? (
                    <img src={a.iconDataUrl} alt="" className="app-picker-icon" />
                  ) : (
                    <span className="app-picker-icon app-picker-icon--placeholder" />
                  )}
                  <span className="app-picker-text">
                    <span className="app-picker-title">{a.title}</span>
                    <span className="app-picker-exe">{a.exeName}</span>
                  </span>
                </button>
              ))}
          </div>
        )}
        <ul className="chip-list">
          {settings.blockedApps.map((a) => (
            <li key={a} className="chip">
              {a}
              <button onClick={() => removeApp(a)}>×</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="setup-section">
        <h3>ブロックするWebサイト(ドメイン)</h3>
        <div className="setup-add-row">
          <input
            type="text"
            placeholder="例: youtube.com"
            value={siteInput}
            onChange={(e) => setSiteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addSite(siteInput)
                setSiteInput('')
              }
            }}
          />
          <button
            onClick={() => {
              addSite(siteInput)
              setSiteInput('')
            }}
          >
            追加
          </button>
          <button onClick={() => void openSitePicker()}>よく見るサイトから選ぶ</button>
        </div>
        {showSitePicker && (
          <div className="site-picker">
            {loadingSites && <p className="hint">閲覧履歴を読み込み中…</p>}
            {!loadingSites && frequentSites.length === 0 && (
              <p className="hint">
                閲覧履歴が見つかりませんでした(対応ブラウザ: Chrome / Edge)
              </p>
            )}
            {!loadingSites &&
              frequentSites.map((s) => (
                <button
                  key={s.domain}
                  className="site-picker-item"
                  onClick={() => {
                    addSite(s.domain)
                    setShowSitePicker(false)
                  }}
                >
                  {s.domain}
                  <span className="site-picker-visits">{s.visits}回</span>
                </button>
              ))}
          </div>
        )}
        <ul className="chip-list">
          {settings.blockedSites.map((s) => (
            <li key={s} className="chip">
              {s}
              <button onClick={() => removeSite(s)}>×</button>
            </li>
          ))}
        </ul>
        {hostsWritable === false && (
          <p className="warning">
            現在、hostsファイルへの書き込み権限がありません。管理者としてアプリを再起動するとサイトブロックが有効になります。
          </p>
        )}
      </section>

      <section className="setup-section">
        <h3>アカウント</h3>
        <p className="hint">{accountEmail ?? '確認中…'}</p>
        <p className="hint">
          TODO・スケジュール・集中履歴はこのアカウントで他の端末(Web版など)と同期されます。Googleカレンダー連携もこのアカウントのログインに含まれています。
        </p>
        <button className="danger-button" onClick={() => void logout()}>
          ログアウト
        </button>
      </section>

      <section className="setup-section">
        <h3>デフォルト値</h3>
        <label className="settings-inline-field">
          既定のセッション時間(分)
          <input
            type="number"
            min={1}
            value={settings.defaultTotalMinutes}
            onChange={(e) => void persist({ ...settings, defaultTotalMinutes: Number(e.target.value) })}
          />
        </label>
        <label className="settings-inline-field">
          離席検知の通知までの時間(分)
          <input
            type="number"
            min={1}
            value={settings.idleNudgeMinutes}
            onChange={(e) => void persist({ ...settings, idleNudgeMinutes: Number(e.target.value) })}
          />
        </label>
        <div className="pomodoro-config">
          <label>
            作業(分)
            <input
              type="number"
              min={1}
              value={settings.pomodoro.workMinutes}
              onChange={(e) =>
                void persist({ ...settings, pomodoro: { ...settings.pomodoro, workMinutes: Number(e.target.value) } })
              }
            />
          </label>
          <label>
            小休憩(分)
            <input
              type="number"
              min={1}
              value={settings.pomodoro.breakMinutes}
              onChange={(e) =>
                void persist({ ...settings, pomodoro: { ...settings.pomodoro, breakMinutes: Number(e.target.value) } })
              }
            />
          </label>
          <label>
            長休憩(分)
            <input
              type="number"
              min={1}
              value={settings.pomodoro.longBreakMinutes}
              onChange={(e) =>
                void persist({
                  ...settings,
                  pomodoro: { ...settings.pomodoro, longBreakMinutes: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            サイクル数
            <input
              type="number"
              min={1}
              value={settings.pomodoro.cyclesBeforeLongBreak}
              onChange={(e) =>
                void persist({
                  ...settings,
                  pomodoro: { ...settings.pomodoro, cyclesBeforeLongBreak: Number(e.target.value) },
                })
              }
            />
          </label>
        </div>
      </section>
    </div>
  )
}
