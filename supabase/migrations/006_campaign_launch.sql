-- Migration 006: Add campaign_launch change type
-- The detect-changes Edge Function (v6) emits campaign_launch when
-- multi-signal scoring detects a coordinated promotional campaign.
-- We need to widen the CHECK constraint to allow this new value.

ALTER TABLE detected_changes
  DROP CONSTRAINT IF EXISTS detected_changes_change_type_check;

ALTER TABLE detected_changes
  ADD CONSTRAINT detected_changes_change_type_check
  CHECK (change_type IN (
    'promotion',
    'price_change',
    'new_landing_page',
    'new_blog_post',
    'banner_change',
    'content_change',
    'campaign_launch'
  ));
