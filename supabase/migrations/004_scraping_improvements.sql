-- Migration 004: Scraping improvement columns
-- Adds structured_data to page_snapshots, metadata to detected_changes,
-- and requires_js_render flag to monitored_pages for future Phase 2 headless support.

ALTER TABLE page_snapshots
  ADD COLUMN IF NOT EXISTS structured_data jsonb;

ALTER TABLE detected_changes
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE monitored_pages
  ADD COLUMN IF NOT EXISTS requires_js_render boolean NOT NULL DEFAULT false;
