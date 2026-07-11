-- campaigns_public_select previously applied to role "public" (i.e. both anon
-- AND authenticated), which meant ANY logged-in user could read every other
-- tenant's published campaign row (budget, ad_copy, competitor_name, etc.)
-- via a plain `select('*')` — this is how it was discovered: an authenticated
-- test user's Campaigns page showed a different real user's live campaigns.
--
-- Public landing pages (/lp/:slug) are visited by anonymous prospects, not
-- authenticated dashboard users, so scoping this policy to the `anon` role
-- preserves that feature while closing the cross-tenant leak for logged-in
-- users, who now rely solely on campaigns_select (auth.uid() = user_id).
DROP POLICY IF EXISTS campaigns_public_select ON campaigns;
CREATE POLICY campaigns_public_select ON campaigns
  FOR SELECT
  TO anon
  USING (published = true);
