# DigiPromix AI — System Reference

A single-source-of-truth document for how every piece of DigiPromix works.
Read this first before debugging or extending.

Last updated: 2026-05-21 — covers MVP 1.0 + MVP 2.0 partial.

---

## 1. High-level architecture

```
┌──────────────────────┐
│   Frontend (Vercel)  │  React 18 + TS + Vite + Tailwind + React Query
│   www.digipromix.com │
└──────────┬───────────┘
           │ supabase-js
           ▼
┌──────────────────────────────────────────┐
│         Supabase (kvsjzsmlcycgfoazfunb)   │
│  ┌──────────────┐   ┌──────────────────┐ │
│  │ Postgres + RLS │   │  Edge Functions  │ │
│  │ pgvector       │   │  (Deno)          │ │
│  │ Vault          │   └──────────────────┘ │
│  │ Storage        │           │             │
│  │ pg_cron + pg_net│           │             │
│  └────────────────┘           ▼             │
└────────────────────┬──────────┬─────────────┘
                     │          │
                     ▼          ▼
            ┌─────────────┐ ┌──────────────────┐
            │   Render    │ │   External APIs  │
            │  (Python    │ │  • Meta Graph    │
            │  Playwright │ │  • Google Ads    │
            │  crawler)   │ │  • Gemini AI     │
            └─────────────┘ │  • Gmail API     │
                            │  • Twilio        │
                            └──────────────────┘
```

**Tech stack**

| Layer | Tech |
|---|---|
| UI | React 18, TypeScript, Vite, Tailwind, lucide-react |
| Data | @tanstack/react-query (caching), @supabase/supabase-js |
| DB | Postgres 15 on Supabase, RLS-protected, pgvector for AI memory |
| API | Supabase Edge Functions (Deno runtime) |
| Auth | Supabase Auth — Google OAuth + email/password |
| Crawler | Python + Playwright on Render (separate repo) |
| Hosting | Vercel (frontend), Supabase (backend), Render (crawler) |
| Cron | pg_cron via Postgres + pg_net for HTTP |
| AI | Google Gemini 2.5 Flash for campaign generation |

---

## 2. Repo layout

```
src/
├── App.tsx                    # Router + auth gate + cookie banner
├── pages/                      # Top-level routes
├── components/                 # Shared UI components
├── hooks/                      # React Query hooks (useCampaigns, useLeads…)
├── lib/
│   ├── supabase.ts            # Client + invokeFunction wrapper
│   ├── queryClient.ts         # React Query setup
│   └── utils.ts               # timeAgo, cn(), faviconUrl()
├── contexts/AuthContext.tsx    # session provider
└── types/database.types.ts     # All TS types — single source of truth

supabase/
├── config.toml                 # Edge function + project config
├── migrations/                 # SQL migrations (numbered)
└── functions/                  # Edge functions (one folder each)
    ├── _shared/                # Shared helpers
    ├── crawl-page/             # ...
    └── …

public/                         # Static assets (robots.txt, og-image.png, digipromix-logo.png)
index.html                      # SEO meta + JSON-LD
vercel.json                     # Vercel rewrites + headers
```

The Python crawler lives in **`python-crawler/`** but is `.gitignore`'d — it's a separate repo deployed to Render.

---

## 3. Database schema (core tables)

### Auth & profile
- **`auth.users`** (Supabase managed) — emails, identities, sessions
- **`profiles`** — public profile, `plan_type` (free / premium)

### Competitor intelligence
- **`competitors`** — name, website_url, industry, `crawl_frequency` (`hourly` | `daily`), is_active
- **`monitored_pages`** — `url`, `page_type` (home / pricing / promotions / blog / landing_page / custom), is_active, `last_crawled_at`
- **`page_snapshots`** — `storage_path` (nullable! null = no HTML stored), `normalized_text` (inline fallback), `content_hash`, `normalized_hash`, `etag`, `last_modified`, `prices_json`, `http_status`, `structured_data`, `content_size`, `fetch_ms`
- **`detected_changes`** — `change_type` (promotion / price_change / new_landing_page / new_blog_post / banner_change / content_change / campaign_launch), `severity` (low / medium / high), `title`, `description`, `diff_storage_path`, `metadata` JSON (promo_codes, campaign_score, is_coordinated, etc.)
- **`crawl_jobs`** — `status` (queued / running / completed / failed)

