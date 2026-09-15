import type { ActivityKind, DistrictId, HubLogKind, WorkKind } from '../types'

export const WORK_TYPES: { id: WorkKind; label: string }[] = [
  { id: 'extract', label: 'Extract' },
  { id: 'dhis2_completeness', label: 'DHIS2 completeness' },
  { id: 'data_quality', label: 'Data quality' },
  { id: 'hio_field_visit', label: 'HIO field visit' },
  { id: 'analysis_request', label: 'Analysis request' },
  { id: 'facility_followup', label: 'Facility follow-up' },
  { id: 'other', label: 'Others' },
]

export const DISTRICTS: { id: DistrictId; label: string }[] = [
  { id: 'national', label: 'National / Hub' },
  { id: 'western_urban', label: 'Western Area Urban' },
  { id: 'western_rural', label: 'Western Area Rural' },
  { id: 'bo', label: 'Bo' },
  { id: 'bombali', label: 'Bombali' },
  { id: 'bonthe', label: 'Bonthe' },
  { id: 'falaba', label: 'Falaba' },
  { id: 'kailahun', label: 'Kailahun' },
  { id: 'kambia', label: 'Kambia' },
  { id: 'karene', label: 'Karene' },
  { id: 'kenema', label: 'Kenema' },
  { id: 'koinadugu', label: 'Koinadugu' },
  { id: 'kono', label: 'Kono' },
  { id: 'moyamba', label: 'Moyamba' },
  { id: 'port_loko', label: 'Port Loko' },
  { id: 'pujehun', label: 'Pujehun' },
  { id: 'tonkolili', label: 'Tonkolili' },
]

export const ACTIVITY_KINDS: { id: ActivityKind; label: string }[] = [
  { id: 'field_visit', label: 'Field visit' },
  { id: 'training', label: 'Training' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'supervision', label: 'Supervision' },
  { id: 'partner', label: 'Partner engagement' },
  { id: 'other', label: 'Other' },
]

export const LOG_KINDS: { id: HubLogKind; label: string }[] = [
  { id: 'extract_failed', label: 'Extract failed' },
  { id: 'extract_restored', label: 'Extract restored' },
  { id: 'late_reporting', label: 'Late reporting' },
  { id: 'incident', label: 'Incident' },
  { id: 'note', label: 'Hub note' },
]

export const WORK_TYPE_LABEL: Record<WorkKind, string> = Object.fromEntries(
  WORK_TYPES.map((item) => [item.id, item.label]),
) as Record<WorkKind, string>

export const DISTRICT_LABEL: Record<DistrictId, string> = Object.fromEntries(
  DISTRICTS.map((item) => [item.id, item.label]),
) as Record<DistrictId, string>

export const LOG_KIND_LABEL: Record<HubLogKind, string> = Object.fromEntries(
  LOG_KINDS.map((item) => [item.id, item.label]),
) as Record<HubLogKind, string>

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = Object.fromEntries(
  ACTIVITY_KINDS.map((item) => [item.id, item.label]),
) as Record<ActivityKind, string>

export function workTypeLabel(id: WorkKind, other?: string): string {
  if (id === 'other') {
    const custom = other?.trim()
    return custom || 'Other'
  }
  return WORK_TYPE_LABEL[id] ?? id
}

export function districtLabel(id: DistrictId): string {
  return DISTRICT_LABEL[id] ?? id
}

export function logKindLabel(id: HubLogKind): string {
  return LOG_KIND_LABEL[id] ?? id
}

export function activityKindLabel(id: ActivityKind, other?: string): string {
  if (id === 'other') {
    const custom = other?.trim()
    return custom || 'Other'
  }
  return ACTIVITY_KIND_LABEL[id] ?? id
}

export function placeLine(
  workKind: WorkKind,
  district: DistrictId,
  facility?: string,
  workKindOther?: string,
): string {
  const base = `${workTypeLabel(workKind, workKindOther)} · ${districtLabel(district)}`
  return facility?.trim() ? `${base} · ${facility.trim()}` : base
}
