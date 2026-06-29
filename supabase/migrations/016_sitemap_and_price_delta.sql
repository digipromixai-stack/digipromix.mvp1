-- ── 1. monitored_pages — mark auto-discovered pages ─────────────────────────
ALTER TABLE monitored_pages
  ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_monitored_pages_auto_discovered
  ON monitored_pages(auto_discovered)
  WHERE auto_discovered = true;

-- ── 2. page_snapshots crawled_by — already in migration 005, defensive add ───
ALTER TABLE page_snapshots
  ADD COLUMN IF NOT EXISTS crawled_by TEXT DEFAULT 'python';
