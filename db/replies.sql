CREATE TABLE IF NOT EXISTS vehicle_replies (
  request_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  reply TEXT,
  reply_message_id INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS vehicle_replies_expiry
  ON vehicle_replies (expires_at);
