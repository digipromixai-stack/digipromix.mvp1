---
name: digipromix-full-reference
description: "Complete technical reference for DigiPromix — architecture, data model, edge functions, page inventory, business logic constants, RLS policies, Supabase secrets, design conventions. Updated June 2026 (session 2)."
metadata:
  node_type: memory
  type: project
  originSessionId: 8850e522-a7ec-4567-88a3-e25b24fadc29
---

# DigiPromix — Full Project Reference

## What It Is
DigiPromix is an AI-powered competitor monitoring + counter-campaign SaaS. It crawls competitor websites, detects changes, scores them as revenue opportunities, and lets users launch counter-campaigns directly to Meta and Google Ads.

**Why:** Ankit's agency/clients want to react to competitor moves in real time and auto-launch response ads without manual setup.

**How to apply:** Think in terms of the signal → opportunity → campaign → lead pipeline. Every feature decision should serve that flow.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Supabase (Postgres 17.6, Auth, Realtime, Storage, Edge Functions) |
| State | @tanstack/react-query (all server state) |
| Forms | react-hook-form + zod |
| Routing | react-router-dom v6 |
| AI | Gemini (campaign generation, classification, embeddings) |
| Ads | Meta Marketing API + Google Ads API (MCC/agency mode) |
| Repo | C:\digipromix (main branch) |
| Supabase project ID | kvsjzsmlcycgfoazfunb |
| Region | eu-west-1 |
| Project status | ACTIVE_HEALTHY |

---

## Auth & Multi-tenancy
- Supabase Auth (email/password + Google OAuth)
- Every table has `user_id uuid REFERENCES auth.users`
- RLS enabled on all tables — policies scope to `auth.uid() = user_id`
- After login/signup/password-reset, app redirects to `/opportunities` (NOT `/dashboard`)
- Auth redirect points: App.tsx SIGNED_IN handler, LoginPage.tsx, ResetPasswordPage.tsx — all confirmed → `/opportunities`

---

## Database Tables (canonical)

### Core monitoring
| Table | Rows (Jun 2026) | Purpose |
|---|---|---|
| `profiles` | 3 | user name, plan_type (free/premium) |
| `competitors` | 10 | tracked competitors (name, website_url, industry, crawl_frequency) |
| `monitored_pages` | 18 | specific URLs to crawl per competitor |
| `page_snapshots` | 406 | HTML snapshots; comparison drives change detection |
| `detected_changes` | 395 | AI-classified changes (change_type, severity, title, description, metadata) |
| `alerts` | 753 | per-channel alert records (dashboard/email), status: pending/sent/failed |
| `alert_preferences` | 3 | per-user alert settings incl. webhook_url, webhook_enabled, whatsapp_number, whatsapp_alerts |
| `crawl_jobs` | 1643 | crawl queue records |

### Campaigns & leads
| Table | Rows | Purpose |
|---|---|---|
| `campaigns` | 22 | AI-generated counter-campaigns; status: draft/active/paused/failed/completed |
| `campaign_performance` | 0 | daily ad metrics from Meta/Google (clicks, impressions, spend, conversions, ctr, cpc, conversion_rate) |
| `campaign_metrics` | 3 | **LEGACY** old-style metrics table (leads, cpm, cpl columns) — do NOT use |
| `leads` | 2 | form submissions from landing pages |
| `lead_scores` | 0 | intent scoring per lead |
| `clients` | 0 | agency multi-tenant client records |
| `managed_ads_accounts` | 0 | DigiPromix-provisioned sub-accounts (MCC/agency Business Manager) |

**CRITICAL:** The performance table is `campaign_performance`, NOT `campaign_metrics`. `useCampaignMetrics` hook queries `campaign_performance`. The 3 rows in `campaign_metrics` are legacy test data — ignore them. `campaign_performance` fills once real campaigns launch and `manage-meta/google-campaign` sync data.

