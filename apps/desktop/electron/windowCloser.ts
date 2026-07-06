import { exec } from 'node:child_process'

const SAFE_DOMAIN = /^[a-zA-Z0-9.-]+$/

function escapeForRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function closeWindowsMatchingSites(domains: string[]) {
  const safe = domains.map((d) => d.trim().toLowerCase()).filter((d) => SAFE_DOMAIN.test(d))
  if (safe.length === 0) return
  const pattern = safe.map((d) => escapeForRegex(d)).join('|')
  const psCommand =
    `Get-Process | Where-Object { $_.MainWindowTitle -match '${pattern}' } | ` +
    `ForEach-Object { $_.CloseMainWindow() | Out-Null }`
  exec(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`, { windowsHide: true }, () => {})
}
