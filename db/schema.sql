-- NHIH local development schema (PostgreSQL)
-- Maps 1:1 from the Redis OpsState JSON snapshot. Production remains on Upstash Redis.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  initials TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- JSON array of member ids, e.g. ["m1","m2"]
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL REFERENCES members (id),
  priority TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  from_action_item_id TEXT,
  work_kind TEXT NOT NULL,
  work_kind_other TEXT,
  -- JSON array of district ids, e.g. ["bo","kenema"]
  district TEXT NOT NULL,
  facility TEXT
);
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  agenda TEXT,
  notes TEXT,
  rolling BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id TEXT NOT NULL REFERENCES meetings (id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members (id),
  PRIMARY KEY (meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  kind_other TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  district TEXT NOT NULL,
  facility TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS activity_participants (
  activity_id TEXT NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members (id),
  PRIMARY KEY (activity_id, member_id)
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  meeting_title TEXT NOT NULL,
  title TEXT NOT NULL,
  -- JSON array of member ids, e.g. ["m1","m2"]
  assigned_to TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  converted_to_task_id TEXT,
  work_kind TEXT NOT NULL,
  work_kind_other TEXT,
  -- JSON array of district ids, e.g. ["bo","kenema"]
  district TEXT NOT NULL,
  facility TEXT
);

CREATE TABLE IF NOT EXISTS hub_log (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL,
  facility TEXT,
  author_id TEXT NOT NULL REFERENCES members (id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL,
  tone TEXT NOT NULL 
);

CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS meetings_start_time_idx ON meetings (start_time);
CREATE INDEX IF NOT EXISTS activities_start_time_idx ON activities (start_time);
CREATE INDEX IF NOT EXISTS hub_log_at_idx ON hub_log (at DESC);
CREATE INDEX IF NOT EXISTS activity_events_at_idx ON activity_events (at DESC);
