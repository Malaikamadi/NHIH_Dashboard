import { useEffect, useRef, useState } from 'react'
import type { TeamMember } from '../types'
import { memberLabel } from '../utils/metrics'

export function ParticipantPicker({
  members,
  name = 'participants',
  selectedIds,
  defaultAll = false,
  legend = 'Participants',
}: {
  members: TeamMember[]
  name?: string
  selectedIds?: string[]
  defaultAll?: boolean
  legend?: string
}) {
  const rootRef = useRef<HTMLFieldSetElement>(null)
  const [ids, setIds] = useState<string[]>(() =>
    selectedIds ?? (defaultAll ? members.map((member) => member.id) : []),
  )
  const allOn = members.length > 0 && members.every((member) => ids.includes(member.id))
  const memberKey = members.map((member) => member.id).join(',')
  const selectedKey = selectedIds?.join(',') ?? ''

  useEffect(() => {
    if (selectedIds) {
      setIds(selectedIds)
      return
    }
    if (defaultAll) setIds(members.map((member) => member.id))
  }, [selectedKey, defaultAll, memberKey])

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const onReset = () => setIds(defaultAll ? members.map((member) => member.id) : [])
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [defaultAll, members])

  return (
    <fieldset ref={rootRef} className="participant-picks">
      <legend>{legend}</legend>
      <label className="check-line is-all">
        <input
          type="checkbox"
          checked={allOn}
          onChange={() => setIds(allOn ? [] : members.map((member) => member.id))}
        />
        Select all team members
      </label>
      {members.map((member) => {
        const on = ids.includes(member.id)
        return (
          <label key={member.id} className="check-line">
            <input
              type="checkbox"
              name={name}
              value={member.id}
              checked={on}
              onChange={() =>
                setIds((current) =>
                  on ? current.filter((id) => id !== member.id) : [...current, member.id],
                )
              }
            />
            {memberLabel(member)}
          </label>
        )
      })}
    </fieldset>
  )
}
