-- =====================
-- Enable RLS on all tables
-- =====================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

-- =====================
-- profiles
-- =====================
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- =====================
-- competitors
-- =====================
CREATE POLICY "Users can view own competitors"
  ON competitors FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitors"
  ON competitors FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitors"
  ON competitors FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitors"
  ON competitors FOR DELETE USING (auth.uid() = user_id);

-- =====================
-- monitored_pages
-- =====================
CREATE POLICY "Users can view own monitored_pages"
  ON monitored_pages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own monitored_pages"
  ON monitored_pages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monitored_pages"
  ON monitored_pages FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own monitored_pages"
  ON monitored_pages FOR DELETE USING (auth.uid() = user_id);

-- =====================
-- page_snapshots (read-only for users; edge functions use service role)
-- =====================
CREATE POLICY "Users can view own page_snapshots"
  ON page_snapshots FOR SELECT USING (auth.uid() = user_id);

-- =====================
-- detected_changes
-- =====================
CREATE POLICY "Users can view own detected_changes"
  ON detected_changes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own detected_changes"
  ON detected_changes FOR UPDATE USING (auth.uid() = user_id);

-- =====================
-- alerts
-- =====================
CREATE POLICY "Users can view own alerts"
  ON alerts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
  ON alerts FOR UPDATE USING (auth.uid() = user_id);

-- =====================
-- alert_preferences
-- =====================
CREATE POLICY "Users can view own alert_preferences"
  ON alert_preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alert_preferences"
  ON alert_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alert_preferences"
  ON alert_preferences FOR UPDATE USING (auth.uid() = user_id);

-- =====================
-- crawl_jobs
-- =====================
CREATE POLICY "Users can view own crawl_jobs"
  ON crawl_jobs FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM competitors WHERE id = crawl_jobs.competitor_id)
  );

CREATE POLICY "Users can insert own crawl_jobs"
  ON crawl_jobs FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM competitors WHERE id = crawl_jobs.competitor_id)
  );
