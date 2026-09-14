import { useEffect, useState } from 'react'
import { fetchWeeklyReport, fetchWeeklyReportHtml } from '../api'
import type { WeeklyReport as WeeklyReportData } from '../utils/report'
import { downloadReport, printReport, reportFileName } from '../utils/report'
import { agendaLines } from '../utils/metrics'
import { Icon } from './Icons'

interface Props {
  onClose: () => void
}

export function WeeklyReportModal({ onClose }: Props) {
  const [report, setReport] = useState<WeeklyReportData | null>(null)
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchWeeklyReport(), fetchWeeklyReportHtml()])
      .then(([next, markup]) => {
        if (cancelled) return
        setReport(next)
        setHtml(markup)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the weekly report from the server.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="report-scrim" onClick={onClose}>
      <article className="report-panel" onClick={(e) => e.stopPropagation()}>
        <header className="report-h">
          <div>
            <div className="hdr-kicker">Weekly operations report</div>
            <h2>Team performance, hub log, meetings, and minutes</h2>
            <p className="muted">{report?.rangeLabel ?? 'Loading from the operations API'}</p>
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
        {!report && !error && <p className="muted">Building this week’s performance, meetings, and minutes…</p>}

        {report && (
          <>
            <section className="report-kpis">
              <div>
                <strong>{report.performance.completionRate}%</strong>
                <span>Completion rate</span>
              </div>
              <div>
                <strong>{report.performance.closed}</strong>
                <span>Closed this week</span>
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
                <strong>{report.performance.openActions}</strong>
                <span>Open actions</span>
              </div>
              <div>
                <strong>{report.performance.hubLog}</strong>
                <span>Hub log</span>
              </div>
            </section>

            <section>
              <h3>Hub log</h3>
              {report.hubLog.length === 0 ? (
                <p className="muted">No extract, late-reporting, or incident entries this week.</p>
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
          </>
        )}
      </article>
    </div>
  )
}
