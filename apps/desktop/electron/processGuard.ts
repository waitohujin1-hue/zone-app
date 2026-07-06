import { exec } from 'node:child_process'

const SAFE_EXE_NAME = /^[a-zA-Z0-9_.\- ]+\.exe$/

function listRunningProcesses(): Promise<string[]> {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV /NH', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        resolve([])
        return
      }
      const names = stdout
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(/^"([^"]+)"/)
          return match ? match[1] : ''
        })
        .filter(Boolean)
      resolve(names)
    })
  })
}

function killProcess(name: string) {
  if (!SAFE_EXE_NAME.test(name)) return
  exec(`taskkill /IM "${name}" /F`, { windowsHide: true }, () => {})
}

export class ProcessGuard {
  private timer: ReturnType<typeof setInterval> | null = null
  private blockedApps: string[] = []
  private onBlock: (name: string) => void = () => {}

  start(blockedApps: string[], onBlock: (name: string) => void) {
    this.blockedApps = blockedApps
      .map((n) => n.trim().toLowerCase())
      .filter((n) => SAFE_EXE_NAME.test(n))
    this.onBlock = onBlock
    this.stop()
    void this.tick()
    this.timer = setInterval(() => void this.tick(), 2000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.blockedApps = []
  }

  private async tick() {
    if (this.blockedApps.length === 0) return
    const running = await listRunningProcesses()
    for (const proc of running) {
      if (this.blockedApps.includes(proc.toLowerCase())) {
        killProcess(proc)
        this.onBlock(proc)
      }
    }
  }
}
