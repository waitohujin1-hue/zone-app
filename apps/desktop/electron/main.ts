import { config as loadDotenv } from 'dotenv'
import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionManager } from './session.ts'
import { registerIpcHandlers } from './ipc.ts'
import { pushFocusRecord, pushTodoUpsert, pullAccountData } from './accountSync.ts'
import { store } from './store.ts'
import { initAutoUpdate, checkForUpdatesManually } from './autoUpdate.ts'
import { openReleaseNotesWindow } from './releaseNotes.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

const ACCOUNT_PULL_INTERVAL_MS = 2 * 60 * 1000

// In dev this reads apps/desktop/.env; in a packaged build, electron-builder's
// extraResources copies .env next to the app so it can be swapped per-deployment
// without rebuilding (see package.json's "build.extraResources"). Used for the
// Supabase project (account login/sync) and the Google OAuth client used to
// refresh the calendar token obtained during account login (see accountAuth.ts).
loadDotenv({ path: app.isPackaged ? path.join(process.resourcesPath, '.env') : path.join(APP_ROOT, '.env') })

let win: BrowserWindow | null = null
let sessionManager: SessionManager

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 600,
    title: 'zone',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('close', (event) => {
    if (sessionManager.getState().active) {
      event.preventDefault()
      win?.minimize()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function buildAppMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: 'ヘルプ',
        submenu: [
          {
            label: 'リリースノート',
            click: () => openReleaseNotesWindow(APP_ROOT),
          },
          {
            label: 'アップデートを確認',
            click: () => void checkForUpdatesManually(win),
          },
        ],
      },
    ]),
  )
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (sessionManager?.getState().active) {
    event.preventDefault()
  }
})

app.whenReady().then(() => {
  sessionManager = new SessionManager(() => win, (record, updatedTodo) => {
    void pushFocusRecord(record)
    if (updatedTodo) void pushTodoUpsert(updatedTodo, store.get('todos').findIndex((t) => t.id === updatedTodo.id))
  })
  registerIpcHandlers(sessionManager)
  buildAppMenu()
  createWindow()
  initAutoUpdate(() => win)

  void pullAccountData()
  setInterval(() => void pullAccountData(), ACCOUNT_PULL_INTERVAL_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