### AI signal intelligence
| Table | Rows | Purpose |
|---|---|---|
| `signals` | 293 | raw market signals (Google Trends, Meta Ad Library) |
| `opportunities` | 338 | scored revenue opportunities; status: open/dismissed/launched/expired |
| `ai_recommendations` | 7 | AI suggestions per campaign (action_type: RecommendationAction) |
| `campaign_embeddings` | 22 | vector memory for RAG-based campaign generation (768-dim Gemini embeddings) |

---

## Key Types (database.types.ts)

```typescript
ChangeType = 'promotion' | 'price_change' | 'new_landing_page' | 'new_blog_post' | 'banner_change' | 'content_change' | 'campaign_launch'
Severity = 'low' | 'medium' | 'high'
CampaignStatus = 'draft' | 'active' | 'paused' | 'failed' | 'completed'
OpportunityStatus = 'open' | 'dismissed' | 'launched' | 'expired'
RecommendationAction = 'launch_campaign' | 'adjust_budget' | 'pause_campaign' | 'change_creative' | 'change_audience' | 'scale_campaign' | 'reactivate' | 'setup_tracking' | 'rising_cpc' | 'declining_ctr' | 'conversion_drop' | 'ad_fatigue' | 'performance_check'
AlertPreferences includes: webhook_url, webhook_enabled, whatsapp_number, whatsapp_alerts (added June 2026)
```

---

## Edge Functions (25 total — all ACTIVE)

| Function | Trigger | What it does |
|---|---|---|
| `crawl-page` | Cron (hourly) | Crawls monitored pages, stores snapshots |
| `detect-changes` | After crawl | Diffs snapshots; Gemini classification; writes `detected_changes` + `alerts` |
| `generate-campaign` | User click | Calls Gemini; creates `campaigns` record; RAG context from embeddings |
| `predict-budget` | Fire-and-forget after generate | Estimates leads/CPC/CPL; writes back to `campaigns.predicted_*` |
| `launch-meta-campaign` | User click | Creates Meta Ads Campaign→AdSet→Creative→Ad (PAUSED) |
| `launch-google-ads-campaign` | User click | Creates Google Ads Search campaign (PAUSED) |
| `manage-meta-campaign` | User click (pause/resume/delete) | Manages existing Meta campaigns |
| `manage-google-ads-campaign` | User click | Manages existing Google Ads campaigns |
| `meta-oauth` | OAuth callback | Exchanges code for long-lived Meta token; saves to `ad_integrations` |
| `google-ads-oauth` | OAuth callback | Exchanges code for Google Ads tokens; saves to `ad_integrations` |
| `score-opportunities` | Cron (hourly at :05) | Scores detected_changes + signals; writes `opportunities` |
| `collect-google-trends` | Cron (every 6h at :15) | Fetches SerpAPI/RSS trends; writes `signals` |
| `collect-meta-ads` | Cron (every 12h at :30) | Fetches Meta Ad Library; writes `signals` |
| `optimize-campaigns` | Cron (daily 02:00 UTC) | Fetches Meta/Google insights; runs 4 detectors; writes `ai_recommendations` |
| `embed-campaign` | Fire-and-forget after generate | Creates `campaign_embeddings` for RAG memory |
| `send-email-alert` | Called by detect-changes | Sends Gmail alerts for detected changes |
| `send-webhook` | Called by detect-changes | Posts to user webhook URL |
| `submit-lead` | Public landing page form | Creates `leads` + intent scoring + WhatsApp alert |
| `schedule-crawls` | Cron (hourly) | Queues `crawl_jobs` for active monitored pages |
| `admin-launch-campaign` | Internal | Launches campaign for managed mode (creates managed_ads_accounts) |
| `delete-account` | User action | Purges all user data |
| `health-check` | External uptime monitor | Returns DB + crawler health |
| `cleanup-orphan-snapshots` | Manual/cron | Removes page_snapshots with no detected_changes |
| `backfill-diff` | Manual | Backfills diff data for existing snapshots |
| `embed-campaign` | Auto | Generates campaign embeddings for RAG |

### Shared utilities (_shared/)
- `supabaseAdmin.ts` — service-role Supabase client
- `config.ts` — **NEW June 2026** — all API versions + tunable constants read from env vars
- `changeClassifier.ts` — deterministic change classification logic
- `diffGenerator.ts` — HTML diff generation
- `gmail.ts` — Gmail API wrapper
- `htmlExtractor.ts` — HTML → normalized text

