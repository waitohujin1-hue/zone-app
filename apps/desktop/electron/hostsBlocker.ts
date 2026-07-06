import { promises as fs } from 'node:fs'
import { exec } from 'node:child_process'
import path from 'node:path'

const HOSTS_PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
const MARK_START = '# zone-block-start'
const MARK_END = '# zone-block-end'
const SAFE_DOMAIN = /^[a-zA-Z0-9.-]+$/

function flushDns() {
  exec('ipconfig /flushdns', { windowsHide: true }, () => {})
}

async function readHosts(): Promise<string> {
  try {
    return await fs.readFile(HOSTS_PATH, 'utf-8')
  } catch {
    return ''
  }
}

function stripBlock(content: string): string {
  const startIdx = content.indexOf(MARK_START)
  const endIdx = content.indexOf(MARK_END)
  if (startIdx === -1 || endIdx === -1) return content
  return content.slice(0, startIdx) + content.slice(endIdx + MARK_END.length)
}

export async function applyHostsBlock(domains: string[]): Promise<{ ok: boolean; error?: string }> {
  const safeDomains = domains.map((d) => d.trim().toLowerCase()).filter((d) => SAFE_DOMAIN.test(d))
  const current = await readHosts()
  const cleaned = stripBlock(current).trimEnd()
  const lines = safeDomains.flatMap((d) => [`0.0.0.0 ${d}`, `0.0.0.0 www.${d}`])
  const block = safeDomains.length > 0 ? `\n${MARK_START}\n${lines.join('\n')}\n${MARK_END}\n` : '\n'
  try {
    await fs.writeFile(HOSTS_PATH, `${cleaned}${block}`, 'utf-8')
    flushDns()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearHostsBlock(): Promise<{ ok: boolean; error?: string }> {
  return applyHostsBlock([])
}
