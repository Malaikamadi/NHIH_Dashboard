#!/usr/bin/env python3
import argparse
import base64
import datetime as dt
import json
import subprocess
from email.message import EmailMessage
from email.headerregistry import Address
import os

SENDER = "nationalhealthinformationhub@gmail.com"
TOKEN = "/var/lib/nhih-monitor/oauth/token.json"

def query(sql, variables=None):
    cmd = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "nhih"]
    for key, value in (variables or {}).items():
        cmd += ["-v", key + "=" + str(value)]
    return subprocess.run(cmd, input=sql, text=True, capture_output=True, check=True).stdout.strip()

def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--send", action="store_true")
    mode.add_argument("--test-to")
    args = parser.parse_args()
    today = dt.datetime.now(dt.timezone.utc).date()
    week = today - dt.timedelta(days=today.weekday())
    rows = json.loads(query("""
      SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (
        SELECT m.id, m.name, n.email, COALESCE(n.enabled,false) AS enabled,
          json_agg(json_build_object('title',t.title,'priority',t.priority,
          'due',to_char(t.due_date AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI'),
          'status',CASE WHEN t.due_date < now() THEN 'overdue' ELSE t.status END,
          'progress',t.progress) ORDER BY t.due_date) AS tasks
        FROM members m JOIN tasks t ON t.assigned_to::jsonb ? m.id
        LEFT JOIN member_notifications n ON n.member_id=m.id AND n.member_name=m.name
        WHERE t.status IN ('not_started','in_progress','under_review','overdue')
        GROUP BY m.id,m.name,n.email,n.enabled
      ) x;
    """))
    print(json.dumps({"members_with_pending_tasks":len(rows),
        "eligible":sum(bool(r["enabled"] and r["email"]) for r in rows),
        "mode":"live" if args.send else "test" if args.test_to else "preview"}))
    if not args.send and not args.test_to:
        return
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    creds = Credentials.from_authorized_user_file(TOKEN, ["https://www.googleapis.com/auth/gmail.send"])
    creds.refresh(Request())
    service = build("gmail","v1",credentials=creds,cache_discovery=False)
    def deliver(recipient, subject, body):
        msg = EmailMessage()
        msg["From"] = Address("NHIH Operations", addr_spec=SENDER)
        msg["To"] = Address(addr_spec=recipient)
        msg["Subject"] = subject
        msg.set_content(body)
        service.users().messages().send(userId="me",body={
            "raw":base64.urlsafe_b64encode(msg.as_bytes()).decode()
        }).execute(num_retries=0)
    if args.test_to:
        deliver(args.test_to, "[TEST] NHIH Weekly Task Reminder",
                "This is a test of the official NHIH weekly notification service. No staff task details are included.")
        print("Test submitted")
        return
    failures = 0
    summary = []
    for row in rows:
        if not row["enabled"] or not row["email"]:
            summary.append(row["name"] + ": " + str(len(row["tasks"])) + " pending; not configured")
            continue
        params = {"week":week,"member":row["id"],"count":len(row["tasks"])}
        claimed = query("""INSERT INTO notification_history(week_start,member_id,status,task_count)
          VALUES (:'week',:'member','sending',:'count')
          ON CONFLICT DO NOTHING RETURNING member_id;""",params)
        if not claimed:
            summary.append(row["name"] + ": already recorded; see delivery history")
            continue
        lines = ["Dear " + row["name"] + ",", "", "Please review your outstanding tasks for this week.", ""]
        for i,t in enumerate(row["tasks"],1):
            lines.append(f"{i}. {t['title']} | {t['priority']} | {t['status']} | {t['progress']}% | Due: {t['due']} GMT")
        lines += ["","Please update your progress through the NHIH Operations Dashboard.",
                  "https://nhih-ops.tailecbac3.ts.net/", "", "NHIH Operations"]
        try:
            deliver(row["email"],"NHIH Weekly Outstanding Tasks", "\n".join(lines))
            status = "submitted"
        except Exception:
            status = "uncertain"
            failures += 1
        query("""UPDATE notification_history SET status=:'status',updated_at=now()
          WHERE week_start=:'week' AND member_id=:'member';""",dict(params,status=status))
        print(row["id"] + ": " + status)
        summary.append(row["name"] + ": " + str(len(row["tasks"])) + " pending; " + status)
    manager = os.environ.get("NHIH_NOTIFICATION_MANAGER", "")
    if manager:
        params = {"week":week,"member":"__management__","count":max(1,len(rows))}
        claimed = query("""INSERT INTO notification_history(week_start,member_id,status,task_count)
          VALUES (:'week',:'member','sending',:'count') ON CONFLICT DO NOTHING RETURNING member_id;""",params)
        if claimed:
            try:
                deliver(manager,"NHIH Weekly Task Notification Summary",
                        "\n".join(["Weekly task reminder summary", "", *(summary or ["No pending tasks"])]))
                status = "submitted"
            except Exception:
                status = "uncertain"
                failures += 1
            query("""UPDATE notification_history SET status=:'status',updated_at=now()
              WHERE week_start=:'week' AND member_id=:'member';""",dict(params,status=status))
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
