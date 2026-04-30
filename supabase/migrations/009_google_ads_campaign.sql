-- Google Ads integration: extend campaigns + ad_integrations

-- Track IDs for Google Ads campaign objects we create
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS google_campaign_id  TEXT,
  ADD COLUMN IF NOT EXISTS google_ad_group_id  TEXT,
  ADD COLUMN IF NOT EXISTS google_ad_id        TEXT,
  ADD COLUMN IF NOT EXISTS google_error        TEXT;

-- Extend ad_integrations with Google-specific fields.
-- account_id doubles as Google Ads customer_id (digits, no dashes).
ALTER TABLE ad_integrations
  ADD COLUMN IF NOT EXISTS refresh_token     TEXT,
  ADD COLUMN IF NOT EXISTS login_customer_id TEXT;
