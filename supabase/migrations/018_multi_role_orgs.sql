-- ─────────────────────────────────────────────────────────────────────────────
-- 018 · Multi-role business accounts (Owner / Admin / Member) + Team plan
--
-- Introduces organizations + organization_members so a single business
-- (identified by its Owner's auth uid, exactly like every existing user_id
-- column already does) can grant teammates access without touching the
-- schema of any existing table.
--
-- current_business_id() resolves "which business does the caller act as"
-- (self for solo users, the Owner's id for active teammates) and replaces
-- auth.uid() in every existing RLS policy on business-data tables.
-- current_business_role() resolves the caller's role, defaulting to 'owner'
-- for solo users so existing single-user behavior is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. organizations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'My Business',
  plan        text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'team')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. organization_members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES profiles(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
  invited_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  joined_at        timestamptz,
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);

-- ── 3. Resolver functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_business_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.owner_id
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = auth.uid() AND m.status = 'active'
       LIMIT 1),
    auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION current_business_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT m.role FROM organization_members m
       WHERE m.user_id = auth.uid() AND m.status = 'active'
       LIMIT 1),
    'owner'
  );
$$;

CREATE OR REPLACE FUNCTION my_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT id FROM organizations WHERE owner_id = auth.uid()),
    (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active' LIMIT 1)
  );
$$;

-- Called client-side right after login (alongside ensureProfile) so an
-- invited teammate's membership flips from 'pending' to 'active' the first
-- time they sign in.
CREATE OR REPLACE FUNCTION accept_pending_invites()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organization_members
  SET status = 'active', joined_at = now()
  WHERE user_id = auth.uid() AND status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION current_business_role() TO authenticated;
GRANT EXECUTE ON FUNCTION my_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION accept_pending_invites() TO authenticated;

-- ── 4. RLS on the new tables ──────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select ON organizations;
CREATE POLICY organizations_select ON organizations
  FOR SELECT USING (id = my_organization_id());

DROP POLICY IF EXISTS organizations_update ON organizations;
CREATE POLICY organizations_update ON organizations
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS organizations_insert ON organizations;
CREATE POLICY organizations_insert ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS org_members_select ON organization_members;
CREATE POLICY org_members_select ON organization_members
  FOR SELECT USING (organization_id = my_organization_id());

DROP POLICY IF EXISTS org_members_insert ON organization_members;
CREATE POLICY org_members_insert ON organization_members
  FOR INSERT WITH CHECK (
    organization_id = my_organization_id()
    AND current_business_role() IN ('owner', 'admin')
    AND role <> 'owner'
  );

DROP POLICY IF EXISTS org_members_update ON organization_members;
CREATE POLICY org_members_update ON organization_members
  FOR UPDATE USING (
    organization_id = my_organization_id()
    AND current_business_role() IN ('owner', 'admin')
    AND role <> 'owner'
  );

DROP POLICY IF EXISTS org_members_delete ON organization_members;
CREATE POLICY org_members_delete ON organization_members
  FOR DELETE USING (
    organization_id = my_organization_id()
    AND current_business_role() IN ('owner', 'admin')
    AND role <> 'owner'
  );

-- ── 5. Rewrite RLS on existing business-data tables ──────────────────────────
-- Same auth.uid() = user_id predicate everywhere, swapped for
-- user_id = current_business_id() so active teammates share the Owner's data.
-- Per-person tables (profiles) are intentionally left untouched.
--
-- Policy names below were taken from a live `pg_policies` snapshot of the
-- production project (they've drifted from the tracked migration files —
-- several were renamed/restructured directly), so DROP/CREATE targets the
-- names that actually exist today rather than the ones in 001-017.

-- competitors
DROP POLICY IF EXISTS "Users can view own competitors" ON competitors;
CREATE POLICY "Users can view own competitors" ON competitors
  FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can insert own competitors" ON competitors;
CREATE POLICY "Users can insert own competitors" ON competitors
  FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can update own competitors" ON competitors;
CREATE POLICY "Users can update own competitors" ON competitors
  FOR UPDATE USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can delete own competitors" ON competitors;
CREATE POLICY "Users can delete own competitors" ON competitors
  FOR DELETE USING (user_id = current_business_id());

-- monitored_pages
DROP POLICY IF EXISTS "Users can view own monitored_pages" ON monitored_pages;
CREATE POLICY "Users can view own monitored_pages" ON monitored_pages
  FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can insert own monitored_pages" ON monitored_pages;
