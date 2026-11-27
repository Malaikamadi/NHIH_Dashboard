-- Separate from snapshot-managed members; no foreign key because snapshots replace members.
CREATE TABLE IF NOT EXISTS member_notifications (
  member_id text PRIMARY KEY,
  member_name text NOT NULL,
  email text NOT NULL CHECK (length(email) <= 254),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR email <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS member_notifications_email_unique
  ON member_notifications (lower(email)) WHERE email <> '';
CREATE TABLE IF NOT EXISTS notification_history (
  week_start date NOT NULL,
  member_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','submitted','uncertain')),
  task_count integer NOT NULL CHECK (task_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, member_id)
);
-- A sending/uncertain record must be reconciled manually before retrying:
-- Gmail may accept a message even if the client loses the response.

ALTER TABLE notification_history ADD COLUMN IF NOT EXISTS ack_token_hash text;
ALTER TABLE notification_history ADD COLUMN IF NOT EXISTS ack_expires_at timestamptz;
ALTER TABLE notification_history ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS notification_ack_token_unique ON notification_history(ack_token_hash) WHERE ack_token_hash IS NOT NULL;