---

## pg_cron Jobs (8 active)

| Job | Schedule | Calls |
|---|---|---|
| `schedule-crawls-hourly` | `0 * * * *` | schedule-crawls |
| `score-opportunities-hourly` | `5 * * * *` | score-opportunities |
| `collect-google-trends-6h` | `15 */6 * * *` | collect-google-trends |
| `collect-meta-ads-12h` | `30 */12 * * *` | collect-meta-ads |
| `optimize-campaigns-daily` | `0 2 * * *` | optimize-campaigns |
| `prune-snapshots-weekly` | `0 3 * * 0` | `prune_old_snapshots()` SQL |
| `prune-opportunities-weekly` | `30 3 * * 0` | `prune_expired_opportunities()` SQL |
| `prune-signals-weekly` | `45 3 * * 0` | `prune_old_signals()` SQL |

---

## _shared/config.ts — Centralized Config (June 2026)

All hard-coded values moved here. Edge functions import instead of hardcoding.
**To change any value: update the Supabase secret — no redeploy needed.**

```typescript
// API versions
META_GRAPH_VERSION   → META_GRAPH  = `https://graph.facebook.com/${env}`
GOOGLE_ADS_VERSION   → GOOGLE_ADS_API = `https://googleads.googleapis.com/${env}`

// Campaign targeting defaults (overridable per-request in launch-meta-campaign body)
DEFAULT_TARGET_COUNTRIES  (default: 'US', comma-separated e.g. 'US,IN,GB')
DEFAULT_AGE_MIN           (default: 18)
DEFAULT_AGE_MAX           (default: 65)

// Google Ads campaign defaults
CAMPAIGN_DURATION_DAYS    (default: 365)
CPC_BUDGET_RATIO          (default: 0.3)   // max CPC = budget × ratio
CPC_HARD_CAP_USD          (default: 5)     // absolute ceiling
KEYWORD_LIMIT             (default: 8)

// Optimization engine thresholds
OPT_RISING_CPC_MULT       (default: 1.5)
OPT_DECLINING_CTR_MULT    (default: 0.6)
OPT_CONVERSION_DROP_MULT  (default: 0.5)
OPT_FATIGUE_IMP_STABLE    (default: 0.25)
OPT_FATIGUE_CTR_MULT      (default: 0.7)
OPT_FATIGUE_MIN_IMP       (default: 500)
OPT_MIN_CLICKS_CVR        (default: 10)
OPT_LOOKBACK_DAYS         (default: 14)
```

---

## Supabase Secrets (complete as of June 2026)

See [[digipromix-secrets-config]] for full list. Key ones:
- `GEMINI_API_KEY` — campaign generation + embeddings
- `META_APP_ACCESS_TOKEN` / `META_APP_ID` / `META_APP_SECRET` / `META_BUSINESS_ID`
- `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` / `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_FROM_ADDRESS` / `GMAIL_REFRESH_TOKEN`
- `SERPAPI_KEY` / `SCRAPE_DO_API_KEY`
- All 17 config.ts tunable secrets (see above)

**Missing (needs setup for WhatsApp alerts):**
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`

---

## RLS Policy Status (post migration 014)

All tables have complete CRUD policies. Key details:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| campaigns | ✅ | ✅ WITH CHECK | ✅ | ✅ |
| competitors | ✅ | ✅ WITH CHECK | ✅ | ✅ |
| monitored_pages | ✅ | ✅ WITH CHECK | ✅ | ✅ |
| leads | ✅ | ✅ (permissive — anon submit) | ✅ | ✅ |
| opportunities | ✅ | — (service role only) | ✅ | — |
| detected_changes | ✅ | — (service role only) | ✅ | — |
| managed_ads_accounts | ✅ | ✅ WITH CHECK | ✅ | ✅ |
| ai_recommendations | ✅ | ✅ WITH CHECK | ✅ | ✅ |
| campaign_embeddings | ✅ | ✅ WITH CHECK | — | — |
| signals | ✅ | ✅ WITH CHECK | — | — |
| alert_preferences | ✅ | ✅ WITH CHECK | ✅ | — |
| ad_integrations | ✅ | ✅ WITH CHECK | ✅ | ✅ |

