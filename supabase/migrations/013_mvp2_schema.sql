-- ─────────────────────────────────────────────────────────────────────────────
-- 013 · MVP 2.0 — Signal Intelligence, AI Decision Engine, Memory Layer
--
-- Creates every table referenced by the MVP 2.0 edge functions and frontend:
--   signals            collect-google-trends / collect-meta-ads → score-opportunities
--   opportunities      score-opportunities → OpportunityFeedPage
--   ai_recommendations optimize-campaigns → (future: CampaignsPage recommendations panel)
--   campaign_embeddings embed-campaign ↔ match_campaign_embeddings RPC
--   campaign_metrics   optimize-campaigns (daily ad metrics ingestion)
--   leads (ALTER)      submit-lead → LeadsPage (intent scoring columns)
--
-- Also schedules 4 pg_cron jobs for the new MVP 2.0 functions.
-- ─────────────────────────────────────────────────────────────────────────────

-- pgvector is needed for campaign_embeddings.embedding vector(768)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ── 1. signals ────────────────────────────────────────────────────────────────
-- Raw market signals from Google Trends, Meta Ad Library, etc.
-- score-opportunities reads these for the cross-source boost.

CREATE TABLE IF NOT EXISTS signals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type       TEXT        NOT NULL, -- SEARCH_SPIKE | RISING_KEYWORD | AD_VOLUME_SPIKE | NEW_CREATIVE | OFFER_REPEAT
  source            TEXT        NOT NULL, -- google_trends | meta_ad_library
  industry          TEXT,
  location          TEXT,
  keyword           TEXT,
  competitor_id     UUID        REFERENCES competitors(id) ON DELETE SET NULL,
  monitored_page_id UUID        REFERENCES monitored_pages(id) ON DELETE SET NULL,
  payload           JSONB       NOT NULL DEFAULT '{}',
  growth_pct        NUMERIC,
  weight            NUMERIC     NOT NULL DEFAULT 1.0,
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signals_user_id_idx        ON signals(user_id);
CREATE INDEX IF NOT EXISTS signals_competitor_id_idx  ON signals(competitor_id);
CREATE INDEX IF NOT EXISTS signals_signal_type_idx    ON signals(signal_type);
CREATE INDEX IF NOT EXISTS signals_industry_idx       ON signals(industry);
CREATE INDEX IF NOT EXISTS signals_source_idx         ON signals(source);
CREATE INDEX IF NOT EXISTS signals_collected_at_idx   ON signals(collected_at DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY signals_owner ON signals
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. opportunities ──────────────────────────────────────────────────────────
-- AI-scored revenue opportunities displayed in the Opportunity Radar feed.
-- score-opportunities inserts; OpportunityFeedPage reads via realtime subscription.

CREATE TABLE IF NOT EXISTS opportunities (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id           UUID        REFERENCES signals(id) ON DELETE SET NULL,
  title               TEXT        NOT NULL,
  description         TEXT,
  industry            TEXT,
  location            TEXT,
  market_name         TEXT,
  opportunity_score   NUMERIC     NOT NULL DEFAULT 0,
  expected_leads      INTEGER,
  estimated_cpc       NUMERIC,
  estimated_cpl       NUMERIC,
  recommended_budget  NUMERIC,
  confidence          NUMERIC,
  recommended_action  TEXT,
  reasoning           TEXT,
  signal_sources      JSONB       NOT NULL DEFAULT '[]',
  status              TEXT        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'dismissed', 'launched', 'expired')),
  expires_at          TIMESTAMPTZ,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: prevents two concurrent score-opportunities runs from
-- inserting duplicate open opportunities for the same source detected_change.
-- score-opportunities catches the 23505 violation and treats it as a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_source_change_uniq
  ON opportunities ((metadata->>'source_change_id'))
  WHERE status = 'open' AND metadata->>'source_change_id' IS NOT NULL;

