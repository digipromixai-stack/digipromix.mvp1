-- Migration 006: Add campaign_launch change type
-- Widens the CHECK constraint on detected_changes.change_type to include campaign_launch

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
