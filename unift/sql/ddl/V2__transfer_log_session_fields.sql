-- Migration: add session_id and username columns to transfer_log
-- Allows historical transfer queries to be filtered by session and SSH user.

ALTER TABLE transfer_log
    ADD COLUMN IF NOT EXISTS session_id  VARCHAR(64),
    ADD COLUMN IF NOT EXISTS username    VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_transfer_log_session  ON transfer_log(session_id);
CREATE INDEX IF NOT EXISTS idx_transfer_log_username ON transfer_log(username);
