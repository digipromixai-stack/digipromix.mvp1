-- 021_profile_main_offer.sql
-- Business profile set-up after sign-up: the customer's main offer, used by
-- generate-campaign alongside selling_point.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS main_offer TEXT;
