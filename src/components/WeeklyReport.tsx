import { useEffect, useState } from 'react'
import { fetchWeeklyReport, fetchWeeklyReportHtml } from '../api'
import type { PeriodId } from '../types'
import type { WeeklyReport as WeeklyReportData } from '../utils/report'
import { downloadReport, printReport } from '../utils/download'
import { reportFileName } from '../utils/report'
import { PERIODS, agendaLines } from '../utils/metrics'
import { Icon } from './Icons'

interface Props {
  onClose: () => void
  initialPeriod?: PeriodId
}

const PERIOD_SCOPE: Record<PeriodId, string> = {
  Daily: 'today',
  Weekly: 'this week',
  Monthly: 'this month',
  Yearly: 'this year',
}

export function WeeklyReportModal({ onClose, initialPeriod = 'Weekly' }: Props) {
  const [period, setPeriod] = useState<PeriodId>(initialPeriod)
  const [report, setReport] = useState<WeeklyReportData | null>(null)
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([fetchWeeklyReport(period), fetchWeeklyReportHtml(period)])
      .then(([next, markup]) => {
        if (cancelled) return
        setReport(next)
        setHtml(markup)
      })
      .catch(() => {
        if (!cancelled) {
          setReport(null)
          setHtml('')
          setError('Could not load the operations report from the server.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period])

  const scope = PERIOD_SCOPE[period]

  return (
    <div className="report-scrim" onClick={onClose}>
      <article className="report-panel" onClick={(e) => e.stopPropagation()}>
        <header className="report-h">
          <div>
            <div className="hdr-kicker">{period} operations report</div>
            <h2>Team performance, hub incident log, meetings, and minutes</h2>
            <p className="muted">{report?.rangeLabel ?? 'Loading from the operations API'}</p>
            <div className="log-type-tabs report-period-tabs" role="tablist" aria-label="Report period">
              {PERIODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={period === item ? 'is-on' : ''}
                  onClick={() => setPeriod(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="report-actions">
            <button
              type="button"
              className="ghost-btn"
              disabled={!html}
              onClick={() => report && downloadReport(html, reportFileName(report))}
            >
              <Icon name="download" size={14} /> Download
            </button>
            <button type="button" className="primary-btn sm" disabled={!html} onClick={() => printReport(html)}>
              <Icon name="printer" size={14} /> Print
            </button>
            <button type="button" className="ghost-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {error && <p className="danger-text">{error}</p>}
        {loading && !error && (
          <p className="muted">Building {period.toLowerCase()} performance, meetings, and minutes…</p>
        )}

        {report && !loading && (
          <>
            <section className="report-kpis">
              <div>
                <strong>{report.performance.completionRate}%</strong>
                <span>Completion rate</span>
              </div>
              <div>
                <strong>{report.performance.closed}</strong>
                <span>Closed {scope}</span>
              </div>
              <div>
                <strong>{report.performance.onTime}</strong>
                <span>On time</span>
              </div>
              <div>
                <strong className={report.performance.overdue ? 'danger-text' : ''}>
                  {report.performance.overdue}
                </strong>
                <span>Overdue</span>
              </div>
              <div>
                <strong>{report.performance.meetings}</strong>
                <span>Meetings</span>
              </div>
              <div>
                <strong>{report.performance.activities}</strong>
                <span>Activities</span>
              </div>
              <div>
                <strong>{report.performance.openActions}</strong>
                <span>Open actions</span>
              </div>
              <div>
                <strong>{report.performance.hubLog}</strong>
                <span>Hub incident log</span>
              </div>
            </section>

            <section>
              <h3>Hub incident log</h3>
              {report.hubLog.length === 0 ? (
                <p className="muted">No extract, late-reporting, or incident entries {scope}.</p>
              ) : (
                <div className="data-table">
                  <div className="data-head report-log-head">
                    <span>When</span>
                    <span>Kind</span>
                    <span>What happened</span>
                    <span>Where</span>
                  </div>
                  {report.hubLog.map((entry) => (
                    <div key={`${entry.at}-${entry.title}`} className="data-row report-log-head">
                      <span>{entry.at}</span>
                      <strong>{entry.kind}</strong>
                      <span>
                        {entry.title}
                        {entry.detail ? ` · ${entry.detail}` : ''}
                      </span>
                      <span>
                        {entry.place} · {entry.author}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3>Individual performance</h3>
              <div className="data-table">
                <div className="data-head report-people-head">
                  <span>Name</span>
                  <span>Role</span>
                  <span>Closed</span>
                  <span>Open</span>
                  <span>Overdue</span>
                </div>
                {report.people.map((person) => (
                  <div key={person.name} className="data-row report-people-head">
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                    <span>{person.closed}</span>
                    <span>{person.open}</span>
                    <span className={person.overdue ? 'danger-text' : ''}>{person.overdue}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3>Meetings, agenda, and minutes</h3>
              <div className="report-meetings">
                {report.meetings.map((meeting) => (
                  <article key={meeting.id} className="report-meeting">
                    <header>
                      <h4>{meeting.title}</h4>
                      <p className="muted">{meeting.when}</p>
                      <p className="muted">Attendees: {meeting.attendees}</p>
                    </header>
                    <h5>Agenda</h5>
                    {agendaLines(meeting.agenda).length > 0 ? (
                      <ol className="report-agenda">
                        {agendaLines(meeting.agenda).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">Agenda not set for this session.</p>
                    )}
                    <h5>Minutes</h5>
                    <p>{meeting.notes || 'Minutes not captured for this session.'}</p>
                    <h5>Action items</h5>
                    {meeting.actions.length === 0 ? (
                      <p className="muted">No action items recorded.</p>
                    ) : (
                      <ul>
                        {meeting.actions.map((action) => (
                          <li key={`${action.title}-${action.owner}`}>
                            <strong>{action.title}</strong>
                            <span>
                              {action.place} · {action.owner} · {action.status} · {action.deadline}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section>
              <h3>Team activities</h3>
              {report.activities.length === 0 ? (
                <p className="muted">No trainings, field visits, or other activities {scope}.</p>
              ) : (
                <div className="data-table">
                  <div className="data-head report-log-head">
                    <span>Activity</span>
                    <span>Type</span>
                    <span>When</span>
                    <span>Place / attendees</span>
                  </div>
                  {report.activities.map((item) => (
                    <div key={item.id} className="data-row report-log-head">
                      <strong>{item.title}</strong>
                      <span>{item.kind}</span>
                      <span>{item.when}</span>
                      <span>
                        {item.place}
                        {item.attendees ? ` · ${item.attendees}` : ''}
                        {item.notes ? ` · ${item.notes}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </article>
    </div>
  )
}
