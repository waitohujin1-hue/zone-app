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
