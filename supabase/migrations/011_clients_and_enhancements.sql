-- ─────────────────────────────────────────────────────────────────────────────
-- 011 · Clients table + campaign enhancements (templates, budget, client FK)
-- ─────────────────────────────────────────────────────────────────────────────

-- Multi-client / agency support
CREATE TABLE IF NOT EXISTS clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  industry    TEXT,
  website     TEXT,
  logo_url    TEXT,
  notes       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_owner ON clients USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'clients_updated_at'
  ) THEN
    CREATE TRIGGER clients_updated_at
      BEFORE UPDATE ON clients
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Extend campaigns table
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS client_id    UUID    REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template     TEXT    NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS daily_budget INTEGER;        -- optional, in minor currency units (e.g. cents)

-- Index for client campaigns lookup
CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON campaigns(client_id);

-- Webhook preferences already in alert_preferences (webhook_url, webhook_enabled)
-- Ensure columns exist (idempotent) — they were added in 010 but add here as safety net
ALTER TABLE alert_preferences
  ADD COLUMN IF NOT EXISTS webhook_url     TEXT,
  ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN NOT NULL DEFAULT false;
