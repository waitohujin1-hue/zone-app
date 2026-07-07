// electron-updater is a CommonJS module; Node's ESM loader can't statically
// detect its named exports, so it must be imported as a default and
// destructured at runtime instead of `import { autoUpdater } from '...'`.
import electronUpdater from 'electron-updater'
import { app, dialog, type BrowserWindow } from 'electron'

const { autoUpdater } = electronUpdater

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// Packaged builds only -- in dev there's no NSIS installer for electron-updater
// to install, and it would just fail looking for app-update.yml.
export function initAutoUpdate(getWin: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-downloaded', (info) => {
    const win = getWin()
    dialog
      .showMessageBox(win ?? undefined as unknown as BrowserWindow, {
        type: 'info',
        title: 'アップデートの準備ができました',
        message: `新しいバージョン(${info.version})に更新できます。今すぐ再起動して更新しますか?`,
        buttons: ['今すぐ再起動', '後で(次回起動時に適用)'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  // Update check failures (offline, host unreachable, etc.) must never
  // interrupt the app -- this mirrors the same fire-and-forget principle
  // used for account/calendar sync elsewhere.
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdate] check failed:', err)
  })

  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}

// Unlike the silent background check above, this one is user-triggered (via
// the help menu) and always reports its outcome -- there's otherwise no way
// to tell a "no update available" result apart from a swallowed failure.
export async function checkForUpdatesManually(win: BrowserWindow | null): Promise<void> {
  const parent = win ?? (undefined as unknown as BrowserWindow)
  if (!app.isPackaged) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      title: 'アップデートの確認',
      message: '開発モードではアップデートを確認できません。',
    })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const latestVersion = result?.updateInfo.version
    if (latestVersion && latestVersion !== app.getVersion()) {
      await dialog.showMessageBox(parent, {
        type: 'info',
        title: 'アップデートの確認',
        message: `新しいバージョン(${latestVersion})が見つかりました。ダウンロードが完了すると再起動を確認するダイアログが表示されます。`,
      })
    } else {
      await dialog.showMessageBox(parent, {
        type: 'info',
        title: 'アップデートの確認',
        message: `現在お使いのバージョン(${app.getVersion()})が最新です。`,
      })
    }
  } catch (err) {
    await dialog.showMessageBox(parent, {
      type: 'error',
      title: 'アップデートの確認に失敗しました',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