**Migration history:** 001–013 (initial schema → mvp2), 014 (RLS hardening June 2026)

---

## Counter Campaign Flow (InterceptionPage → CampaignModal)

### InterceptionPage layout:
- **Left panel:** Signal feed (`detected_changes`) — `SignalCard` per change
- **Right panel (sticky):** `CounterPlayPanel`
  - Content: `genHeadlines()`, `genPrimaryText()`, `genOffer()` (pure functions, no API call)
  - Budget slider: $50–$500/day, defaults: high=180, medium=140, low=100
  - Channel toggles: Meta + Google
  - Predictions: CPC_MAP[industry] × CONV_RATE

### CampaignModal flow (3 steps):
1. **generate** — counter-play preview (headline/offer/budget from panel) + "Generate Counter-Campaign"
2. **preview** — AI content; budget field; channel selector; landing URL; launch mode (self vs managed)
3. **posted** — Meta/Google campaign IDs + landing page URL

### counterHint prop (June 2026):
CampaignModal receives `counterHint` from InterceptionPage:
```typescript
{ budget: number, channels: string[], headline: string, primaryText: string, offer: string }
```
Pre-fills `dailyBudget` and `selectedChannels`. Shows visual counter-play preview block in generate step.

---

## Realtime Subscriptions

| Hook | Channel | Invalidates |
|---|---|---|
| `useRealtimeAlerts` | `user-alerts-{uid}` on `alerts` INSERT | `['alerts']`, `['detected_changes']`, `['dashboard_stats']`, `['dashboard_stats_v2']` |
| `OpportunityFeedPage` (inline) | `opportunities-{uid}` on any change | `['opportunities']` |

**CRITICAL:** DashboardPage uses query key `['dashboard_stats_v2', user?.id]`. Must invalidate BOTH `dashboard_stats` AND `dashboard_stats_v2` or KPI tiles won't refresh.

---

## Important Business Logic Constants (InterceptionPage)

```typescript
const CPC_MAP = { Healthcare: 4.50, 'Local-services': 3.20, SaaS: 6.50, Finance: 8.00 }
const DEFAULT_CPC = 3.50
const CONV_RATE = 0.11       // 11% conversion rate assumption
const VALUE_PER_LEAD = 150   // $150 assumed value per lead

// Prediction formula:
// weekly = budget * 7
// leads = Math.max(1, Math.round((weekly / cpc) * CONV_RATE))
// cpl = Math.round(weekly / leads)
// roi = ((leads * VALUE_PER_LEAD) / weekly).toFixed(1)
```

---

## Hooks Reference

| Hook | Table queried | Key notes |
|---|---|---|
| `useCampaigns` | `campaigns` | includes `.eq('user_id', user.id)` |
| `useCampaignMetrics` | `campaign_performance` | NOT campaign_metrics |
| `useAiRecommendations` | `ai_recommendations` | |
| `useCompetitors` | `competitors` | |
| `useDetectedChanges` | `detected_changes` | |
| `useLeads` | `leads` | includes `.eq('user_id', user.id)` + `enabled: !!user` |
| `useOpportunities` | `opportunities` | |
| `useAdIntegrations` | `ad_integrations` | |
| `useRealtimeAlerts` | `alerts` (realtime) | invalidates dashboard_stats_v2 |
| `useMonitoredPages` | `monitored_pages` | |
| `useClients` | `clients` | |
| `useCrawlNow` | mutation → crawl-page fn | |

---

## Opportunities Page (OpportunityFeedPage)

- Primary post-login landing (all auth redirects → `/opportunities`)
- Reads from `opportunities` table (filled by `score-opportunities` cron hourly)
- `handleLaunch`: fetches `detected_changes` via `metadata.source_change_id`, opens CampaignModal
- `handleDismiss`: sets `status = 'dismissed'` via toast (no native alert())
- Filter tabs: All / Hot (≥75) / Medium (50-74) / Watch (<50)
- Live Supabase realtime subscription

