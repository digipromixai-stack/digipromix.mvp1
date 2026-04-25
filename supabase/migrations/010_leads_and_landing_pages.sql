-- Leads table + landing page support + WhatsApp alerts

-- ── Leads ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id   UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
  competitor_id UUID        REFERENCES competitors(id) ON DELETE SET NULL,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  message       TEXT,
  source        TEXT        NOT NULL DEFAULT 'landing_page',
  score         INTEGER     NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS leads_user_id_idx     ON leads(user_id);
CREATE INDEX IF NOT EXISTS leads_campaign_id_idx  ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS leads_status_idx       ON leads(status);
CREATE INDEX IF NOT EXISTS leads_created_at_idx   ON leads(created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_select ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY leads_insert ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY leads_update ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY leads_delete ON leads FOR DELETE USING (auth.uid() = user_id);

-- ── Campaign: slug + published + leads_count ─────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS slug         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS published    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leads_count  INTEGER     NOT NULL DEFAULT 0;

-- Allow anyone to read published landing pages (needed for public /lp/:slug route)
CREATE POLICY campaigns_public_select ON campaigns
  FOR SELECT USING (published = true);

-- ── Alert preferences: WhatsApp ───────────────────────────────────
ALTER TABLE alert_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_number  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_alerts  BOOLEAN NOT NULL DEFAULT false;