CREATE POLICY "Users can insert own monitored_pages" ON monitored_pages
  FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can update own monitored_pages" ON monitored_pages;
CREATE POLICY "Users can update own monitored_pages" ON monitored_pages
  FOR UPDATE USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can delete own monitored_pages" ON monitored_pages;
CREATE POLICY "Users can delete own monitored_pages" ON monitored_pages
  FOR DELETE USING (user_id = current_business_id());

-- page_snapshots (read-only for users; edge functions use service role)
DROP POLICY IF EXISTS "Users view own snapshots" ON page_snapshots;
CREATE POLICY "Users view own snapshots" ON page_snapshots
  FOR SELECT USING (user_id = current_business_id());

-- detected_changes
DROP POLICY IF EXISTS "Users view own changes" ON detected_changes;
CREATE POLICY "Users view own changes" ON detected_changes
  FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users update own changes" ON detected_changes;
CREATE POLICY "Users update own changes" ON detected_changes
  FOR UPDATE USING (user_id = current_business_id());

-- diffs (scoped via detected_changes.user_id join)
DROP POLICY IF EXISTS "Users view own diffs" ON diffs;
CREATE POLICY "Users view own diffs" ON diffs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM detected_changes dc WHERE dc.id = diffs.detected_change_id AND dc.user_id = current_business_id())
  );

-- alerts
DROP POLICY IF EXISTS "Users can view own alerts" ON alerts;
CREATE POLICY "Users can view own alerts" ON alerts
  FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can update own alerts" ON alerts;
CREATE POLICY "Users can update own alerts" ON alerts
  FOR UPDATE USING (user_id = current_business_id());

-- alert_preferences
DROP POLICY IF EXISTS "Users can view own alert_preferences" ON alert_preferences;
CREATE POLICY "Users can view own alert_preferences" ON alert_preferences
  FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can insert own alert_preferences" ON alert_preferences;
CREATE POLICY "Users can insert own alert_preferences" ON alert_preferences
  FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "Users can update own alert_preferences" ON alert_preferences;
CREATE POLICY "Users can update own alert_preferences" ON alert_preferences
  FOR UPDATE USING (user_id = current_business_id());

-- crawl_jobs (scoped via monitored_pages.user_id join)
DROP POLICY IF EXISTS "Users view own crawl_jobs" ON crawl_jobs;
CREATE POLICY "Users view own crawl_jobs" ON crawl_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM monitored_pages mp WHERE mp.id = crawl_jobs.monitored_page_id AND mp.user_id = current_business_id())
  );

-- campaigns (campaigns_public_select is anon-facing and stays untouched)
DROP POLICY IF EXISTS campaigns_select ON campaigns;
CREATE POLICY campaigns_select ON campaigns FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS campaigns_insert ON campaigns;
CREATE POLICY campaigns_insert ON campaigns FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS campaigns_update ON campaigns;
CREATE POLICY campaigns_update ON campaigns FOR UPDATE USING (user_id = current_business_id());
DROP POLICY IF EXISTS campaigns_delete ON campaigns;
CREATE POLICY campaigns_delete ON campaigns FOR DELETE USING (user_id = current_business_id());

-- ad_integrations
DROP POLICY IF EXISTS ad_integrations_select ON ad_integrations;
CREATE POLICY ad_integrations_select ON ad_integrations FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS ad_integrations_insert ON ad_integrations;
CREATE POLICY ad_integrations_insert ON ad_integrations FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS ad_integrations_update ON ad_integrations;
CREATE POLICY ad_integrations_update ON ad_integrations FOR UPDATE USING (user_id = current_business_id());
DROP POLICY IF EXISTS ad_integrations_delete ON ad_integrations;
CREATE POLICY ad_integrations_delete ON ad_integrations FOR DELETE USING (user_id = current_business_id());

-- ad_campaigns
DROP POLICY IF EXISTS "ad_campaigns_select_own" ON ad_campaigns;
CREATE POLICY "ad_campaigns_select_own" ON ad_campaigns FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "ad_campaigns_insert_own" ON ad_campaigns;
CREATE POLICY "ad_campaigns_insert_own" ON ad_campaigns FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "ad_campaigns_update_own" ON ad_campaigns;
CREATE POLICY "ad_campaigns_update_own" ON ad_campaigns FOR UPDATE USING (user_id = current_business_id());

