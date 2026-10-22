CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  buyer_token_hash TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK(amount = 999),
  currency TEXT NOT NULL CHECK(currency = 'brl'),
  mode TEXT NOT NULL CHECK(mode IN ('test', 'live')),
  edition TEXT NOT NULL CHECK(edition IN ('v1', 'v2')),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_checkout_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  downloaded_at INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orders_payment_intent ON orders(stripe_payment_intent_id);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  object_id TEXT,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
