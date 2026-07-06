import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface StoredAccountAuth {
  userId: string
  email: string | null
  supabaseAccessToken: string
  supabaseRefreshToken: string
  // Google's own tokens, captured once from the unified sign-in consent
  // (see accountAuth.ts) -- Supabase does not refresh these on its own, so
  // this app manages the refresh cycle itself, same as before.
  googleAccessToken: string | null
  googleRefreshToken: string | null
  googleAccessTokenExpiresAt: number | null
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'account-auth.enc')
}

export async function readAccountAuth(): Promise<StoredAccountAuth | null> {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const encrypted = await fs.readFile(filePath())
    return JSON.parse(safeStorage.decryptString(encrypted)) as StoredAccountAuth
  } catch {
    return null
  }
}

export async function writeAccountAuth(auth: StoredAccountAuth): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('この端末では認証情報の暗号化保存に対応していません')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(auth))
  await fs.writeFile(filePath(), encrypted)
}

export async function clearAccountAuth(): Promise<void> {
  try {
    await fs.unlink(filePath())
  } catch {
    /* nothing to remove */
  }
}