---

## Campaigns Page (CampaignsPage)

- Two views: List view (max-w-3xl) + Kanban (Draft/Running/Paused/Completed)
- `KANBAN_COLS = [{ id: 'draft' }, { id: 'active', label: 'Running' }, { id: 'paused' }, { id: 'completed' }]`
- `MetricsPanel` reads `campaign_performance` via `useCampaignMetrics`
- AI recommendations via `useAiRecommendations`
- `ACTION_META` covers all 13 RecommendationAction values

---

## Analytics Page (AnalyticsPage)

- Campaign Channel Mix grid: `['google', 'meta', 'instagram', 'whatsapp']` — 4 channels, `grid-cols-2 sm:grid-cols-4`
- WhatsApp was missing before June 2026 fix — now included

---

## Design Conventions

- Colors: `#e5484d` (high/red), `#d9920a` (medium/amber), `#1f9d5b` (low/green), `#2563eb` (blue)
- Card shadow: `0 1px 2px rgba(16,24,40,.04)`
- Dashboard query key: `['dashboard_stats_v2', user?.id]` (NOT `dashboard_stats`)
- Auth redirect: `/opportunities` everywhere
- Sidebar nav: Revenue, Monitor, Campaigns, Account

---

## All Bugs Fixed (cumulative June 2026)

| Bug | Fix |
|---|---|
| `useCampaignMetrics` queried `campaign_metrics` | Fixed to `campaign_performance` |
| `useRealtimeAlerts` only invalidated `dashboard_stats` | Also invalidates `dashboard_stats_v2` |
| `useLeads` missing `user_id` filter | Added `.eq('user_id', user.id)` + `enabled: !!user` |
| `AlertsPage` null `/timeline/undefined` links | Guard: only render Link if competitor_id exists |
| `AlertsPage` mutations silently swallowed errors | Added `if (error) throw error` |
| `CompetitorDetailPage` missing user_id filter | Added `.eq('user_id', user.id)` |
| `OpportunityFeedPage` used native `alert()` | Replaced with `toast()` |
| `OpportunityFeedPage` dismiss had no error handling | Added try/catch with toast |
| `opportunities` missing UPDATE RLS policy | Added via migration |
| `SettingsPage` ugly type casts | Fixed by extending `AlertPreferences` type |
| `database.types.ts` incomplete RecommendationAction | Added all 13 action types |
| `database.types.ts` missing webhook/whatsapp fields | Added to AlertPreferences |
| `App.tsx` SIGNED_IN → `/dashboard` | Fixed → `/opportunities` |
| `LoginPage` → `/dashboard` | Fixed → `/opportunities` |
| `ResetPasswordPage` → `/dashboard` | Fixed → `/opportunities` |
| `CampaignModal` countered-bug | Fixed onClose + interceptedIds excludes drafts |
| `AnalyticsPage` missing WhatsApp channel | Added as 4th channel, grid-cols-4 |
| RLS INSERT policies had no WITH CHECK | Migration 014 hardened all 8 INSERT policies |
| `managed_ads_accounts` missing write policies | Added INSERT/UPDATE/DELETE |
| `detected_changes` missing UPDATE policy | Added (is_read toggle) |
| API versions hardcoded in 7 functions | Centralized to `_shared/config.ts` with env var override |
| Optimization thresholds hardcoded | All 8 thresholds now env-var driven |
| Geo/age targeting hardcoded US/18-65 | Now from request body with env-var defaults |

---

## Known Remaining Gaps

- `campaign_performance` is empty — fills once real campaigns launch and `manage-meta/google-campaign` runs
- WhatsApp alerts in `submit-lead` need Twilio secrets set (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)
- `campaign_embeddings` / RAG fully schema-ready but vector retrieval performance not tested at scale
- Meta budget field uses account currency — `minDailyForCurrency(currency)` handles min; zero-decimal currencies (JPY, KRW) handled
