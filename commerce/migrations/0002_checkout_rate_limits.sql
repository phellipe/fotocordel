CREATE TABLE IF NOT EXISTS checkout_rate_limits (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, window_start)
);
CREATE INDEX IF NOT EXISTS checkout_rate_limits_window ON checkout_rate_limits(window_start);
