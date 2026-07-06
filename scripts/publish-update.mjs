// Uploads the latest apps/desktop/release/* build artifacts (installer .exe,
// .blockmap, latest.yml) to the Supabase Storage bucket that electron-updater
// polls for updates (see apps/desktop/package.json "build.publish"). Run this
// after `npm run desktop:dist:win` whenever the app version was bumped.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

const ROOT = path.join(import.meta.dirname, '..')
loadDotenv({ path: path.join(ROOT, 'apps/desktop/.env.publish') })

const SUPABASE_URL = process.env.ZONE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.ZONE_SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'app-updates'
const RELEASE_DIR = path.join(ROOT, 'apps/desktop/release')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'apps/desktop/.env.publish に ZONE_SUPABASE_URL と ZONE_SUPABASE_SERVICE_ROLE_KEY を設定してください。',
  )
  process.exit(1)
}

const UPLOAD_EXTENSIONS = new Set(['.exe', '.blockmap', '.yml'])

const entries = await readdir(RELEASE_DIR, { withFileTypes: true })
const files = entries.filter((e) => e.isFile() && UPLOAD_EXTENSIONS.has(path.extname(e.name)))

if (files.length === 0) {
  console.error(`${RELEASE_DIR} にアップロード対象のファイルが見つかりません。先に npm run desktop:dist:win を実行してください。`)
  process.exit(1)
}

for (const file of files) {
  const filePath = path.join(RELEASE_DIR, file.name)
  const body = await readFile(filePath)
  const objectPath = encodeURIComponent(file.name)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body,
  })
  if (!res.ok) {
    console.error(`アップロード失敗: ${file.name} (${res.status}) ${await res.text()}`)
    process.exit(1)
  }
  console.log(`アップロード完了: ${file.name}`)
}

console.log('公開完了。')
