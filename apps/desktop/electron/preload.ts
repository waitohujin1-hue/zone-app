import { contextBridge, ipcRenderer } from 'electron'
import type {
  SessionConfig,
  SessionState,
  TodoItem,
  AppSettings,
  FocusRecord,
  ZoneApi,
  VisibleApp,
  SiteFrequency,
  ScheduleBlock,
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
  AccountAuthStatus,
  AccountLoginResult,
} from '../src/shared/types.ts'

const api: ZoneApi = {
  session: {
    get: (): Promise<SessionState> => ipcRenderer.invoke('session:get'),
    start: (config: SessionConfig): Promise<SessionState> => ipcRenderer.invoke('session:start', config),
    onUpdate: (cb: (state: SessionState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: SessionState) => cb(state)
      ipcRenderer.on('session:update', listener)
      return () => ipcRenderer.removeListener('session:update', listener)
    },
    debugStop: (): Promise<void> => ipcRenderer.invoke('session:debugStop'),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
  },
  todos: {
    list: (): Promise<TodoItem[]> => ipcRenderer.invoke('todos:get'),
    add: (text: string, estimatedMinutes: number | null): Promise<TodoItem[]> =>
      ipcRenderer.invoke('todos:add', text, estimatedMinutes),
    toggle: (id: string): Promise<TodoItem[]> => ipcRenderer.invoke('todos:toggle', id),
    remove: (id: string): Promise<TodoItem[]> => ipcRenderer.invoke('todos:remove', id),
    reorder: (orderedIds: string[]): Promise<TodoItem[]> => ipcRenderer.invoke('todos:reorder', orderedIds),
    rename: (id: string, text: string): Promise<TodoItem[]> => ipcRenderer.invoke('todos:rename', id, text),
    setEstimate: (id: string, minutes: number | null): Promise<TodoItem[]> =>
      ipcRenderer.invoke('todos:setEstimate', id, minutes),
  },
  history: {
    list: (): Promise<FocusRecord[]> => ipcRenderer.invoke('history:get'),
  },
  system: {
    listVisibleApps: (): Promise<VisibleApp[]> => ipcRenderer.invoke('system:listVisibleApps'),
    listFrequentSites: (): Promise<SiteFrequency[]> => ipcRenderer.invoke('system:listFrequentSites'),
    checkHostsWritable: (): Promise<boolean> => ipcRenderer.invoke('system:checkHostsWritable'),
  },
  schedule: {
    listForDate: (date: string): Promise<ScheduleBlock[]> => ipcRenderer.invoke('schedule:listForDate', date),
    create: (input: CreateScheduleBlockInput): Promise<ScheduleBlock[]> =>
      ipcRenderer.invoke('schedule:create', input),
    update: (id: string, patch: UpdateScheduleBlockInput): Promise<ScheduleBlock[]> =>
      ipcRenderer.invoke('schedule:update', id, patch),
    remove: (id: string): Promise<ScheduleBlock[]> => ipcRenderer.invoke('schedule:remove', id),
    addToTodoList: (id: string): Promise<ScheduleBlock[]> => ipcRenderer.invoke('schedule:addToTodoList', id),
    pullGoogle: (date: string): Promise<void> => ipcRenderer.invoke('schedule:pullGoogle', date),
  },
  account: {
    getStatus: (): Promise<AccountAuthStatus> => ipcRenderer.invoke('account:getStatus'),
    loginWithGoogle: (): Promise<AccountLoginResult> => ipcRenderer.invoke('account:loginWithGoogle'),
    logout: (): Promise<void> => ipcRenderer.invoke('account:logout'),
  },
}

contextBridge.exposeInMainWorld('zone', api)
