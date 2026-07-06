// Builds the desktop app and publishes it as a GitHub Release (see
// apps/desktop/package.json "build.publish"), which is what electron-updater
// polls for new versions. Run this after bumping the app version whenever a
// fix should reach the already-installed app automatically.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

const ROOT = path.join(import.meta.dirname, '..')
const DESKTOP_DIR = path.join(ROOT, 'apps/desktop')

loadDotenv({ path: path.join(DESKTOP_DIR, '.env.publish') })

if (!process.env.GH_TOKEN) {
  console.error('apps/desktop/.env.publish に GH_TOKEN (repoへのContents書き込み権限を持つトークン) を設定してください。')
  process.exit(1)
}

const result = spawnSync('npm', ['run', 'build', '&&', 'electron-builder', '--win', '--publish', 'always'], {
  cwd: DESKTOP_DIR,
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

process.exit(result.status ?? 1)
