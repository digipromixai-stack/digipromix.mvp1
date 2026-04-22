-- Campaign table for AI-generated counter-campaigns

CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_id        UUID        REFERENCES detected_changes(id) ON DELETE SET NULL,
  competitor_id    UUID        REFERENCES competitors(id) ON DELETE CASCADE,
  competitor_name  TEXT        NOT NULL,
  competitor_event TEXT,

  -- AI-generated content
  campaign_name       TEXT    NOT NULL,
  headline            TEXT    NOT NULL,
  ad_copy             TEXT    NOT NULL,
  social_copy         TEXT,
  offer               TEXT,
  keywords            TEXT[]  NOT NULL DEFAULT '{}',
  landing_page_title  TEXT,
  landing_page_cta    TEXT,
  landing_page_body   TEXT,

  -- Metadata
  industry    TEXT,
  channels    TEXT[]  NOT NULL DEFAULT '{}',
  status      TEXT    NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','paused','completed')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_campaigns_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS campaigns_user_id_idx      ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS campaigns_competitor_id_idx ON campaigns(competitor_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx        ON campaigns(status);

-- Row-Level Security
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select ON campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY campaigns_insert ON campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY campaigns_update ON campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY campaigns_delete ON campaigns FOR DELETE USING (auth.uid() = user_id);
