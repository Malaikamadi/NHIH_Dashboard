import type { OpsState, TeamMember } from '../types'

export const MEMBERS: TeamMember[] = [
  { id: 'm1', name: 'Regina Daniels', role: 'Coordinator', initials: 'RD' },
  { id: 'm2', name: 'Ibrahim Sorie', role: 'Team Lead', initials: 'IS' },
  { id: 'm3', name: 'Prince Mafinda', role: 'Operations Manager', initials: 'PM' },
  { id: 'm4', name: 'Maliaka Madi', role: 'Data Engineer', initials: 'MM' },
  { id: 'm5', name: 'Joseph Koroma', role: 'Data Engineer', initials: 'JK' },
  { id: 'm6', name: 'Les Kamara', role: 'Data Engineer', initials: 'LK' },
  { id: 'm7', name: 'Daniel Jah', role: 'Data Analyst', initials: 'DJ' },
  { id: 'm8', name: 'Ishmael Kamara', role: 'HMIS Officer', initials: 'IK' },
  { id: 'm9', name: 'Sallay', role: 'HIO', initials: 'SA' },
  { id: 'm10', name: 'Karim SB Momoh', role: 'HMIS', initials: 'KM' },
  { id: 'm11', name: 'Ahmed Saidu', role: 'HMIS', initials: 'AS' },
  { id: 'm12', name: 'Success', role: 'Sand Technologies', initials: 'SU' },
  { id: 'm13', name: 'Mohamed Sesay', role: 'Country Director, Sand Technologies', initials: 'MS' },
  { id: 'm14', name: 'Golda', role: 'Sand Technologies', initials: 'GO' },
  { id: 'm15', name: 'Dr. Ini', role: 'DPPI', initials: 'DI' },
  { id: 'm16', name: 'Director', role: 'DPPI', initials: 'DP' },
]

export function buildSeed(): OpsState {
  return {
    members: MEMBERS,
    tasks: [],
    meetings: [],
    actionItems: [],
    events: [],
    hubLog: [],
    activities: [],
  }
}
