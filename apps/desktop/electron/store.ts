import Store from 'electron-store'
import type { AppSettings, TodoItem, FocusRecord, SessionState, ScheduleBlock } from '../src/shared/types.ts'
import { DEFAULT_SETTINGS } from '../src/shared/types.ts'

interface StoreSchema {
  settings: AppSettings
  todos: TodoItem[]
  history: FocusRecord[]
  session: SessionState | null
  scheduleBlocks: ScheduleBlock[]
  googleEventsCache: ScheduleBlock[]
}

export const store = new Store<StoreSchema>({
  name: 'zone-data',
  defaults: {
    settings: DEFAULT_SETTINGS,
    todos: [],
    history: [],
    session: null,
    scheduleBlocks: [],
    googleEventsCache: [],
  },
})
