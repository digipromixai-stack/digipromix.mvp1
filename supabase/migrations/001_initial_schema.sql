-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================
-- UPDATED_AT trigger function
-- =====================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- profiles
-- =====================
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  avatar_url  text,
  plan_type   text NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'premium')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================
-- competitors
-- =====================
CREATE TABLE IF NOT EXISTS competitors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name             text NOT NULL,
  website_url      text NOT NULL,
  industry         text,
  logo_url         text,
  crawl_frequency  text NOT NULL DEFAULT 'daily' CHECK (crawl_frequency IN ('daily', 'hourly')),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitors_user_id ON competitors(user_id);

CREATE TRIGGER competitors_updated_at
  BEFORE UPDATE ON competitors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================
-- monitored_pages
-- =====================
CREATE TABLE IF NOT EXISTS monitored_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url             text NOT NULL,
  page_type       text NOT NULL DEFAULT 'custom' CHECK (page_type IN ('home','pricing','promotions','blog','landing_page','custom')),
  is_active       boolean NOT NULL DEFAULT true,
  last_crawled_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competitor_id, url)
);

CREATE INDEX idx_monitored_pages_competitor_id ON monitored_pages(competitor_id);
CREATE INDEX idx_monitored_pages_user_id ON monitored_pages(user_id);

-- =====================
-- page_snapshots
-- =====================
CREATE TABLE IF NOT EXISTS page_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_page_id   uuid NOT NULL REFERENCES monitored_pages(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path        text NOT NULL,
  content_hash        text NOT NULL,
  normalized_hash     text,
  prices_json         text,
  http_status         integer,
  crawled_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_snapshots_monitored_page_id ON page_snapshots(monitored_page_id);
CREATE INDEX idx_page_snapshots_crawled_at ON page_snapshots(crawled_at);

-- =====================
-- detected_changes
-- =====================
CREATE TABLE IF NOT EXISTS detected_changes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_page_id   uuid NOT NULL REFERENCES monitored_pages(id) ON DELETE CASCADE,
  competitor_id       uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  snapshot_before     uuid REFERENCES page_snapshots(id) ON DELETE SET NULL,
  snapshot_after      uuid REFERENCES page_snapshots(id) ON DELETE SET NULL,
  change_type         text NOT NULL CHECK (change_type IN ('promotion','price_change','new_landing_page','new_blog_post','banner_change','content_change')),
  severity            text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  title               text NOT NULL,
  description         text,
  diff_storage_path   text,
  detected_at         timestamptz NOT NULL DEFAULT now(),
  is_read             boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_detected_changes_user_id ON detected_changes(user_id);
CREATE INDEX idx_detected_changes_competitor_id ON detected_changes(competitor_id);
CREATE INDEX idx_detected_changes_detected_at ON detected_changes(detected_at);

-- =====================
-- alerts
-- =====================
CREATE TABLE IF NOT EXISTS alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  change_id   uuid NOT NULL REFERENCES detected_changes(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('dashboard', 'email')),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_status ON alerts(status);

-- =====================
-- alert_preferences
-- =====================
CREATE TABLE IF NOT EXISTS alert_preferences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  email_alerts     boolean NOT NULL DEFAULT true,
  dashboard_alerts boolean NOT NULL DEFAULT true,
  alert_on         text[] NOT NULL DEFAULT ARRAY['promotion','price_change','new_landing_page'],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER alert_preferences_updated_at
  BEFORE UPDATE ON alert_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================
-- crawl_jobs
-- =====================
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id       uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  monitored_page_id   uuid REFERENCES monitored_pages(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_created_at ON crawl_jobs(created_at);