### Alerts
- **`alerts`** — channel (dashboard / email), status (pending / sent / failed)
- **`alert_preferences`** — per-user toggles + `alert_on` array + `whatsapp_number`

### Campaigns
- **`campaigns`** — see column reference below
- **`leads`** — captured from landing pages
- **`clients`** — multi-tenant / agency mode
- **`ad_integrations`** — connected Meta / Google Ads accounts, OAuth tokens, account currency
- **`managed_ads_accounts`** — MCC-provisioned sub-accounts (MANAGED mode)

### Key `campaigns` columns to know
```
status                    draft|active|paused|failed|completed
launch_mode               self|managed
channels                  text[] e.g. ['meta','google']
slug                      URL slug for the public landing page /lp/<slug>
published                 boolean — landing page visible
landing_page_url          where ads point to (validated, no example.com)
daily_budget              integer, whole units of account currency
meta_campaign_id          | meta_adset_id | meta_ad_id | meta_error
google_campaign_id        | google_ad_group_id | google_ad_id | google_error
template                  default|healthcare|real-estate|education|local-services
predicted_leads / cpc / cpl / confidence_score   ← Budget Predictor (MVP 2.0)
auto_optimize_enabled     boolean
```

### Vault (`supabase/vault.decrypted_secrets`)
Encrypted secrets that edge functions read at runtime:
- `meta_app_id`, `meta_app_secret`, `meta_business_id`, `meta_system_user_token`
- `google_ads_client_id`, `google_ads_client_secret`, `google_ads_developer_token`
- `gemini_api_key`
- `APP_URL`, `FROM_EMAIL`, `RESEND_API_KEY`

Read via SQL function: `select get_vault_secret('meta_app_id');`

---

## 4. Edge functions (Supabase)

Every function lives at `supabase/functions/<name>/index.ts`. `verify_jwt` is in `config.toml`.

### Public (no JWT required)

| Function | Purpose | Trigger |
|---|---|---|
| **submit-lead** | Save a lead from a public `/lp/<slug>` form. Computes HOT / MEDIUM / LOW intent (form quality + engagement + UTM). Atomic `leads_count` increment via RPC. Sends Twilio WhatsApp if user has a number set. | Public form post |
| **crawl-page** | Fetches a competitor URL, gzip + uploads HTML to Storage (best-effort — proceeds with null storage_path on upload failure), inserts `page_snapshots`, dispatches `detect-changes` if there was a prior snapshot. Conditional GET via ETag / Last-Modified for 304 short-circuits. 5 MB body cap. Non-HTML skip. | schedule-crawls + Render crawler |
| **detect-changes** | Diff a before/after snapshot, classify the change, merge optional AI summary from the Python crawler, escalate to `campaign_launch` if coordinated multi-page move detected, insert `detected_changes`, fan out alerts. | crawl-page (fire-and-forget) |
| **schedule-crawls** | Hourly pg_cron tick. Expires stale queued / running jobs, finds pages due for crawl based on `competitor.crawl_frequency`, dispatches `crawl-page` via true fire-and-forget (`EdgeRuntime.waitUntil`). | pg_cron `schedule-crawls-hourly` |
| **send-email-alert** | Walks `alerts` with `channel='email'` `status='pending'`, sends via Gmail API (parallel `Promise.allSettled`). | Manual or cron |
| **health-check** | Returns `{ status, db, render, timestamp, version }`. 200 if all green, 503 if any check fails. | UptimeRobot, BetterStack |
| **cleanup-orphan-snapshots** | Walks `snapshots` bucket, deletes files not referenced by `page_snapshots`. Batches of 100, max 2000/run. | Ad-hoc |

### User-authenticated (JWT required)

