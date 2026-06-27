-- ─────────────────────────────────────────────────────────────────────────────
-- 015 · Missing RPCs, page_snapshots columns, and submit-lead fix
--
-- Adds:
--   1. get_vault_secret(secret_name)           — used by 8+ edge functions
--   2. increment_campaign_leads_count(id)       — used by submit-lead
--   3. page_snapshots extra columns             — used by crawl-page
--        normalized_text, etag, last_modified, content_size, fetch_ms
--   4. Fix submit-lead duplicate check         — safer OR via multiple filters
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. get_vault_secret ───────────────────────────────────────────────────────
-- Reads a secret from Supabase Vault by name.
-- Called by: generate-campaign, embed-campaign, launch-google-ads-campaign,
--            manage-google-ads-campaign, optimize-campaigns, google-ads-oauth,
--            meta-oauth, score-opportunities
-- Requires: vault extension (enabled by default on Supabase)

CREATE OR REPLACE FUNCTION get_vault_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret
  INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;

  RETURN secret_value;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Only service role should call this — not exposed to anon/authenticated users
REVOKE ALL ON FUNCTION get_vault_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_vault_secret(TEXT) TO service_role;

-- ── 2. increment_campaign_leads_count ────────────────────────────────────────
-- Atomically increments campaigns.leads_count.
-- Called by: submit-lead after inserting a new lead row.

CREATE OR REPLACE FUNCTION increment_campaign_leads_count(campaign_id_param UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE campaigns
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE id = campaign_id_param;
$$;

REVOKE ALL ON FUNCTION increment_campaign_leads_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_campaign_leads_count(UUID) TO service_role;

-- ── 3. page_snapshots — crawl-page extra columns ─────────────────────────────
-- crawl-page stores these on every snapshot row.
-- detect-changes falls back to normalized_text when Storage upload fails.

ALTER TABLE page_snapshots
  ADD COLUMN IF NOT EXISTS normalized_text  TEXT,
  ADD COLUMN IF NOT EXISTS etag             TEXT,
  ADD COLUMN IF NOT EXISTS last_modified    TEXT,
  ADD COLUMN IF NOT EXISTS content_size     INTEGER,
  ADD COLUMN IF NOT EXISTS fetch_ms         INTEGER;

-- Index on etag for fast conditional-GET lookups
CREATE INDEX IF NOT EXISTS idx_page_snapshots_etag
  ON page_snapshots(etag)
  WHERE etag IS NOT NULL;

-- ── 4. campaigns — ensure leads_count column exists ──────────────────────────
-- increment_campaign_leads_count references this column.
-- Added defensively in case an older migration missed it.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS leads_count INTEGER NOT NULL DEFAULT 0;