CREATE INDEX IF NOT EXISTS opportunities_user_id_idx      ON opportunities(user_id);
CREATE INDEX IF NOT EXISTS opportunities_status_idx       ON opportunities(status);
CREATE INDEX IF NOT EXISTS opportunities_score_idx        ON opportunities(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS opportunities_created_at_idx   ON opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_industry_idx     ON opportunities(industry);

CREATE OR REPLACE FUNCTION set_opportunities_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'opportunities_updated_at'
  ) THEN
    CREATE TRIGGER opportunities_updated_at
      BEFORE UPDATE ON opportunities
      FOR EACH ROW EXECUTE FUNCTION set_opportunities_updated_at();
  END IF;
END $$;

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunities_owner ON opportunities
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. ai_recommendations ─────────────────────────────────────────────────────
-- Generated by optimize-campaigns. action_type covers both the campaign health
-- detectors (rising_cpc etc.) and the strategic recommendation types.

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id  UUID        REFERENCES opportunities(id) ON DELETE SET NULL,
  campaign_id     UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
  action_type     TEXT        NOT NULL
                  CHECK (action_type IN (
                    -- Strategic recommendation types (RecommendationAction TS enum)
                    'launch_campaign', 'adjust_budget', 'pause_campaign',
                    'change_creative', 'change_audience', 'scale_campaign', 'reactivate',
                    -- Campaign health detector types (optimize-campaigns)
                    'rising_cpc', 'declining_ctr', 'conversion_drop', 'ad_fatigue'
                  )),
  recommendation  TEXT        NOT NULL,
  rationale       TEXT,
  priority        INTEGER     NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  confidence      NUMERIC,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  applied_at      TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_rec_user_id_idx     ON ai_recommendations(user_id);
CREATE INDEX IF NOT EXISTS ai_rec_campaign_id_idx ON ai_recommendations(campaign_id);
CREATE INDEX IF NOT EXISTS ai_rec_action_type_idx ON ai_recommendations(action_type);
CREATE INDEX IF NOT EXISTS ai_rec_created_at_idx  ON ai_recommendations(created_at DESC);

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_rec_owner ON ai_recommendations
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. campaign_embeddings ───────────────────────────────────────────────────
-- Vector memory for the compounding AI intelligence layer (§18 of the plan).
-- embed-campaign upserts here; score-opportunities queries via match_campaign_embeddings.
-- optimize-campaigns back-fills outcome_* columns to close the RAG loop.

CREATE TABLE IF NOT EXISTS campaign_embeddings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id          UUID        REFERENCES campaigns(id) ON DELETE CASCADE,
  signal_id            UUID        REFERENCES signals(id) ON DELETE SET NULL,
  opportunity_id       UUID        REFERENCES opportunities(id) ON DELETE SET NULL,
  content_text         TEXT,
  embedding            extensions.vector(768),
  outcome_clicks       INTEGER,
  outcome_impressions  INTEGER,
  outcome_conversions  INTEGER,
  outcome_spend        NUMERIC,
  outcome_leads        INTEGER,
  seasonality_tag      TEXT,
  region               TEXT,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ce_user_id_idx     ON campaign_embeddings(user_id);