| Function | Purpose |
|---|---|
| **generate-campaign** | Gemini-powered campaign creator. Takes a `change_id`, generates campaign_name + headline + ad_copy + social_copy + offer + keywords + landing-page copy. Slug-collision-safe with 3-retry on Postgres 23505. |
| **launch-meta-campaign** | Creates Meta Campaign → AdSet → Creative → Ad via Graph API v19. **CBO** budget at campaign level. **Currency-aware** budget (17 currencies). HEAD-checks ad image before sending. Detects user-pending-action holds (code 31). Sets `status='failed'` on any platform error. |
| **launch-google-ads-campaign** | Creates Google Ads Budget → Campaign → AdGroup → RSA → Keywords via REST v20. SELF mode (user OAuth) or MANAGED mode (MCC sub-account). All objects PAUSED. Refreshes access token from refresh token. |
| **manage-meta-campaign** | Pause / resume / delete Meta campaigns. |
| **manage-google-ads-campaign** | Same for Google. |
| **meta-oauth** | OAuth exchange + save + disconnect. Auto-fetches account currency from Meta. Falls back to Vault if env secrets aren't set. |
| **google-ads-oauth** | OAuth exchange + save + disconnect. Stores refresh_token. |
| **predict-budget** | MVP 2.0 Budget Predictor. Industry CPC baselines × opportunity score × severity multiplier → predicted_leads / cpc / cpl / confidence_score. Persists to campaign row. |
| **delete-account** | GDPR right-to-erasure. Cascades through leads → alerts → snapshots + storage → competitors → integrations → `auth.users`. |
| **admin-launch-campaign** | Service-role-gated launcher. Bypasses user session — useful when the UI is broken or for scripted launches. Uses `x-admin-on-behalf-of` header pattern. |
| **send-webhook** | Generic outbound webhook for integrations. |

---

## 5. Critical end-to-end flows

### Flow A — Competitor crawl → change detection → alert
```
pg_cron @ :00 every hour
  → schedule-crawls/index.ts
     → expires stale jobs
     → finds pages due based on competitor.crawl_frequency
     → for each: INSERT crawl_jobs (queued) + fire-and-forget POST to crawl-page
crawl-page (verify_jwt=false)
  → conditional GET (etag/last-modified)
  → if 304: mark job complete, exit
  → else: gzip → upload to Storage → INSERT page_snapshots
  → if previous snapshot existed: fire-and-forget POST to detect-changes
detect-changes (verify_jwt=false)
  → download both HTML files (or use normalized_text if storage_path=null)
  → classifyChange() heuristic + optional AI summary merge
  → coordinated-launch check (≥2 pages of same competitor changed in 15 min)
  → INSERT detected_changes
  → INSERT alerts (dashboard + email per alert_preferences)
  → fire-and-forget POST to send-email-alert
```

### Flow B — Generate + launch counter-campaign
```
User clicks "Counter" on a detected change in /dashboard
  → CampaignModal opens, calls generate-campaign(change_id)
     → Gemini 2.5 Flash → JSON → INSERT campaigns (status=draft)
  → User picks channels, sets budget + landing URL + image_url
  → User clicks "Post Campaign"
     → UPDATE campaigns set status=active, channels, daily_budget, landing_page_url, published
     → POST launch-meta-campaign (if meta selected)
     → POST launch-google-ads-campaign (if google selected)
launch-meta-campaign:
  1. Validate URL + budget (currency-aware min from CURRENCY_MIN_DAILY)
  2. Fetch account currency from Meta
  3. CBO campaign creation (daily_budget + bid_strategy at campaign level)
  4. AdSet (no bid_strategy — inherits from campaign)
  5. Resolve image: explicit → og:image scrape (HEAD-check) → DEFAULT_AD_IMAGE
  6. Ad Creative (link_data with picture)
  7. Ad
  8. UPDATE campaigns set meta_campaign_id, meta_adset_id, meta_ad_id, status=active
  Any failure → UPDATE meta_error + status=failed
```

### Flow C — Lead capture
```
Visitor lands on /lp/<slug>
  → LandingPage.tsx starts useEngagementSignals (time, scroll, clicks)
  → reads UTM params from URL + document.referrer
  → User submits form → POST submit-lead with all signals
submit-lead (verify_jwt=false):
  → fetch campaign by slug (must be published=true)
  → scoreLeadIntent() returns { score 0-100, score_type: HOT|MEDIUM|LOW, recommended_action }
  → INSERT leads
  → RPC increment_campaign_leads_count(campaign_id)
  → optional Twilio WhatsApp alert to owner
  → return { success, lead_id, score }
```

---

## 6. Lead intent scoring (MVP 2.0)

`scoreLeadIntent()` in `submit-lead/index.ts`:

