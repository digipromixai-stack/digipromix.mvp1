-- Migration 007: Ad platform integrations (Google Ads OAuth2)
-- Stores per-user OAuth tokens and account info for connected ad platforms

CREATE TABLE IF NOT EXISTS ad_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('google_ads', 'meta_ads')),
  -- OAuth tokens (encrypted at rest by Supabase)
  access_token    text,
  refresh_token   text NOT NULL,
  token_expires_at timestamptz,
  -- Platform-specific account info
  account_id      text,          -- Google: customer_id (e.g. "123-456-7890"), Meta: ad_account_id
  account_name    text,          -- Human-readable label shown in UI
  -- Status
  is_active       boolean NOT NULL DEFAULT true,
  last_error      text,
  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- One integration per platform per user
  UNIQUE (user_id, platform)
);

-- RLS: users can only see and modify their own integrations
ALTER TABLE ad_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_integrations_select_own" ON ad_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ad_integrations_insert_own" ON ad_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ad_integrations_update_own" ON ad_integrations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ad_integrations_delete_own" ON ad_integrations
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ad_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ad_integrations_updated_at
  BEFORE UPDATE ON ad_integrations
  FOR EACH ROW EXECUTE FUNCTION update_ad_integrations_updated_at();

-- Table for launched counter-campaigns (audit log)
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitor_id   uuid REFERENCES competitors(id) ON DELETE SET NULL,
  change_id       uuid REFERENCES detected_changes(id) ON DELETE SET NULL,
  platform        text NOT NULL CHECK (platform IN ('google_ads', 'meta_ads')),
  -- Platform IDs returned after creation
  external_campaign_id  text,
  external_ad_group_id  text,
  -- Campaign details
  campaign_name   text NOT NULL,
  headline        text,
  description     text,
  final_url       text,
  daily_budget_usd numeric(10,2),
  -- Status
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'creating', 'paused', 'active', 'error')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_campaigns_select_own" ON ad_campaigns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ad_campaigns_insert_own" ON ad_campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ad_campaigns_update_own" ON ad_campaigns
  FOR UPDATE USING (auth.uid() = user_id);
