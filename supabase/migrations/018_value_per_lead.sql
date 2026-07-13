-- ── value_per_lead — user-configurable lead value for ROI/revenue estimates ──
-- Previously hardcoded and inconsistent across the app ($150 in InterceptionPage,
-- $80 in DashboardPage/OpportunityFeedPage, $300-per-opportunity in DashboardPage).
-- A single lead is worth wildly different amounts across industries (a plumber's
-- lead vs. a B2B SaaS lead), so this must be a per-account setting, not a constant.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS value_per_lead NUMERIC NOT NULL DEFAULT 100;
