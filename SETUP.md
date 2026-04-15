# Digipromix — Setup Guide

## Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account
- A [Resend](https://resend.com) account (for email alerts)

---

## 1. Supabase Project Setup

1. Create a new Supabase project at https://supabase.com/dashboard
2. Note your **Project URL** and **Anon Key** from Project Settings → API
3. Note your **Service Role Key** (keep this secret — only used by Edge Functions)

### Run Migrations

Go to Supabase Dashboard → SQL Editor, and run the migrations in order:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_pg_cron_jobs.sql`

> For migration 003, you need to set `app.supabase_url` and `app.service_role_key` as PostgreSQL settings:
> ```sql
> ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
> ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
> ```

### Create Storage Buckets

Go to Supabase Dashboard → Storage → Create bucket:
- `snapshots` (private)
- `diffs` (private)

### Enable Google OAuth (optional)

Go to Supabase Dashboard → Authentication → Providers → Google:
- Enable Google provider
- Add your Google OAuth Client ID and Secret

---

## 2. Frontend Setup

```bash
# Copy environment file
cp .env.example .env.local

# Edit .env.local with your values:
# VITE_SUPABASE_URL=https://your-project-ref.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Install dependencies (already done if you cloned)
npm install

# Start dev server
npm run dev
```

Open http://localhost:5173

---

## 3. Edge Functions Setup

### Install Supabase CLI

```bash
npm install -g supabase
supabase login
```

### Deploy Edge Functions

```bash
cd C:\digipromix

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set APP_URL=https://your-app-domain.com
supabase secrets set FROM_EMAIL=alerts@yourdomain.com

# Deploy all functions
supabase functions deploy crawl-page
supabase functions deploy detect-changes
supabase functions deploy schedule-crawls
supabase functions deploy send-email-alert
```

---

## 4. Testing the Crawling Engine

Once deployed, manually trigger a crawl:

```bash
# Trigger schedule-crawls manually
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/schedule-crawls \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Check results in Supabase Dashboard → Table Editor → `crawl_jobs`

---

## 5. pg_cron Schedule

The `003_pg_cron_jobs.sql` migration sets up:
- Hourly crawl (at :00 of every hour)
- Email alert safety-net (every 5 minutes)

Verify in Supabase Dashboard → SQL Editor:
```sql
SELECT * FROM cron.job;
```

---

## Architecture Overview

```
Frontend (React + Vite)
  ↓ reads/writes via anon key
Supabase PostgreSQL (8 tables)
  ↓ pg_cron triggers hourly
Edge Function: schedule-crawls
  ↓ dispatches per page
Edge Function: crawl-page → stores HTML in Storage
  ↓ triggers on change
Edge Function: detect-changes → classifies change, inserts alerts
  ↓ on alert insert
Supabase Realtime → UI toast notification
Edge Function: send-email-alert → Resend API → user inbox
```
