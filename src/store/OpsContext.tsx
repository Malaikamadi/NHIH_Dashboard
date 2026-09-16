import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  convertAction,
  createActivity,
  createActionItem,
  createHubLog,
  createMeeting,
  createTask,
  deleteActionItem,
  deleteActivity,
  deleteHubLog,
  deleteMeeting,
  deleteTask,
  fetchState,
  openStateStream,
  patchActionItem,
  patchActivity,
  patchHubLog,
  patchMeeting,
  patchTask,
  resetDemo as resetDemoApi,
  restoreHub,
} from '../api'
import { clearHubCache, readHubCache, writeHubCache } from './cache'
import { hubHasWork } from '../utils/hub'
import type {
  ActionItem,
  ActivityEvent,
  DistrictId,
  HubLogEntry,
  Meeting,
  OpsState,
  Priority,
  Task,
  TaskStatus,
  TeamActivity,
  WorkKind,
} from '../types'
import { memberName } from '../utils/metrics'
import { MEMBERS } from '../data/seed'
import { nowIso, uid } from '../utils/time'

const EMPTY: OpsState = {
  members: [],
  tasks: [],
  meetings: [],
  actionItems: [],
  events: [],
  hubLog: [],
  activities: [],
}

type Action =
  | { type: 'hydrate'; state: OpsState }
  | { type: 'add_task'; task: Task }
  | { type: 'update_task'; id: string; patch: Partial<Task> }
  | { type: 'add_meeting'; meeting: Meeting }
  | { type: 'update_meeting'; id: string; patch: Partial<Meeting> }
  | { type: 'add_activity'; activity: TeamActivity }
  | { type: 'update_activity'; id: string; patch: Partial<TeamActivity> }
  | { type: 'add_action'; item: ActionItem }
  | { type: 'update_action'; id: string; patch: Partial<ActionItem> }
  | { type: 'convert_action'; actionId: string; task: Task }
  | { type: 'add_hub_log'; entry: HubLogEntry }
  | { type: 'update_hub_log'; id: string; patch: Partial<HubLogEntry> }
  | { type: 'remove_task'; id: string }
  | { type: 'remove_meeting'; id: string }
  | { type: 'remove_activity'; id: string }
  | { type: 'remove_action'; id: string }
  | { type: 'remove_hub_log'; id: string }

function pushEvent(state: OpsState, event: ActivityEvent): OpsState {
  return { ...state, events: [event, ...state.events].slice(0, 12) }
}

