PRAGMA foreign_keys = ON;

CREATE TABLE transfer_cases (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  pet_name TEXT NOT NULL CHECK(length(pet_name) BETWEEN 1 AND 120),
  owner_display_name TEXT CHECK(owner_display_name IS NULL OR length(owner_display_name) <= 160),
  internal_reference TEXT CHECK(internal_reference IS NULL OR length(internal_reference) <= 160),
  public_reference TEXT CHECK(public_reference IS NULL OR length(public_reference) <= 160),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'closed', 'expired', 'deleted')),
  allow_replies INTEGER NOT NULL DEFAULT 1 CHECK(allow_replies IN (0, 1)),
  allow_callback INTEGER NOT NULL DEFAULT 1 CHECK(allow_callback IN (0, 1)),
  max_submissions INTEGER NOT NULL DEFAULT 3
    CHECK(max_submissions BETWEEN 1 AND 5),
  max_total_bytes INTEGER NOT NULL DEFAULT 104857600
    CHECK(max_total_bytes BETWEEN 1048576 AND 262144000),
  submission_count INTEGER NOT NULL DEFAULT 0 CHECK(submission_count >= 0),
  total_bytes INTEGER NOT NULL DEFAULT 0 CHECK(total_bytes >= 0),
  created_by_sub TEXT NOT NULL,
  created_by_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  exported_at TEXT,
  closed_at TEXT,
  delete_after TEXT NOT NULL
);

CREATE TABLE transfer_tokens (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  token_version TEXT NOT NULL DEFAULT 'dt1',
  token_hmac TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0)
);

CREATE TABLE transfer_sessions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL REFERENCES transfer_tokens(id) ON DELETE CASCADE,
  session_hmac TEXT NOT NULL UNIQUE,
  csrf_hmac TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE transfer_submissions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 20 AND 8000),
  observed_since TEXT CHECK(observed_since IS NULL OR length(observed_since) <= 200),
  urgency TEXT NOT NULL DEFAULT 'normal'
    CHECK(urgency IN ('normal', 'callback_requested')),
  callback_requested INTEGER NOT NULL DEFAULT 0
    CHECK(callback_requested IN (0, 1)),
  callback_phone TEXT CHECK(callback_phone IS NULL OR length(callback_phone) <= 40),
  notification_email TEXT CHECK(notification_email IS NULL OR length(notification_email) <= 254),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft', 'submitted', 'reviewing', 'callback_planned', 'replied', 'closed')),
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE transfer_files (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK(length(original_name) BETWEEN 1 AND 255),
  declared_media_type TEXT NOT NULL,
  verified_media_type TEXT,
  expected_size INTEGER NOT NULL CHECK(expected_size BETWEEN 1 AND 52428800),
  stored_size INTEGER,
  etag TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending', 'uploading', 'stored', 'rejected', 'deleted')),
  inline_safe INTEGER NOT NULL DEFAULT 0 CHECK(inline_safe IN (0, 1)),
  created_at TEXT NOT NULL,
  uploaded_at TEXT,
  delete_after TEXT NOT NULL
);

CREATE TABLE transfer_links (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK(length(url) BETWEEN 8 AND 2048),
  label TEXT CHECK(label IS NULL OR length(label) <= 160),
  created_at TEXT NOT NULL
);

CREATE TABLE transfer_replies (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES transfer_submissions(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),
  created_by_sub TEXT NOT NULL,
  created_by_email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE transfer_notifications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  reply_id TEXT REFERENCES transfer_replies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK(kind IN ('practice_submission', 'customer_reply')),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending', 'queued', 'sent', 'failed', 'abandoned')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE transfer_audit_events (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES transfer_cases(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('admin', 'customer_session', 'system')),
  actor_reference TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_transfer_cases_status_expires
  ON transfer_cases(status, expires_at);

CREATE INDEX idx_transfer_tokens_case
  ON transfer_tokens(case_id, revoked_at, expires_at);

CREATE INDEX idx_transfer_sessions_hmac
  ON transfer_sessions(session_hmac, revoked_at, expires_at);

CREATE INDEX idx_transfer_submissions_case_created
  ON transfer_submissions(case_id, created_at DESC);

CREATE INDEX idx_transfer_files_submission_state
  ON transfer_files(submission_id, state);

CREATE INDEX idx_transfer_notifications_state_created
  ON transfer_notifications(state, created_at);
