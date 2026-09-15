import { z } from 'zod'

const isoDate = z.string().min(1, 'Date is required')

export const taskStatus = z.enum(['not_started', 'in_progress', 'under_review', 'completed', 'overdue'])
export const priority = z.enum(['critical', 'high', 'medium', 'low'])
export const actionStatus = z.enum(['open', 'in_progress', 'completed'])
export const workKind = z.enum([
  'extract',
  'dhis2_completeness',
  'data_quality',
  'hio_field_visit',
  'analysis_request',
  'facility_followup',
  'other',
])
export const districtId = z.enum([
  'national',
  'western_urban',
  'western_rural',
  'bo',
  'bombali',
  'bonthe',
  'falaba',
  'kailahun',
  'kambia',
  'karene',
  'kenema',
  'koinadugu',
  'kono',
  'moyamba',
  'port_loko',
  'pujehun',
  'tonkolili',
])
export const activityKind = z.enum([
  'field_visit',
  'training',
  'workshop',
  'supervision',
  'partner',
  'other',
])
export const hubLogKind = z.enum(['incident', 'late_reporting', 'extract_failed', 'extract_restored', 'note'])

export const taskCreate = z
  .object({
    id: z.string().optional(),
    title: z.string().trim().min(1, 'Title is required'),
    description: z.string().optional().default(''),
    assignedTo: z.string().min(1, 'Assignee is required'),
    assignedBy: z.string().min(1, 'Assigner is required'),
    priority,
    dueDate: isoDate,
    status: taskStatus.optional().default('not_started'),
    progress: z.number().int().min(0).max(100).optional().default(0),
    createdAt: z.string().optional(),
    completedAt: z.string().optional(),
    fromActionItemId: z.string().optional(),
    workKind: workKind.optional().default('facility_followup'),
    workKindOther: z.string().optional().default(''),
    district: districtId.optional().default('national'),
    facility: z.string().optional().default(''),
  })
  .refine((value) => value.workKind !== 'other' || Boolean(value.workKindOther?.trim()), {
    message: 'Type the other work type',
    path: ['workKindOther'],
  })

export const taskPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    assignedTo: z.string().optional(),
    assignedBy: z.string().optional(),
    priority: priority.optional(),
    dueDate: isoDate.optional(),
    status: taskStatus.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    completedAt: z.string().optional(),
    workKind: workKind.optional(),
    workKindOther: z.string().optional(),
    district: districtId.optional(),
    facility: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update')

export const meetingCreate = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Title is required'),
  startTime: isoDate,
  endTime: isoDate,
  participantIds: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
  agenda: z.string().optional().default(''),
  rolling: z.boolean().optional(),
})

export const meetingPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    startTime: isoDate.optional(),
    endTime: isoDate.optional(),
    participantIds: z.array(z.string()).optional(),
    notes: z.string().optional(),
    agenda: z.string().optional(),
    rolling: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update')

export const actionCreate = z
  .object({
    id: z.string().optional(),
    meetingId: z.string().min(1),
    meetingTitle: z.string().min(1),
    title: z.string().trim().min(1, 'Title is required'),
    assignedTo: z.string().min(1),
    deadline: isoDate,
    status: actionStatus.optional().default('open'),
    workKind: workKind.optional().default('facility_followup'),
    workKindOther: z.string().optional().default(''),
    district: districtId.optional().default('national'),
    facility: z.string().optional().default(''),
  })
  .refine((value) => value.workKind !== 'other' || Boolean(value.workKindOther?.trim()), {
    message: 'Type the other work type',
    path: ['workKindOther'],
  })

export const actionPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    assignedTo: z.string().optional(),
    deadline: isoDate.optional(),
    status: actionStatus.optional(),
    meetingId: z.string().optional(),
    meetingTitle: z.string().optional(),
    workKind: workKind.optional(),
    workKindOther: z.string().optional(),
    district: districtId.optional(),
    facility: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update')

export const convertBody = z.object({
  assignedBy: z.string().min(1).optional().default('m1'),
})

export const activityCreate = z
  .object({
    id: z.string().optional(),
    title: z.string().trim().min(1, 'Title is required'),
    kind: activityKind.optional().default('training'),
    kindOther: z.string().optional().default(''),
    startTime: isoDate,
    endTime: isoDate,
    participantIds: z.array(z.string()).optional().default([]),
    district: districtId.optional().default('national'),
    facility: z.string().optional().default(''),
    notes: z.string().optional().default(''),
  })
  .refine((value) => value.kind !== 'other' || Boolean(value.kindOther?.trim()), {
    message: 'Type the other activity',
    path: ['kindOther'],
  })

export const activityPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    kind: activityKind.optional(),
    kindOther: z.string().optional(),
    startTime: isoDate.optional(),
    endTime: isoDate.optional(),
    participantIds: z.array(z.string()).optional(),
    district: districtId.optional(),
    facility: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update')

export const hubLogCreate = z.object({
  id: z.string().optional(),
  at: z.string().optional(),
  kind: hubLogKind,
  title: z.string().trim().min(1, 'Title is required'),
  detail: z.string().optional().default(''),
  district: districtId.optional().default('national'),
  facility: z.string().optional().default(''),
  authorId: z.string().min(1),
})

export const hubLogPatch = z
  .object({
    kind: hubLogKind.optional(),
    title: z.string().trim().min(1).optional(),
    detail: z.string().optional(),
    district: districtId.optional(),
    facility: z.string().optional(),
    authorId: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update')

export const restoreBody = z.object({
  tasks: z.array(z.any()).optional(),
  meetings: z.array(z.any()).optional(),
  activities: z.array(z.any()).optional(),
  actionItems: z.array(z.any()).optional(),
  hubLog: z.array(z.any()).optional(),
  events: z.array(z.any()).optional(),
})
