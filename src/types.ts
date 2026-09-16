export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'under_review'
  | 'completed'
  | 'overdue'

export type Priority = 'critical' | 'high' | 'medium' | 'low'

export type WorkloadLevel = 'light' | 'balanced' | 'heavy' | 'overloaded'

export type MeetingStatus = 'upcoming' | 'live' | 'completed'

export type ActionStatus = 'open' | 'in_progress' | 'completed'

export type WorkKind =
  | 'extract'
  | 'dhis2_completeness'
  | 'data_quality'
  | 'hio_field_visit'
  | 'analysis_request'
  | 'facility_followup'
  | 'other'

export type DistrictId =
  | 'national'
  | 'western_urban'
  | 'western_rural'
  | 'bo'
  | 'bombali'
  | 'bonthe'
  | 'falaba'
  | 'kailahun'
  | 'kambia'
  | 'karene'
  | 'kenema'
  | 'koinadugu'
  | 'kono'
  | 'moyamba'
  | 'port_loko'
  | 'pujehun'
  | 'tonkolili'

export type HubLogKind = 'incident' | 'late_reporting' | 'extract_failed' | 'extract_restored' | 'note'

export type HubLogStatus = 'open' | 'completed' | 'overdue'

export type ActivityKind =
  | 'field_visit'
  | 'training'
  | 'workshop'
  | 'supervision'
  | 'partner'
  | 'other'

export interface TeamMember {
  id: string
  name: string
  role: string
  initials: string
}

export interface Task {
  id: string
  title: string
  description: string
  assignedTo: string
  assignedBy: string
  priority: Priority
  dueDate: string
  status: TaskStatus
  progress: number
  createdAt: string
  completedAt?: string
  fromActionItemId?: string
  workKind: WorkKind
  workKindOther?: string
  district: DistrictId
  facility?: string
}

export type PeriodId = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'

export interface Meeting {
  id: string
  title: string
  startTime: string
  endTime: string
  participantIds: string[]
  /** What the huddle will walk — one item per line. Distinct from minutes. */
  agenda?: string
  notes?: string
  /** When true, start/end times roll forward to the current day on load. */
  rolling?: boolean
}

export interface ActionItem {
  id: string
  meetingId: string
  meetingTitle: string
  title: string
  assignedTo: string
  deadline: string
  status: ActionStatus
  convertedToTaskId?: string
  workKind: WorkKind
  workKindOther?: string
  district: DistrictId
  facility?: string
}

export interface TeamActivity {
  id: string
  title: string
  kind: ActivityKind
  kindOther?: string
  startTime: string
  endTime: string
  participantIds: string[]
  district: DistrictId
  facility?: string
  notes?: string
}

export interface HubLogEntry {
  id: string
  at: string
  kind: HubLogKind
  /** Defaults from kind when missing on older snapshots. */
  status?: HubLogStatus
  title: string
  detail: string
  district: DistrictId
  facility?: string
  authorId: string
}

export interface ActivityEvent {
  id: string
  at: string
  message: string
  tone: 'info' | 'success' | 'warn' | 'danger'
}

export interface OpsState {
  members: TeamMember[]
  tasks: Task[]
  meetings: Meeting[]
  activities: TeamActivity[]
  actionItems: ActionItem[]
  hubLog: HubLogEntry[]
  events: ActivityEvent[]
}

export type ViewId = 'today' | 'performance' | 'workload' | 'actions'