function reducer(state: OpsState, action: Action): OpsState {
  switch (action.type) {
    case 'hydrate':
      return {
        ...action.state,
        members: MEMBERS,
        hubLog: action.state.hubLog ?? [],
        activities: action.state.activities ?? [],
      }
    case 'add_task':
      return pushEvent(
        { ...state, tasks: [action.task, ...state.tasks] },
        {
          id: uid('e'),
          at: nowIso(),
          message: `New task assigned · ${action.task.title}`,
          tone: action.task.priority === 'critical' ? 'danger' : 'info',
        },
      )
    case 'update_task': {
      const prev = state.tasks.find((t) => t.id === action.id)
      const tasks = state.tasks.map((t) =>
        t.id === action.id ? { ...t, ...action.patch } : t,
      )
      const next = tasks.find((t) => t.id === action.id)
      if (!prev || !next) return { ...state, tasks }
      if (prev.status !== next.status && next.status === 'completed') {
        return pushEvent(
          { ...state, tasks },
          {
            id: uid('e'),
            at: nowIso(),
            message: `${memberName(state.members, next.assignedTo)} completed · ${next.title}`,
            tone: 'success',
          },
        )
      }
      return { ...state, tasks }
    }
    case 'add_meeting':
      return pushEvent(
        {
          ...state,
          meetings: [...state.meetings, action.meeting],
        },
        {
          id: uid('e'),
          at: nowIso(),
          message: `Meeting added · ${action.meeting.title}`,
          tone: 'info',
        },
      )
    case 'update_meeting': {
      const prev = state.meetings.find((m) => m.id === action.id)
      const meetings = state.meetings.map((m) =>
        m.id === action.id ? { ...m, ...action.patch } : m,
      )
      const next = meetings.find((m) => m.id === action.id)
      if (!prev || !next) return { ...state, meetings }
      if (action.patch.startTime && action.patch.startTime !== prev.startTime) {
        return pushEvent(
          { ...state, meetings },
          {
            id: uid('e'),
            at: nowIso(),
            message: `Meeting started · ${next.title}`,
            tone: 'info',
          },
        )
      }
      if (action.patch.endTime && action.patch.endTime !== prev.endTime) {
        return pushEvent(
          { ...state, meetings },
          {
            id: uid('e'),
            at: nowIso(),
            message: `Meeting ended · ${next.title}`,
            tone: 'success',
          },
        )
      }
      if (action.patch.notes !== undefined && action.patch.notes !== prev.notes) {
        return pushEvent(
          { ...state, meetings },
          {
            id: uid('e'),
            at: nowIso(),
            message: `Minutes updated · ${next.title}`,
            tone: 'info',
          },
        )
      }
      if (action.patch.agenda !== undefined && action.patch.agenda !== prev.agenda) {
        return pushEvent(
          { ...state, meetings },
          {
            id: uid('e'),
            at: nowIso(),
            message: `Agenda updated · ${next.title}`,
            tone: 'info',
          },
        )
      }
      return { ...state, meetings }
    }
    case 'add_activity':
      return pushEvent(
        { ...state, activities: [...(state.activities ?? []), action.activity] },
        {
          id: uid('e'),
          at: nowIso(),
          message: `Activity added · ${action.activity.title}`,
          tone: 'info',
        },
      )
    case 'update_activity': {
      const prev = (state.activities ?? []).find((item) => item.id === action.id)
      const activities = (state.activities ?? []).map((item) =>
        item.id === action.id ? { ...item, ...action.patch } : item,
      )
      const next = activities.find((item) => item.id === action.id)
      if (!prev || !next) return { ...state, activities }
      if (action.patch.startTime && action.patch.startTime !== prev.startTime) {
        return pushEvent(
          { ...state, activities },
          {
            id: uid('e'),
            at: nowIso(),
            message: `Activity started · ${next.title}`,
            tone: 'info',
          },
        )
      }
      if (action.patch.endTime && action.patch.endTime !== prev.endTime) {
        return pushEvent(
          { ...state, activities },
          {
            id: uid('e'),
            at: nowIso(),
            message: `Activity ended · ${next.title}`,
            tone: 'success',
          },
        )
      }
      return { ...state, activities }
    }
    case 'add_action':
      return {
        ...state,
        actionItems: [action.item, ...state.actionItems],
      }
    case 'update_action':
      return {
        ...state,
        actionItems: state.actionItems.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item,
        ),
      }
    case 'convert_action':
      return {
        ...state,
        tasks: [action.task, ...state.tasks],
        actionItems: state.actionItems.map((a) =>
          a.id === action.actionId
            ? { ...a, convertedToTaskId: action.task.id, status: 'in_progress' }
            : a,
        ),
      }
    case 'add_hub_log': {
      const prefix =
        action.entry.kind === 'extract_failed'
          ? 'Extract failed'
          : action.entry.kind === 'extract_restored'
            ? 'Extract restored'
            : action.entry.kind === 'late_reporting'
              ? 'Late reporting'
              : action.entry.kind === 'incident'
                ? 'Incident'
                : 'Hub note'
      return pushEvent(
        { ...state, hubLog: [action.entry, ...state.hubLog] },
        {
          id: uid('e'),
          at: action.entry.at,
          message: `${prefix} · ${action.entry.title}`,
          tone:
            action.entry.kind === 'extract_failed' || action.entry.kind === 'incident'
              ? 'danger'
              : action.entry.kind === 'late_reporting'
                ? 'warn'
                : action.entry.kind === 'extract_restored'
                  ? 'success'
                  : 'info',
        },
      )
    }
    case 'update_hub_log':
      return {
        ...state,
        hubLog: state.hubLog.map((entry) =>
          entry.id === action.id ? { ...entry, ...action.patch } : entry,
        ),
      }
    case 'remove_task':
      return { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) }
    case 'remove_meeting':
      return { ...state, meetings: state.meetings.filter((meeting) => meeting.id !== action.id) }
    case 'remove_activity':
      return {
        ...state,
        activities: (state.activities ?? []).filter((activity) => activity.id !== action.id),
      }
    case 'remove_action':
      return { ...state, actionItems: state.actionItems.filter((item) => item.id !== action.id) }
    case 'remove_hub_log':
      return { ...state, hubLog: (state.hubLog ?? []).filter((entry) => entry.id !== action.id) }
    default:
      return state
  }
}