```
Form quality (max 50):  name=5, email=15, phone=20, message=10
Engagement (max 30):    time_on_page (10/6/3), scroll_depth (10/6/3), clicks (10/5)
Channel  (max 20):      paid (cpc/google/meta)=15, referred=8, organic-tagged=5

→ ≥70 = HOT    → "Contact within 5 minutes — high intent."
→ ≥40 = MEDIUM → "Follow up within 24 hours…"
→ <40 = LOW    → "Add to nurture sequence…"
```

---

## 7. Budget prediction (MVP 2.0)

`predict-budget/index.ts` uses static **industry CPC baselines** (17 verticals: real-estate $2.50, healthcare $3.20, retail $1.40, education $2.10, restaurants $1.20, local-services $4.50, finance $5.80, legal $6.50, b2b-saas $3.80, default $2.20, etc.) adjusted by:
- Opportunity score (0–150) from the linked detected_change
- Severity multiplier (high=1.4, medium=1.1, low=0.85)
- Keyword count bonus (up to +15% with 10 kws)

Confidence builds up to 0.95 with industry match + opportunity signal + keywords + non-trivial budget.

---

## 8. Meta launch reference

Account currency drives the **minimum daily budget**:

```
USD/EUR/GBP/CAD/AUD/NZD: 1     KWD: 0.3      JPY: 100
INR: 40   AED: 4   SAR: 4   EGP: 8   QAR: 4
BRL: 3   MXN: 20   ARS: 100
ZAR: 15   NGN: 400
TRY: 5   RUB: 60   IDR: 14000   MYR: 4   PHP: 50   THB: 30   VND: 23000
SGD: 2   HKD: 8   TWD: 30
CNY: 7   KRW: 1200
CHF: 1   SEK: 10   NOK: 10   DKK: 7   PLN: 4   CZK: 23
```

Defined in **both** `launch-meta-campaign/index.ts` and `src/hooks/useAdIntegrations.ts` — keep in sync.

Zero-decimal currencies (JPY/KRW/VND/IDR) pass the whole-unit amount directly. All others get ×100.

### Known Meta error codes
| Code | Subcode | Meaning | Our handling |
|---|---|---|---|
| 100 | 4834011 | `is_adset_budget_sharing_enabled` required | Set explicit `false` + use CBO |
| 100 | 2446375 | Budget too small for currency | Pre-flight check against CURRENCY_MIN_DAILY |
| 100 | 1815857 | Bid amount required | bid_strategy moved to campaign level (CBO inherits) |
| 100 | 2446496 | Image processing failed | Reject SVG, fall back to default |
| 100 | 1487833 | Image could not be downloaded | HEAD-check before sending |
| 100 | 3858504 | `standard_enhancements` deprecated | Field removed entirely |
| 31  | 3858385 | User pending action (security hold) | Surface clear message + 409 status |
| 190 / 102 / 463 | — | Token expired | Disable integration row, prompt reconnect |

---

## 9. Cron schedule

```
*/10 * * * *     render-keep-alive       Pings Render to prevent free-tier spin-down
0 * * * *        schedule-crawls-hourly  Hourly crawl dispatch
0 */3 * * *      trigger-crawl-3h        Tells Render to do its own crawl pass
```

Registered as pg_cron jobs in the `cron.job` table. View runs via `cron.job_run_details`.

---

## 10. Frontend routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | public | MarketingPage (homepage) |
| `/docs` `/privacy` `/terms` | public | Static info pages |
| `/login` `/register` `/forgot-password` `/reset-password` | public | Auth |
| `/auth/callback` | public | OAuth + email link redirect handler |
| `/auth/meta/callback` `/auth/google-ads/callback` | public | OAuth callbacks |
| `/lp/:slug` | public | Public landing page for a campaign |
| `/dashboard` | protected | Overview + recent changes feed |
| `/opportunities` | protected | MVP 2.0 stub — opportunities ranked by score |
| `/competitors` `/competitors/:id` | protected | Manage competitors + monitored pages |
| `/timeline` `/timeline/:id` | protected | Chronological change list per competitor |
| `/campaigns` | protected | Campaign list + status |
| `/leads` | protected | Captured leads (HOT/MEDIUM/LOW badges) |
| `/clients` | protected | Multi-tenant agency mode |
| `/analytics` | protected | Charts + optimization recommendations |
| `/interception` | protected | Counter-campaign dashboard |
| `/alerts` | protected | Alert history |
| `/settings` | protected | Profile + integrations (Meta, Google Ads, Gmail, WhatsApp) |

