import { useEffect, useRef, useState } from 'react'
import { DISTRICTS, WORK_TYPES, districtIds, placeLine } from '../data/catalog'
import type { DistrictId, WorkKind } from '../types'

export function placeFromForm(data: FormData): {
  workKind: WorkKind
  workKindOther?: string
  district: DistrictId[]
  facility?: string
} {
  const facility = String(data.get('facility') || '').trim()
  const workKind = String(data.get('workKind') || 'facility_followup') as WorkKind
  const workKindOther = String(data.get('workKindOther') || '').trim()
  const selected = data.getAll('districts').map(String).filter(Boolean) as DistrictId[]
  return {
    workKind,
    workKindOther: workKind === 'other' ? workKindOther : '',
    district: selected.length ? selected : ['national'],
    facility: facility || undefined,
  }
}

function DistrictPicker({
  selectedIds = ['national'],
}: {
  selectedIds?: DistrictId[]
}) {
  const rootRef = useRef<HTMLFieldSetElement>(null)
  const [ids, setIds] = useState<DistrictId[]>(() => districtIds(selectedIds))
  const allOn = DISTRICTS.length > 0 && DISTRICTS.every((item) => ids.includes(item.id))
  const selectedKey = selectedIds.join(',')

  useEffect(() => {
    setIds(districtIds(selectedIds))
  }, [selectedKey])

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = () => setIds(districtIds(selectedIds))
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [selectedKey])

  return (
    <fieldset ref={rootRef} className="participant-picks">
      <legend>Districts</legend>
      <label className="check-line is-all">
        <input
          type="checkbox"
          checked={allOn}
          onChange={() => setIds(allOn ? [] : DISTRICTS.map((item) => item.id))}
        />
        Select all districts
      </label>
      {DISTRICTS.map((item) => {
        const on = ids.includes(item.id)
        return (
          <label key={item.id} className="check-line">
            <input
              type="checkbox"
              name="districts"
              value={item.id}
              checked={on}
              onChange={() =>
                setIds((current) =>
                  on ? current.filter((id) => id !== item.id) : [...current, item.id],
                )
              }
            />
            {item.label}
          </label>
        )
      })}
    </fieldset>
  )
}

export function PlaceFields({
  workKind = 'facility_followup',
  workKindOther = '',
  district = 'national',
  facility = '',
  lockWorkKind = false,
}: {
  workKind?: WorkKind
  workKindOther?: string
  district?: DistrictId | DistrictId[]
  facility?: string
  /** Keep the work type fixed. Used when a desk view owns the category. */
  lockWorkKind?: boolean
}) {
  const [kind, setKind] = useState<WorkKind>(workKind)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedDistricts = districtIds(district)

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = () => setKind(workKind)
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [workKind])

  return (
    <div ref={rootRef}>
      {lockWorkKind ? (
        <>
          <input type="hidden" name="workKind" value={workKind} />
          {workKind === 'other' && (
            <input type="hidden" name="workKindOther" value={workKindOther} />
          )}
        </>
      ) : (
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
      )}
      <DistrictPicker selectedIds={selectedDistricts} />
      {!lockWorkKind && kind === 'other' && (
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
  district: DistrictId | DistrictId[]
  facility?: string
}) {
  return <span className="place-line">{placeLine(workKind, district, facility, workKindOther)}</span>
}
