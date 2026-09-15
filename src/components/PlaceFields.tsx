import { useEffect, useRef, useState } from 'react'
import { DISTRICTS, WORK_TYPES, placeLine } from '../data/catalog'
import type { DistrictId, WorkKind } from '../types'

export function placeFromForm(data: FormData): {
  workKind: WorkKind
  workKindOther?: string
  district: DistrictId
  facility?: string
} {
  const facility = String(data.get('facility') || '').trim()
  const workKind = String(data.get('workKind') || 'facility_followup') as WorkKind
  const workKindOther = String(data.get('workKindOther') || '').trim()
  return {
    workKind,
    workKindOther: workKind === 'other' ? workKindOther : '',
    district: String(data.get('district') || 'national') as DistrictId,
    facility: facility || undefined,
  }
}

export function PlaceFields({
  workKind = 'facility_followup',
  workKindOther = '',
  district = 'national',
  facility = '',
}: {
  workKind?: WorkKind
  workKindOther?: string
  district?: DistrictId
  facility?: string
}) {
  const [kind, setKind] = useState<WorkKind>(workKind)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = () => setKind(workKind)
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [workKind])

  return (
    <div ref={rootRef}>
      <div className="admin-split">
        <label>
          Work type
          <select
            name="workKind"
            value={kind}
            onChange={(e) => setKind(e.target.value as WorkKind)}
          >
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
      {kind === 'other' && (
        <label>
          Other work type
          <input
            name="workKindOther"
            required
            defaultValue={workKindOther}
            placeholder="Type the work type"
          />
        </label>
      )}
      <label>
        Facility
        <input name="facility" defaultValue={facility} placeholder="PHU / hospital (optional)" />
      </label>
    </div>
  )
}

export function PlaceLine({
  workKind,
  workKindOther,
  district,
  facility,
}: {
  workKind: WorkKind
  workKindOther?: string
  district: DistrictId
  facility?: string
}) {
  return <span className="place-line">{placeLine(workKind, district, facility, workKindOther)}</span>
}
