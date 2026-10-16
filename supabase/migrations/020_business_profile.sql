-- 020_business_profile.sql
-- Add business profile onboarding fields to profiles table

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS selling_point TEXT,
  ADD COLUMN IF NOT EXISTS default_landing_page_url TEXT,
  ADD COLUMN IF NOT EXISTS value_per_lead NUMERIC DEFAULT 80;