CREATE INDEX IF NOT EXISTS ce_campaign_id_idx ON campaign_embeddings(campaign_id);
-- IVFFlat ANN index (cosine distance). lists=100 is appropriate for ~10k-100k rows;
-- the planner falls back to exact scan on small tables so this is safe from day 1.
CREATE INDEX IF NOT EXISTS ce_vector_idx
  ON campaign_embeddings
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE campaign_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_owner ON campaign_embeddings
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC for ANN similarity search — called by score-opportunities and embed-campaign.
CREATE OR REPLACE FUNCTION match_campaign_embeddings(
  query_embedding   extensions.vector(768),
  match_user_id     UUID,
  match_threshold   FLOAT   DEFAULT 0.5,
  match_count       INT     DEFAULT 5,
  exclude_campaign  UUID    DEFAULT NULL
)
RETURNS TABLE (
  id                   UUID,
  campaign_id          UUID,
  similarity           FLOAT,
  outcome_leads        INTEGER,
  outcome_conversions  INTEGER,
  outcome_spend        NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ce.id,
    ce.campaign_id,
    1 - (ce.embedding <=> query_embedding)   AS similarity,
    ce.outcome_leads,
    ce.outcome_conversions,
    ce.outcome_spend
  FROM campaign_embeddings ce
  WHERE ce.user_id = match_user_id
    AND ce.embedding IS NOT NULL
    AND (exclude_campaign IS NULL OR ce.campaign_id IS DISTINCT FROM exclude_campaign)
    AND 1 - (ce.embedding <=> query_embedding) >= match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 5. campaign_metrics ───────────────────────────────────────────────────────
-- One row per (campaign, platform, date). optimize-campaigns upserts here
-- and reads 14-day windows to run the 4 rule-based health detectors.

CREATE TABLE IF NOT EXISTS campaign_metrics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id  UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform     TEXT        NOT NULL CHECK (platform IN ('meta', 'google')),
  date         DATE        NOT NULL,
  impressions  INTEGER     NOT NULL DEFAULT 0,
  clicks       INTEGER     NOT NULL DEFAULT 0,
  spend        NUMERIC     NOT NULL DEFAULT 0,
  conversions  INTEGER     NOT NULL DEFAULT 0,
  leads        INTEGER     NOT NULL DEFAULT 0,
  ctr          NUMERIC,
  cpc          NUMERIC,
  cpm          NUMERIC,
  cpl          NUMERIC,
  raw          JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, platform, date)
);

CREATE INDEX IF NOT EXISTS cm_campaign_id_idx ON campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS cm_date_idx        ON campaign_metrics(date DESC);
CREATE INDEX IF NOT EXISTS cm_user_id_idx     ON campaign_metrics(user_id);

ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_owner ON campaign_metrics
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 6. leads — MVP 2.0 intent-scoring columns ────────────────────────────────
-- submit-lead writes these; LeadsPage.tsx reads them.
-- score_type / recommended_action are the legacy uppercase fields.
-- intent_level is the new lowercase canonical field.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS score_type             TEXT    CHECK (score_type IN ('HOT', 'MEDIUM', 'LOW')),
  ADD COLUMN IF NOT EXISTS recommended_action     TEXT,
  ADD COLUMN IF NOT EXISTS intent_level           TEXT    CHECK (intent_level IN ('hot', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS intent_score           INTEGER,
  ADD COLUMN IF NOT EXISTS intent_signals         JSONB,
  ADD COLUMN IF NOT EXISTS time_on_page_seconds   INTEGER,
  ADD COLUMN IF NOT EXISTS scroll_depth_pct       INTEGER,
  ADD COLUMN IF NOT EXISTS click_count            INTEGER,
  ADD COLUMN IF NOT EXISTS utm_source             TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium             TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign           TEXT,
  ADD COLUMN IF NOT EXISTS utm_content            TEXT,
  ADD COLUMN IF NOT EXISTS utm_term               TEXT,
  ADD COLUMN IF NOT EXISTS referrer               TEXT;

CREATE INDEX IF NOT EXISTS leads_intent_level_idx ON leads(intent_level);
CREATE INDEX IF NOT EXISTS leads_score_type_idx   ON leads(score_type);

-- ── 7. pg_cron — MVP 2.0 scheduled functions ─────────────────────────────────
-- Timings chosen so the pipeline flows in order each hour:
--   :00 — schedule-crawls          (existing)
--   :00 — collect-meta-ads         (every 6h)
--   :30 — collect-google-trends    (every 6h, staggered 30 min after meta)
--   :15 — score-opportunities      (runs 15 min past the hour so changes land first)
--   02:00 — optimize-campaigns     (daily, low-traffic time)

SELECT cron.unschedule('collect-meta-ads-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'collect-meta-ads-6h');

SELECT cron.schedule(
  'collect-meta-ads-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/collect-meta-ads',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('collect-google-trends-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'collect-google-trends-6h');

SELECT cron.schedule(
  'collect-google-trends-6h',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/collect-google-trends',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('score-opportunities-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'score-opportunities-hourly');

SELECT cron.schedule(
  'score-opportunities-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/score-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('optimize-campaigns-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'optimize-campaigns-daily');

SELECT cron.schedule(
  'optimize-campaigns-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/optimize-campaigns',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
