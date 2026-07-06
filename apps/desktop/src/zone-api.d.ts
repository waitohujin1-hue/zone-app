import type { ZoneApi } from './shared/types'

declare global {
  interface Window {
    zone: ZoneApi
  }
}

export {}