---

## 11. Integrations setup checklist

### Meta
1. Create app at developers.facebook.com → get **App ID** + **App Secret**
2. In Supabase: `npx supabase secrets set META_APP_ID=... META_APP_SECRET=...`
3. Mirror in Vault as `meta_app_id` / `meta_app_secret` (fallback)
4. In Vercel: `VITE_META_APP_ID` env var → redeploy
5. Meta App → Facebook Login → Valid OAuth Redirect URIs:
   - `https://www.digipromix.com/auth/meta/callback`
6. App Domains: `digipromix.com`
7. Required scopes: `ads_management`, `ads_read`, `pages_show_list` (`business_management` and `pages_read_engagement` were rejected in App Review — the app has no code path that uses them; see [MetaIntegration.tsx](src/components/settings/MetaIntegration.tsx))

### Google Ads
1. Cloud Console OAuth Client → **Client ID** + **Client Secret**
2. Get **Developer Token** from Google Ads UI (Tools → API Center)
3. In Supabase: `npx supabase secrets set GOOGLE_ADS_CLIENT_ID=... GOOGLE_ADS_CLIENT_SECRET=... GOOGLE_ADS_DEVELOPER_TOKEN=...`
4. Mirror in Vault
5. Cloud Console → Authorized redirect URI:
   - `https://www.digipromix.com/auth/google-ads/callback`

### Gmail (for email alerts)
1. Cloud Console OAuth Client (separate from Google Ads is fine)
2. Auth flow → get **refresh token**
3. In Supabase: set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_FROM_ADDRESS`

### Gemini (AI campaign generation)
1. Get key from aistudio.google.com
2. Set `GEMINI_API_KEY` as Supabase secret
3. Also stored in Vault as `gemini_api_key`

### Twilio (optional WhatsApp lead alerts)
1. Account SID + Auth Token + WhatsApp-enabled number
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`

---

## 12. Common operations

### Deploy frontend
Push to `main` → Vercel auto-builds via `npm run build` (`tsc -b && vite build`) → deploys to digipromix.com.

### Deploy an edge function
```bash
npx supabase functions deploy <name> --project-ref kvsjzsmlcycgfoazfunb
```

### Run a migration
```bash
# Either via CLI (if migrations are in sync):
npx supabase db push

# Or via MCP (apply_migration) or direct SQL through the Dashboard
```

### Manually trigger schedule-crawls
```sql
select net.http_post(
  url := 'https://kvsjzsmlcycgfoazfunb.supabase.co/functions/v1/schedule-crawls',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
);
```

### Launch a campaign without going through the UI
```bash
curl https://kvsjzsmlcycgfoazfunb.supabase.co/functions/v1/admin-launch-campaign \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "<uuid>",
    "admin_token": "<service-role-key>",
    "channels": ["meta"],
    "daily_budget": 200
  }'
```

### Clear orphan storage files
```sql
select net.http_post(
  url := 'https://kvsjzsmlcycgfoazfunb.supabase.co/functions/v1/cleanup-orphan-snapshots',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := '{}'::jsonb
);
```

### Health check
```bash
curl https://kvsjzsmlcycgfoazfunb.supabase.co/functions/v1/health-check
# → { status: "healthy", db: {...}, render: {...}, version: "2.0" }
```

---

## 13. Gotchas / non-obvious things

1. **`crawl-page` and `detect-changes` MUST be `verify_jwt = false`** in `config.toml`. They're called internally by `schedule-crawls` with the service-role bearer; Supabase's JWT check rejects service-role tokens at the function level even though they're valid.

2. **Snapshot storage_path is nullable.** Render Python crawler historically failed the snapshot insert if storage upload failed. We made `storage_path` nullable + added `normalized_text` so the row inserts unconditionally. `detect-changes` falls back to `normalized_text` when there's no HTML.

3. **Campaign statuses include `'failed'`.** The frontend MUST have a defensive fallback in `STATUS_CONFIG` because otherwise rendering a failed campaign crashes the page (`Cannot read properties of undefined (reading 'icon')`). Both `CampaignsPage` and `LeadsPage` use `?? fallback`.

