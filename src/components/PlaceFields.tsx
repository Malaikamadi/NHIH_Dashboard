import { DISTRICTS, WORK_TYPES, placeLine } from '../data/catalog'
import type { DistrictId, WorkKind } from '../types'

export function placeFromForm(data: FormData): {
  workKind: WorkKind
  district: DistrictId
  facility?: string
} {
  const facility = String(data.get('facility') || '').trim()
  return {
    workKind: String(data.get('workKind') || 'facility_followup') as WorkKind,
    district: String(data.get('district') || 'national') as DistrictId,
    facility: facility || undefined,
  }
}

export function PlaceFields({
  workKind = 'facility_followup',
  district = 'national',
}: {
  workKind?: WorkKind
  district?: DistrictId
}) {
  return (
    <>
      <div className="admin-split">
        <label>
          Work type
          <select name="workKind" defaultValue={workKind}>
            {WORK_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          District
          <select name="district" defaultValue={district}>
            {DISTRICTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Facility
        <input name="facility" placeholder="PHU / hospital (optional)" />
      </label>
    </>
  )
}

export function PlaceLine({
  workKind,
  district,
  facility,
}: {
  workKind: WorkKind
  district: DistrictId
  facility?: string
}) {
  return <span className="place-line">{placeLine(workKind, district, facility)}</span>
}
