---
name: digipromix-secrets-config
description: "Complete Supabase secrets inventory for DigiPromix — what each secret does, which functions use it, and what's missing. Updated June 2026."
metadata: 
  node_type: memory
  type: project
  originSessionId: 8850e522-a7ec-4567-88a3-e25b24fadc29
---

# DigiPromix — Supabase Secrets & Config

**Project:** kvsjzsmlcycgfoazfunb  
**Dashboard:** Supabase Dashboard → Edge Functions → Secrets  
**To set:** `npx supabase secrets set KEY=value --project-ref kvsjzsmlcycgfoazfunb`

---

## Core AI

| Secret | Used by | Notes |
|---|---|---|
| `GEMINI_API_KEY` | generate-campaign, detect-changes, score-opportunities, embed-campaign | Primary AI key — Gemini 2.5 Flash fallback chain |
| `OPENAI_API_KEY` | (legacy, may be unused) | Was used before Gemini migration |

---

## Meta Ads

| Secret | Used by | Notes |
|---|---|---|
| `META_APP_ID` | meta-oauth, launch-meta-campaign | Meta App ID from developers.facebook.com |
| `META_APP_SECRET` | meta-oauth, launch-meta-campaign | Meta App Secret |
| `META_APP_ACCESS_TOKEN` | collect-meta-ads | App-level token for Ad Library API (format: `appid\|secret`) |
| `META_BUSINESS_ID` | launch-meta-campaign (managed mode) | Business Manager ID for MCC-style sub-account creation |

---

## Google Ads

| Secret | Used by | Notes |
|---|---|---|
| `GOOGLE_ADS_CLIENT_ID` | google-ads-oauth, launch-google-ads-campaign | OAuth client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | google-ads-oauth, launch-google-ads-campaign | OAuth client secret |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | launch-google-ads-campaign, manage-google-ads-campaign | Google Ads dev token (apply at ads.google.com) |

---

## Gmail (Email Alerts)

| Secret | Used by | Notes |
|---|---|---|
| `GMAIL_CLIENT_ID` | send-email-alert | OAuth client for Gmail API |
| `GMAIL_CLIENT_SECRET` | send-email-alert | |
| `GMAIL_REFRESH_TOKEN` | send-email-alert | Long-lived refresh token |
| `GMAIL_FROM_ADDRESS` | send-email-alert | Sender email (e.g. alerts@digipromix.com) |

---

## Crawling & Signals

| Secret | Used by | Notes |
|---|---|---|
| `SCRAPE_DO_API_KEY` | crawl-page | Anti-bot bypass for JS-heavy competitor sites |
| `SERPAPI_KEY` | collect-google-trends | Google Trends via SerpAPI (optional — falls back to RSS) |

---

## API Version Control (from _shared/config.ts — June 2026)

These allow bumping API versions without redeployment. All have hardcoded fallbacks.

| Secret | Default | What it controls |
|---|---|---|
| `META_GRAPH_VERSION` | `v19.0` | Meta Graph API version in ALL meta functions |
| `GOOGLE_ADS_VERSION` | `v20` | Google Ads REST API version in ALL google functions |

**To bump Meta to v21:** `supabase secrets set META_GRAPH_VERSION=v21.0`
All 5 meta functions pick it up on next invocation — no redeploy.

---

## Campaign Targeting Defaults (from _shared/config.ts — June 2026)

| Secret | Default | Notes |
|---|---|---|
| `DEFAULT_TARGET_COUNTRIES` | `US` | Comma-separated ISO codes e.g. `US,IN,GB` |
| `DEFAULT_AGE_MIN` | `18` | Meta ad audience minimum age |
| `DEFAULT_AGE_MAX` | `65` | Meta ad audience maximum age |
| `CAMPAIGN_DURATION_DAYS` | `365` | Google Ads campaign end date offset |
| `CPC_BUDGET_RATIO` | `0.3` | Max CPC = daily budget × this (30%) |
| `CPC_HARD_CAP_USD` | `5` | Absolute CPC ceiling in USD |
| `KEYWORD_LIMIT` | `8` | Max keywords per Google Ads campaign |

**Note:** `launch-meta-campaign` also accepts `target_countries`, `age_min`, `age_max` in the request body for per-campaign override.

---

## Optimization Engine Thresholds (from _shared/config.ts — June 2026)

| Secret | Default | Detector |
|---|---|---|
| `OPT_RISING_CPC_MULT` | `1.5` | Flag if recent CPC > early CPC × 1.5 |
| `OPT_DECLINING_CTR_MULT` | `0.6` | Flag if recent CTR < early CTR × 0.6 |
| `OPT_CONVERSION_DROP_MULT` | `0.5` | Flag if recent CVR < early CVR × 0.5 |
| `OPT_FATIGUE_IMP_STABLE` | `0.25` | Impressions within ±25% = "stable" |
| `OPT_FATIGUE_CTR_MULT` | `0.7` | Flag fatigue if CTR < early × 0.7 |
| `OPT_FATIGUE_MIN_IMP` | `500` | Min impressions to trigger fatigue alert |
| `OPT_MIN_CLICKS_CVR` | `10` | Min recent clicks before CVR drop fires |
| `OPT_LOOKBACK_DAYS` | `14` | Days of metrics optimize-campaigns fetches |

---

## Auto-managed by Supabase (do not touch)

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin bypass key used by supabaseAdmin.ts |
| `SUPABASE_DB_URL` | Direct Postgres connection |
| `SUPABASE_JWKS` | JWT verification keys |
| `SUPABASE_PUBLISHABLE_KEYS` | Public keys |
| `SUPABASE_SECRET_KEYS` | Internal secret keys |

---

## Missing — Needs Setup

| Secret | Needed for | How to get |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | WhatsApp lead alerts (submit-lead) | twilio.com → console |
| `TWILIO_AUTH_TOKEN` | WhatsApp lead alerts | twilio.com → console |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp lead alerts | Format: `whatsapp:+14155238886` |

Without Twilio secrets, WhatsApp alerts in `submit-lead` silently skip (no crash — best-effort).
