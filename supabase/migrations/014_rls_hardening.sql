-- Migration 014: RLS hardening — add WITH CHECK to INSERT policies,
-- fill missing INSERT/UPDATE/DELETE on managed_ads_accounts, detected_changes,
-- ai_recommendations, campaign_embeddings, signals

-- campaigns INSERT: enforce user_id matches caller
DROP POLICY IF EXISTS campaigns_insert ON public.campaigns;
CREATE POLICY campaigns_insert ON public.campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- competitors INSERT
DROP POLICY IF EXISTS "Users can insert own competitors" ON public.competitors;
CREATE POLICY "Users can insert own competitors" ON public.competitors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- monitored_pages INSERT
DROP POLICY IF EXISTS "Users can insert own monitored_pages" ON public.monitored_pages;
CREATE POLICY "Users can insert own monitored_pages" ON public.monitored_pages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- leads INSERT: remains permissive (submit-lead edge fn inserts as anon)
DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
  FOR INSERT WITH CHECK (true);

-- profiles INSERT
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- alert_preferences INSERT
DROP POLICY IF EXISTS "Users can insert own alert_preferences" ON public.alert_preferences;
CREATE POLICY "Users can insert own alert_preferences" ON public.alert_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ad_integrations INSERT
DROP POLICY IF EXISTS ad_integrations_insert ON public.ad_integrations;
CREATE POLICY ad_integrations_insert ON public.ad_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ad_campaigns INSERT
DROP POLICY IF EXISTS ad_campaigns_insert_own ON public.ad_campaigns;
CREATE POLICY ad_campaigns_insert_own ON public.ad_campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- managed_ads_accounts: was missing all write policies
CREATE POLICY "Users insert own managed accounts" ON public.managed_ads_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own managed accounts" ON public.managed_ads_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own managed accounts" ON public.managed_ads_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- detected_changes: add UPDATE so is_read can be set from frontend
CREATE POLICY "Users update own changes" ON public.detected_changes
  FOR UPDATE USING (auth.uid() = user_id);

-- ai_recommendations: add INSERT (service role bypasses, but good hygiene)
CREATE POLICY "Users insert own recommendations" ON public.ai_recommendations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- campaign_embeddings: add INSERT
CREATE POLICY "Users insert own embeddings" ON public.campaign_embeddings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- signals: add INSERT
CREATE POLICY "Users insert own signals" ON public.signals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
