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
  const [query, setQuery] = useState('')
  const allOn = members.length > 0 && members.every((member) => ids.includes(member.id))
  const memberKey = members.map((member) => member.id).join(',')
  const selectedKey = selectedIds?.join(',') ?? ''
  const visible = members.filter((member) =>
    memberLabel(member).toLowerCase().includes(query.trim().toLowerCase()),
  )

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
    const onReset = () => {
      setIds(defaultAll ? members.map((member) => member.id) : [])
      setQuery('')
    }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [defaultAll, members])

  return (
    <fieldset ref={rootRef} className="participant-picks desk-picker">
      <legend>{legend}</legend>
      <div className="desk-picker-tools">
        <input
          className="desk-picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team member…"
          aria-label="Search team members"
        />
        <button type="button" className="desk-picker-all" onClick={() => setIds(allOn ? [] : members.map((m) => m.id))}>
          {allOn ? 'Clear all' : 'Select all'}
        </button>
      </div>
      {ids.length > 0 && (
        <div className="desk-selected">
          {members.filter((m) => ids.includes(m.id)).map((member) => (
            <button key={member.id} type="button" onClick={() => setIds((current) => current.filter((id) => id !== member.id))}>
              {member.name} <span>×</span>
            </button>
          ))}
        </div>
      )}
      <div className="desk-picker-grid">
        {visible.map((member) => {
          const on = ids.includes(member.id)
          return (
            <label key={member.id} className={`desk-person ${on ? 'is-selected' : ''}`}>
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
              <span className="desk-person-avatar">{member.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
              <span><strong>{member.name}</strong><small>{member.role}</small></span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
