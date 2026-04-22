-- Ad platform integrations (Meta, Google – starting with Meta)

CREATE TABLE IF NOT EXISTS ad_integrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         TEXT        NOT NULL CHECK (platform IN ('meta', 'google')),

  -- OAuth tokens
  access_token     TEXT        NOT NULL,
  token_expires_at TIMESTAMPTZ,

  -- Meta ad account
  account_id       TEXT        NOT NULL,   -- e.g. act_123456789
  account_name     TEXT,

  -- Meta page (required for ad creatives)
  page_id          TEXT,
  page_name        TEXT,

  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, platform)
);

CREATE TRIGGER ad_integrations_updated_at
  BEFORE UPDATE ON ad_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ad_integrations_user_id_idx ON ad_integrations(user_id);

-- RLS
ALTER TABLE ad_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_integrations_select ON ad_integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ad_integrations_insert ON ad_integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ad_integrations_update ON ad_integrations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ad_integrations_delete ON ad_integrations FOR DELETE USING (auth.uid() = user_id);

-- Track which Meta campaign IDs we created per campaign
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS meta_campaign_id  TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_id     TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_id        TEXT,
  ADD COLUMN IF NOT EXISTS meta_error        TEXT,
  ADD COLUMN IF NOT EXISTS landing_page_url  TEXT;
