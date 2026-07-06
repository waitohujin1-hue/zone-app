import { DatabaseSync } from 'node:sqlite'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { SiteFrequency } from '../src/shared/types.ts'

// Chromium-based browsers share the same "History" SQLite schema (an `urls`
// table with url/visit_count). Firefox uses a different schema (places.sqlite)
// and isn't covered here -- a reasonable scope cut for a first pass.
const CHROMIUM_HISTORY_PATHS = [
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'History'),
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'History'),
]

const IGNORED_HOSTNAMES = new Set(['localhost'])

function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.protocol.startsWith('http')) return null
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (!host || IGNORED_HOSTNAMES.has(host)) return null
    return host
  } catch {
    return null
  }
}

async function readChromiumHistory(historyPath: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  let tempPath: string | null = null
  try {
    await fs.access(historyPath)
    // Chrome/Edge keep this file open and locked while running, so we read
    // from a copy rather than the live file.
    tempPath = path.join(os.tmpdir(), `zone-history-${randomUUID()}.sqlite`)
    await fs.copyFile(historyPath, tempPath)
    const db = new DatabaseSync(tempPath, { readOnly: true })
    try {
      const rows = db
        .prepare('SELECT url, visit_count FROM urls ORDER BY visit_count DESC LIMIT 500')
        .all() as { url: string; visit_count: number }[]
      for (const row of rows) {
        const host = extractHostname(row.url)
        if (!host) continue
        counts.set(host, (counts.get(host) ?? 0) + row.visit_count)
      }
    } finally {
      db.close()
    }
  } catch {
    // Browser not installed, no profile yet, or history unreadable -- skip.
  } finally {
    if (tempPath) await fs.unlink(tempPath).catch(() => {})
  }
  return counts
}

export async function listFrequentSites(limit = 20): Promise<SiteFrequency[]> {
  const totals = new Map<string, number>()
  for (const historyPath of CHROMIUM_HISTORY_PATHS) {
    const counts = await readChromiumHistory(historyPath)
    for (const [host, visits] of counts) {
      totals.set(host, (totals.get(host) ?? 0) + visits)
    }
  }
  return Array.from(totals.entries())
    .map(([domain, visits]) => ({ domain, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
}