-- managed_ads_accounts
DROP POLICY IF EXISTS "Users view own managed accounts" ON managed_ads_accounts;
CREATE POLICY "Users view own managed accounts" ON managed_ads_accounts FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users insert own managed accounts" ON managed_ads_accounts;
CREATE POLICY "Users insert own managed accounts" ON managed_ads_accounts FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "Users update own managed accounts" ON managed_ads_accounts;
CREATE POLICY "Users update own managed accounts" ON managed_ads_accounts FOR UPDATE USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users delete own managed accounts" ON managed_ads_accounts;
CREATE POLICY "Users delete own managed accounts" ON managed_ads_accounts FOR DELETE USING (user_id = current_business_id());

-- keyword_alerts (single ALL policy live)
DROP POLICY IF EXISTS "Users manage own keyword_alerts" ON keyword_alerts;
CREATE POLICY "Users manage own keyword_alerts" ON keyword_alerts
  USING (user_id = current_business_id()) WITH CHECK (user_id = current_business_id());

-- leads (leads_insert stays permissive `true` — submit-lead writes as anon)
DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE USING (user_id = current_business_id());
DROP POLICY IF EXISTS leads_delete ON leads;
CREATE POLICY leads_delete ON leads FOR DELETE USING (user_id = current_business_id());

-- signals
DROP POLICY IF EXISTS "Users view own signals" ON signals;
CREATE POLICY "Users view own signals" ON signals FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users insert own signals" ON signals;
CREATE POLICY "Users insert own signals" ON signals FOR INSERT WITH CHECK (user_id = current_business_id());

-- opportunities
DROP POLICY IF EXISTS "Users view own opportunities" ON opportunities;
CREATE POLICY "Users view own opportunities" ON opportunities FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users update own opportunities" ON opportunities;
CREATE POLICY "Users update own opportunities" ON opportunities
  FOR UPDATE USING (user_id = current_business_id()) WITH CHECK (user_id = current_business_id());

-- ai_recommendations
DROP POLICY IF EXISTS "Users view own recommendations" ON ai_recommendations;
CREATE POLICY "Users view own recommendations" ON ai_recommendations FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users insert own recommendations" ON ai_recommendations;
CREATE POLICY "Users insert own recommendations" ON ai_recommendations FOR INSERT WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "Users update own recommendations" ON ai_recommendations;
CREATE POLICY "Users update own recommendations" ON ai_recommendations
  FOR UPDATE USING (user_id = current_business_id()) WITH CHECK (user_id = current_business_id());
DROP POLICY IF EXISTS "Users delete own recommendations" ON ai_recommendations;
CREATE POLICY "Users delete own recommendations" ON ai_recommendations FOR DELETE USING (user_id = current_business_id());

-- campaign_embeddings
DROP POLICY IF EXISTS "Users view own embeddings" ON campaign_embeddings;
CREATE POLICY "Users view own embeddings" ON campaign_embeddings FOR SELECT USING (user_id = current_business_id());
DROP POLICY IF EXISTS "Users insert own embeddings" ON campaign_embeddings;
CREATE POLICY "Users insert own embeddings" ON campaign_embeddings FOR INSERT WITH CHECK (user_id = current_business_id());

-- campaign_performance
DROP POLICY IF EXISTS "Users view own perf" ON campaign_performance;
CREATE POLICY "Users view own perf" ON campaign_performance FOR SELECT USING (user_id = current_business_id());

-- lead_scores
DROP POLICY IF EXISTS "Users view own lead scores" ON lead_scores;
CREATE POLICY "Users view own lead scores" ON lead_scores FOR SELECT USING (user_id = current_business_id());

-- campaign_metrics (RLS enabled with no policies live — add one so the business can read it)
DROP POLICY IF EXISTS cm_owner ON campaign_metrics;
CREATE POLICY cm_owner ON campaign_metrics
  USING (user_id = current_business_id()) WITH CHECK (user_id = current_business_id());

-- clients
DROP POLICY IF EXISTS clients_owner ON clients;
CREATE POLICY clients_owner ON clients
  USING (user_id = current_business_id()) WITH CHECK (user_id = current_business_id());

-- match_campaign_embeddings RPC filters by match_user_id — update its callers
-- (score-opportunities, embed-campaign) to pass current_business_id() equivalent
-- at the application layer; the function itself stays generic (SECURITY DEFINER,
-- already accepts an explicit user id argument, no RLS bypass concern here).