interface OpsContextValue {
  state: OpsState
  connected: boolean
  addTask: (input: {
    title: string
    description: string
    assignedTo: string
    assignedBy: string
    priority: Priority
    dueDate: string
    status: TaskStatus
    progress: number
    workKind: WorkKind
    workKindOther?: string
    district: DistrictId
    facility?: string
  }) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  addMeeting: (input: Omit<Meeting, 'id'>) => void
  updateMeeting: (id: string, patch: Partial<Meeting>) => void
  addActivity: (input: Omit<TeamActivity, 'id'>) => void
  updateActivity: (id: string, patch: Partial<TeamActivity>) => void
  addActionItem: (input: Omit<ActionItem, 'id' | 'convertedToTaskId'>) => void
  updateActionItem: (id: string, patch: Partial<ActionItem>) => void
  convertActionToTask: (actionId: string, assignedBy: string) => void
  addHubLog: (input: Omit<HubLogEntry, 'id' | 'at'> & { at?: string }) => void
  updateHubLog: (id: string, patch: Partial<HubLogEntry>) => void
  removeTask: (id: string) => void
  removeMeeting: (id: string) => void
  removeActivity: (id: string) => void
  removeActionItem: (id: string) => void
  removeHubLog: (id: string) => void
  resetDemo: () => void
  restoreFromBrowser: () => Promise<boolean>
}

const OpsContext = createContext<OpsContextValue | null>(null)