4. **Meta `daily_budget` is in the account's smallest currency unit.** A value of `1000` means $10 USD or ₹10 INR — NOT $10 globally. Always look up account currency via `/act_<id>?fields=currency` before sending.

5. **Meta CBO**: when `daily_budget` is on the campaign, the AdSet **cannot** set its own `bid_strategy`. Doing so triggers "bid_amount required" (subcode 1815857).

6. **Meta deprecated `degrees_of_freedom_spec.standard_enhancements`** (subcode 3858504). The field is omitted entirely from creative payloads.

7. **`og:image` must be PNG/JPG/GIF/WebP, never SVG.** Meta auto-scrapes the landing page's og:image; if it points to `.svg`, the launch fails with `subcode 2446496`.

8. **Vercel deploys can lag.** Fix is in `main` ≠ fix is in the live bundle. Always verify by curling the page and grepping the bundle. The CDN cache also persists for hours — hard-refresh with `Ctrl+Shift+R`.

9. **Meta user-level holds (`code 31 / subcode 3858385`) can't be bypassed in code.** They require the user to complete Facebook's security checkup. We detect + surface a clear message + return 409.

10. **Slug collisions** in `generate-campaign` are mitigated by `crypto.randomUUID().slice(0,8)` suffix + 3-retry on 23505 unique violation.

11. **`leads_count` increments** must use the atomic RPC `increment_campaign_leads_count` — never read-then-write. Lost updates under concurrent form submissions.

12. **Cookie consent** is purely client-side (localStorage `digipromix_cookie_consent`). No tracking is currently gated behind it, but it's the source of truth for any future opt-in analytics.

---

## 14. Where to find things fast

| If you want to… | Look here |
|---|---|
| Add a new edge function | `supabase/functions/<name>/index.ts` + register in `config.toml` if special-auth |
| Add a new page / route | `src/pages/<Name>Page.tsx` + register in `src/App.tsx` |
| Change a campaign field | `src/types/database.types.ts` (Campaign interface) + DB migration |
| Change Meta launch logic | `supabase/functions/launch-meta-campaign/index.ts` |
| Tune lead intent scoring | `scoreLeadIntent()` in `supabase/functions/submit-lead/index.ts` |
| Tune budget prediction | `INDUSTRY_CPC` + `severityMultiplier` in `supabase/functions/predict-budget/index.ts` |
| Add a currency | `CURRENCY_MIN_DAILY` in **both** `launch-meta-campaign/index.ts` AND `src/hooks/useAdIntegrations.ts` |
| Find Vault secrets | `select name from vault.decrypted_secrets;` |
| Find Edge Function secrets | `npx supabase secrets list --project-ref kvsjzsmlcycgfoazfunb` |
| Inspect cron history | `cron.job_run_details` joined to `cron.job` |
| Inspect pg_net responses | `net._http_response` (look up by id from `http_post` return value) |
| Check landing page traffic | `leads` table — filter by `created_at` |

---

## 15. Outstanding / blocked items (as of 2026-05-21)

1. **Real `og-image.png`** — `index.html` references `/og-image.png` but the file doesn't exist on the origin. Currently falls through to Unsplash default. Upload a 1200×630 PNG to `public/og-image.png`.

2. **Meta account security hold** on user `Ankit Kashyap` (`2239776386838214`) — code 31. Must be cleared manually at https://business.facebook.com/adsmanager.

3. **Vercel `VITE_META_APP_ID` env var** — set `1502467894875434` in Vercel dashboard and redeploy. Without it, frontend "Connect Meta" button is disabled.

4. **`launch-google-ads-campaign` doesn't yet honor `x-admin-on-behalf-of`** — needs parity with `launch-meta-campaign` for the `admin-launch-campaign` Google path to work.

5. **Opportunity Feed UI** is just a stub at `/opportunities`. Real implementation needs a signal scoring backend.

6. **Multi-source Signal Intelligence** — Google Trends, Meta Ad Library, SEO ranking APIs not yet integrated.

7. **AI Memory Layer (pgvector)** — extension is enabled but no embeddings being written yet.

---

*This document is the authoritative reference. If something here disagrees with the code, the code wins — please update this file.*
