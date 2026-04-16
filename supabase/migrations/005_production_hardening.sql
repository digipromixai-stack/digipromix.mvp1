-- =============================================
-- 005_production_hardening.sql
-- Indexes, constraints, and columns for production
-- =============================================

-- ── Composite indexes for scheduler queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_created
  ON crawl_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_started
  ON crawl_jobs(status, started_at);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_page_status
  ON crawl_jobs(monitored_page_id, status);

-- ── Prevent duplicate alerts per change/user/channel ─────────────────────
ALTER TABLE alerts
  ADD CONSTRAINT alerts_change_user_channel_unique
  UNIQUE (change_id, user_id, channel);

-- ── Faster detected_changes queries (dashboard, timeline) ────────────────
CREATE INDEX IF NOT EXISTS idx_detected_changes_user_detected
  ON detected_changes(user_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_detected_changes_competitor_detected
  ON detected_changes(competitor_id, detected_at DESC);

-- ── Faster monitored_pages lookup for scheduler ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_monitored_pages_active_competitor
  ON monitored_pages(is_active, competitor_id)
  WHERE is_active = true;

-- ── Track which crawler produced a snapshot ──────────────────────────────
ALTER TABLE page_snapshots
  ADD COLUMN IF NOT EXISTS crawled_by text DEFAULT 'python';

-- ── Track whether AI classified a change ─────────────────────────────────
ALTER TABLE detected_changes
  ADD COLUMN IF NOT EXISTS ai_classified boolean NOT NULL DEFAULT false;

-- ── Store error detail on failed email alerts ────────────────────────────
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS error_message text;