export function OpsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const [connected, setConnected] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const hydrate = useCallback((next: OpsState) => {
    dispatch({ type: 'hydrate', state: next })
    writeHubCache(next)
  }, [])

  const adoptServerState = useCallback(
    async (remote: OpsState) => {
      if (hubHasWork(remote)) {
        hydrate(remote)
        setConnected(true)
        return
      }
      const cached = readHubCache()
      if (cached && hubHasWork(cached)) {
        hydrate(cached)
        setConnected(true)
        try {
          hydrate(await restoreHub(cached))
        } catch {
          /* keep local cache until storage is writable again */
        }
        return
      }
      hydrate(remote)
      setConnected(true)
    },
    [hydrate],
  )

  const refresh = useCallback(async () => {
    try {
      await adoptServerState(await fetchState())
    } catch {
      const cached = readHubCache()
      if (cached && hubHasWork(cached)) {
        hydrate(cached)
      }
      setConnected(false)
    }
  }, [adoptServerState, hydrate])

  useEffect(() => {
    void refresh()
    return openStateStream(
      (remote) => {
        void adoptServerState(remote)
      },
      setConnected,
    )
  }, [adoptServerState, refresh])

  useEffect(() => {
    if (hubHasWork(state)) writeHubCache(state)
  }, [state])

  const addTask = useCallback<OpsContextValue['addTask']>(
    (input) => {
      const task: Task = {
        ...input,
        id: uid('t'),
        createdAt: nowIso(),
        completedAt: input.status === 'completed' ? nowIso() : undefined,
      }
      dispatch({ type: 'add_task', task })
      void createTask(task).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      const next = { ...patch }
      if (patch.status === 'completed') {
        next.progress = 100
        next.completedAt = nowIso()
      }
      dispatch({ type: 'update_task', id, patch: next })
      void patchTask(id, next).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const addMeeting = useCallback(
    (input: Omit<Meeting, 'id'>) => {
      const meeting: Meeting = { ...input, id: uid('mtg') }
      dispatch({ type: 'add_meeting', meeting })
      void createMeeting(meeting).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const updateMeeting = useCallback(
    (id: string, patch: Partial<Meeting>) => {
      dispatch({ type: 'update_meeting', id, patch })
      void patchMeeting(id, patch).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const addActivity = useCallback(
    (input: Omit<TeamActivity, 'id'>) => {
      const activity: TeamActivity = { ...input, id: uid('act') }
      dispatch({ type: 'add_activity', activity })
      void createActivity(activity).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const updateActivity = useCallback(
    (id: string, patch: Partial<TeamActivity>) => {
      dispatch({ type: 'update_activity', id, patch })
      void patchActivity(id, patch).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const addActionItem = useCallback(
    (input: Omit<ActionItem, 'id' | 'convertedToTaskId'>) => {
      const item: ActionItem = { ...input, id: uid('a') }
      dispatch({ type: 'add_action', item })
      void createActionItem(item).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const updateActionItem = useCallback(
    (id: string, patch: Partial<ActionItem>) => {
      dispatch({ type: 'update_action', id, patch })
      void patchActionItem(id, patch).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const convertActionToTask = useCallback(
    (actionId: string, assignedBy: string) => {
      const item = stateRef.current.actionItems.find((a) => a.id === actionId)
      if (!item || item.convertedToTaskId) return
      const task: Task = {
        id: uid('t'),
        title: item.title,
        description: `Converted from meeting action · ${item.meetingTitle}`,
        assignedTo: item.assignedTo,
        assignedBy,
        priority: 'high',
        dueDate: item.deadline,
        status: 'not_started',
        progress: 0,
        createdAt: nowIso(),
        fromActionItemId: item.id,
        workKind: item.workKind,
        workKindOther: item.workKindOther,
        district: item.district,
        facility: item.facility,
      }
      dispatch({ type: 'convert_action', actionId, task })
      void convertAction(actionId, assignedBy).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const addHubLog = useCallback(
    (input: Omit<HubLogEntry, 'id' | 'at'> & { at?: string }) => {
      const kind = input.kind
      const entry: HubLogEntry = {
        ...input,
        id: uid('log'),
        at: input.at ?? nowIso(),
        detail: input.detail ?? '',
        status:
          input.status ??
          (kind === 'extract_restored'
            ? 'completed'
            : kind === 'extract_failed' || kind === 'late_reporting'
              ? 'overdue'
              : 'open'),
      }
      dispatch({ type: 'add_hub_log', entry })
      void createHubLog(entry).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const updateHubLog = useCallback(
    (id: string, patch: Partial<HubLogEntry>) => {
      dispatch({ type: 'update_hub_log', id, patch })
      void patchHubLog(id, patch).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const removeTask = useCallback(
    (id: string) => {
      dispatch({ type: 'remove_task', id })
      void deleteTask(id).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const removeMeeting = useCallback(
    (id: string) => {
      dispatch({ type: 'remove_meeting', id })
      void deleteMeeting(id).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const removeActivity = useCallback(
    (id: string) => {
      dispatch({ type: 'remove_activity', id })
      void deleteActivity(id).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const removeActionItem = useCallback(
    (id: string) => {
      dispatch({ type: 'remove_action', id })
      void deleteActionItem(id).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const removeHubLog = useCallback(
    (id: string) => {
      dispatch({ type: 'remove_hub_log', id })
      void deleteHubLog(id).then(hydrate).catch(refresh)
    },
    [hydrate, refresh],
  )

  const resetDemo = useCallback(() => {
    clearHubCache()
    void resetDemoApi().then(hydrate).catch(refresh)
  }, [hydrate, refresh])

  const restoreFromBrowser = useCallback(async () => {
    const cached = readHubCache()
    if (!cached || !hubHasWork(cached)) return false
    try {
      hydrate(await restoreHub(cached))
      setConnected(true)
      return true
    } catch {
      hydrate(cached)
      return true
    }
  }, [hydrate])

  const value = useMemo(
    () => ({
      state,
      connected,
      addTask,
      updateTask,
      addMeeting,
      updateMeeting,
      addActivity,
      updateActivity,
      addActionItem,
      updateActionItem,
      convertActionToTask,
      addHubLog,
      updateHubLog,
      removeTask,
      removeMeeting,
      removeActivity,
      removeActionItem,
      removeHubLog,
      resetDemo,
      restoreFromBrowser,
    }),
    [
      state,
      connected,
      addTask,
      updateTask,
      addMeeting,
      updateMeeting,
      addActivity,
      updateActivity,
      addActionItem,
      updateActionItem,
      convertActionToTask,
      addHubLog,
      updateHubLog,
      removeTask,
      removeMeeting,
      removeActivity,
      removeActionItem,
      removeHubLog,
      resetDemo,
      restoreFromBrowser,
    ],
  )

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>
}

export function useOps(): OpsContextValue {
  const ctx = useContext(OpsContext)
  if (!ctx) throw new Error('useOps must be used within OpsProvider')
  return ctx
}
