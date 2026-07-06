import { exec } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import type { VisibleApp } from '../src/shared/types.ts'

interface RawWindowProcess {
  ProcessName: string
  MainWindowTitle: string
  Path: string | null
}

// Processes we never want to suggest blocking, even though they can have a
// visible main window -- blocking your own focus app or the desktop shell
// would be a nasty footgun.
const EXCLUDED_EXE_NAMES = new Set(['explorer.exe'])

function listWindowProcesses(): Promise<RawWindowProcess[]> {
  const psCommand =
    "@(Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.Path } | " +
    'Select-Object ProcessName, MainWindowTitle, Path) | ConvertTo-Json -Depth 3 -Compress'
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -NonInteractive -Command "${psCommand}"`,
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(stdout) as RawWindowProcess | RawWindowProcess[]
          resolve(Array.isArray(parsed) ? parsed : [parsed])
        } catch {
          resolve([])
        }
      },
    )
  })
}

export async function listVisibleApps(): Promise<VisibleApp[]> {
  const raw = await listWindowProcesses()
  const selfExe = path.basename(process.execPath).toLowerCase()

  const byExePath = new Map<string, RawWindowProcess>()
  for (const proc of raw) {
    if (!proc.Path) continue
    const exeName = path.basename(proc.Path).toLowerCase()
    if (exeName === selfExe || EXCLUDED_EXE_NAMES.has(exeName)) continue
    if (!byExePath.has(proc.Path)) byExePath.set(proc.Path, proc)
  }

  const results: VisibleApp[] = []
  for (const [exePath, proc] of byExePath) {
    let iconDataUrl: string | null = null
    try {
      const icon = await app.getFileIcon(exePath, { size: 'normal' })
      iconDataUrl = icon.isEmpty() ? null : icon.toDataURL()
    } catch {
      iconDataUrl = null
    }
    results.push({
      exeName: path.basename(exePath),
      title: proc.MainWindowTitle,
      iconDataUrl,
    })
  }

  return results.sort((a, b) => a.title.localeCompare(b.title))
}
