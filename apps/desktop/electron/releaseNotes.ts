import { app, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// CHANGELOG.md ships next to package.json; in dev that's apps/desktop itself,
// in a packaged build electron-builder's extraResources copies it alongside
// .env (see package.json's "build.extraResources").
function readChangelog(appRoot: string): string {
  const notesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'CHANGELOG.md')
    : path.join(appRoot, 'CHANGELOG.md')
  try {
    return readFileSync(notesPath, 'utf-8')
  } catch {
    return 'リリースノートを読み込めませんでした。'
  }
}

export function openReleaseNotesWindow(appRoot: string): void {
  const content = readChangelog(appRoot)
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>リリースノート</title>
    <style>
      body { background: #111318; color: #e8eaed; font-family: -apple-system, "Segoe UI", sans-serif; padding: 24px; margin: 0; }
      pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; line-height: 1.7; margin: 0; }
    </style>
  </head>
  <body>
    <pre>${escapeHtml(content)}</pre>
  </body>
</html>`

  const win = new BrowserWindow({ width: 520, height: 640, title: 'リリースノート', autoHideMenuBar: true })
  win.setMenu(null)
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}
