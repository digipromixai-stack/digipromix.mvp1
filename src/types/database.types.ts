export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type ChangeType =
  | 'promotion'
  | 'price_change'
  | 'new_landing_page'
  | 'new_blog_post'
  | 'banner_change'
  | 'content_change'
  | 'campaign_launch'

export type Severity = 'low' | 'medium' | 'high'
export type PlanType = 'free' | 'premium'
export type CrawlFrequency = 'daily' | 'hourly'
export type PageType = 'home' | 'pricing' | 'promotions' | 'blog' | 'landing_page' | 'custom'
export type AlertChannel = 'dashboard' | 'email'
export type AlertStatus = 'pending' | 'sent' | 'failed'
export type CrawlJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  plan_type: PlanType
  created_at: string
  updated_at: string
}

export interface Competitor {
  id: string
  user_id: string
  name: string
  website_url: string
  industry: string | null
  logo_url: string | null
  crawl_frequency: CrawlFrequency
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MonitoredPage {
  id: string
  competitor_id: string
  user_id: string
  url: string
  page_type: PageType
  is_active: boolean
  last_crawled_at: string | null
  created_at: string
}

export interface PageSnapshot {
  id: string
  monitored_page_id: string
  user_id: string
  storage_path: string
  content_hash: string
  normalized_hash: string | null
  prices_json: string | null
  http_status: number | null
  structured_data: Record<string, unknown> | null
  crawled_by: string | null
  crawled_at: string
}

export interface ChangeMetadata {
  price_before?: string[]
  price_after?: string[]
  promo_keywords?: string[]
  added_content?: string[]       // Key new content snippets (from Gemini AI)
  removed_content?: string[]     // Key removed content snippets (from Gemini AI)
  price_change_detail?: string   // Human-readable price change sentence
  // Campaign fields (v6 — campaign_launch type)
  campaign_score?: number        // 0–150 signal intensity score
  promo_codes?: string[]         // e.g. ["SAVE20", "USE10"]
  action_recommended?: string    // e.g. "Launch counter-campaign"
  is_coordinated?: boolean       // true = ≥2 pages of same competitor changed within 15 min
  ai_enhanced?: boolean          // true = Gemini AI analysis was merged in
}

export interface DetectedChange {
  id: string
  monitored_page_id: string
  competitor_id: string
  user_id: string
  snapshot_before: string | null
  snapshot_after: string | null
  change_type: ChangeType
  severity: Severity
  title: string
  description: string | null
  diff_storage_path: string | null
  metadata: ChangeMetadata | null
  ai_classified: boolean
  detected_at: string
  is_read: boolean
}

export interface Alert {
  id: string
  user_id: string
  change_id: string
  channel: AlertChannel
  status: AlertStatus
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export interface AlertPreferences {
  id: string
  user_id: string
  email_alerts: boolean
  dashboard_alerts: boolean
  alert_on: ChangeType[]
  created_at: string
  updated_at: string
}

export interface CrawlJob {
  id: string
  competitor_id: string
  monitored_page_id: string | null
  status: CrawlJobStatus
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// Joined types used by the UI
export interface DetectedChangeWithCompetitor extends DetectedChange {
  competitors: Pick<Competitor, 'id' | 'name' | 'website_url' | 'industry'>
  monitored_pages: Pick<MonitoredPage, 'url' | 'page_type'>
}

export interface AlertWithChange extends Alert {
  detected_changes: DetectedChangeWithCompetitor
}

// Insert types (omit auto-generated fields)
interface ProfileInsert { id: string; full_name?: string | null; avatar_url?: string | null; plan_type?: PlanType }
interface ProfileUpdate { full_name?: string | null; avatar_url?: string | null; plan_type?: PlanType }

interface CompetitorInsert { user_id: string; name: string; website_url: string; industry?: string | null; logo_url?: string | null; crawl_frequency?: CrawlFrequency; is_active?: boolean }
interface CompetitorUpdate { name?: string; website_url?: string; industry?: string | null; crawl_frequency?: CrawlFrequency; is_active?: boolean }

interface MonitoredPageInsert { competitor_id: string; user_id: string; url: string; page_type?: PageType; is_active?: boolean }
interface MonitoredPageUpdate { url?: string; page_type?: PageType; is_active?: boolean; last_crawled_at?: string | null }

interface PageSnapshotInsert { monitored_page_id: string; user_id: string; storage_path: string; content_hash: string; normalized_hash?: string | null; prices_json?: string | null; http_status?: number | null }
interface PageSnapshotUpdate { normalized_hash?: string | null }

interface DetectedChangeInsert { monitored_page_id: string; competitor_id: string; user_id: string; snapshot_before?: string | null; snapshot_after?: string | null; change_type: ChangeType; severity?: Severity; title: string; description?: string | null; diff_storage_path?: string | null }
interface DetectedChangeUpdate { is_read?: boolean }

interface AlertInsert { user_id: string; change_id: string; channel: AlertChannel; status?: AlertStatus }
interface AlertUpdate { status?: AlertStatus; sent_at?: string | null }

interface AlertPreferencesInsert { user_id: string; email_alerts?: boolean; dashboard_alerts?: boolean; alert_on?: ChangeType[] }
interface AlertPreferencesUpdate { email_alerts?: boolean; dashboard_alerts?: boolean; alert_on?: ChangeType[] }

interface CrawlJobInsert { competitor_id: string; monitored_page_id?: string | null; status?: CrawlJobStatus }
interface CrawlJobUpdate { status?: CrawlJobStatus; error_message?: string | null; started_at?: string | null; completed_at?: string | null }

export type CampaignStatus   = 'draft' | 'active' | 'paused' | 'failed' | 'completed'
export type LeadStatus       = 'new' | 'contacted' | 'qualified' | 'closed'
export type LandingTemplate  = 'default' | 'healthcare' | 'real-estate' | 'education' | 'local-services'

// ── Client (multi-tenant / agency) ────────────────────────────────────────────
export interface Client {
  id: string
  user_id: string
  name: string
  industry: string | null
  website: string | null
  logo_url: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  user_id: string
  change_id: string | null
  competitor_id: string | null
  competitor_name: string
  competitor_event: string | null
  campaign_name: string
  headline: string
  ad_copy: string
  social_copy: string | null
  offer: string | null
  keywords: string[]
  landing_page_title: string | null
  landing_page_cta: string | null
  landing_page_body: string | null
  industry: string | null
  channels: string[]
  status: CampaignStatus
  // Landing page
  slug: string | null
  published: boolean
  leads_count: number
  views_count: number
  landing_page_url: string | null
  // Ad platform IDs
  meta_campaign_id: string | null
  meta_adset_id: string | null
  meta_ad_id: string | null
  meta_error: string | null
  google_campaign_id: string | null
  google_ad_group_id: string | null
  google_ad_id: string | null
  google_error: string | null
  // Enhancements (migration 011)
  client_id: string | null
  template: LandingTemplate
  daily_budget: number | null
  // Managed-mode flow (MCC / agency Business Manager — added per mvp1.0 spec)
  launch_mode: 'self' | 'managed'
  managed_business_name: string | null
  managed_provision_status: 'not_required' | 'pending' | 'provisioning' | 'active' | 'failed'
  created_at: string
  updated_at: string
}

// ── Managed Ads Accounts (DigiPromix-provisioned sub-accounts) ────────────────
export interface ManagedAdsAccount {
  id: string
  user_id: string
  platform: 'google' | 'meta'
  external_account_id: string         // MCC sub-customer ID (Google) or act_xxx (Meta)
  resource_name: string | null        // Full resource name for Google Ads
  business_name: string
  currency_code: string
  timezone: string
  billing_status: 'pending' | 'invited' | 'active' | 'failed'
  billing_invite_link: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  user_id: string
  campaign_id: string | null
  competitor_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
  source: string
  score: number
  status: LeadStatus
  // MVP 2.0 intent-scoring columns (migration 013)
  score_type: LeadIntentScore | null
  recommended_action: string | null
  intent_level: 'hot' | 'medium' | 'low' | null
  intent_score: number | null
  intent_signals: Record<string, unknown> | null
  time_on_page_seconds: number | null
  scroll_depth_pct: number | null
  click_count: number | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
  created_at: string
  updated_at: string
}

export interface LeadWithCampaign extends Lead {
  campaigns: Pick<Campaign, 'campaign_name' | 'competitor_name'> | null
}

interface CampaignInsert {
  user_id: string; competitor_id?: string | null; change_id?: string | null
  competitor_name: string; competitor_event?: string | null
  campaign_name: string; headline: string; ad_copy: string
  social_copy?: string | null; offer?: string | null
  keywords?: string[]; landing_page_title?: string | null
  landing_page_cta?: string | null; landing_page_body?: string | null
  industry?: string | null; channels?: string[]; status?: CampaignStatus
}

interface CampaignUpdate {
  campaign_name?: string; headline?: string; ad_copy?: string
  social_copy?: string | null; offer?: string | null; keywords?: string[]
  landing_page_title?: string | null; landing_page_cta?: string | null
  landing_page_body?: string | null; channels?: string[]; status?: CampaignStatus
  // Post-time enhancements
  client_id?: string | null; template?: LandingTemplate
  daily_budget?: number | null; landing_page_url?: string | null
  published?: boolean
  // Managed-mode fields
  launch_mode?: 'self' | 'managed'
  managed_business_name?: string | null
  managed_provision_status?: 'not_required' | 'pending' | 'provisioning' | 'active' | 'failed'
}

// ── MVP 2.0 — Signal Intelligence, AI Decision Engine, Memory Layer ─────────

export type SignalType = 'competitor_change' | 'google_trends' | 'meta_ad_library' | 'seo_rank' | 'social_engagement'
export type OpportunityStatus = 'open' | 'dismissed' | 'launched' | 'expired'
export type RecommendationAction = 'launch_campaign' | 'adjust_budget' | 'pause_campaign' | 'change_creative' | 'change_audience' | 'scale_campaign' | 'reactivate'
export type LeadIntentScore = 'HOT' | 'MEDIUM' | 'LOW'

export interface Signal {
  id: string
  user_id: string
  signal_type: SignalType
  source: string
  industry: string | null
  location: string | null
  keyword: string | null
  competitor_id: string | null
  monitored_page_id: string | null
  payload: Record<string, unknown>
  growth_pct: number | null
  weight: number
  collected_at: string
  created_at: string
}

export interface Opportunity {
  id: string
  user_id: string
  signal_id: string | null
  title: string
  description: string | null
  industry: string | null
  location: string | null
  market_name: string | null
  opportunity_score: number
  expected_leads: number | null
  estimated_cpc: number | null
  estimated_cpl: number | null
  recommended_budget: number | null
  confidence: number | null
  recommended_action: string | null
  reasoning: string | null
  signal_sources: Array<Record<string, unknown>>
  status: OpportunityStatus
  expires_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AiRecommendation {
  id: string
  user_id: string
  opportunity_id: string | null
  campaign_id: string | null
  action_type: RecommendationAction
  recommendation: string
  rationale: string | null
  priority: number
  confidence: number | null
  metadata: Record<string, unknown>
  applied_at: string | null
  dismissed_at: string | null
  created_at: string
}

export interface CampaignEmbedding {
  id: string
  user_id: string
  campaign_id: string | null
  signal_id: string | null
  opportunity_id: string | null
  content_text: string | null
  // embedding: not exposed to frontend (server-side only)
  outcome_clicks: number | null
  outcome_impressions: number | null
  outcome_conversions: number | null
  outcome_spend: number | null
  outcome_leads: number | null
  seasonality_tag: string | null
  region: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface CampaignPerformance {
  id: string
  campaign_id: string
  user_id: string
  date: string                 // ISO date
  platform: 'google' | 'meta'
  clicks: number
  impressions: number
  spend: number
  conversions: number
  ctr: number | null
  cpc: number | null
  conversion_rate: number | null
  raw_payload: Record<string, unknown> | null
  fetched_at: string
}

export interface LeadScore {
  id: string
  lead_id: string
  user_id: string
  engagement_score: number
  score_type: LeadIntentScore
  page_behavior: Record<string, unknown>
  recommended_action: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// Supabase Database interface for createClient<Database> typing
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: ProfileInsert; Update: ProfileUpdate }
      competitors: { Row: Competitor; Insert: CompetitorInsert; Update: CompetitorUpdate }
      monitored_pages: { Row: MonitoredPage; Insert: MonitoredPageInsert; Update: MonitoredPageUpdate }
      page_snapshots: { Row: PageSnapshot; Insert: PageSnapshotInsert; Update: PageSnapshotUpdate }
      detected_changes: { Row: DetectedChange; Insert: DetectedChangeInsert; Update: DetectedChangeUpdate }
      alerts: { Row: Alert; Insert: AlertInsert; Update: AlertUpdate }
      alert_preferences: { Row: AlertPreferences; Insert: AlertPreferencesInsert; Update: AlertPreferencesUpdate }
      crawl_jobs: { Row: CrawlJob; Insert: CrawlJobInsert; Update: CrawlJobUpdate }
      campaigns: { Row: Campaign; Insert: CampaignInsert; Update: CampaignUpdate }
      managed_ads_accounts: { Row: ManagedAdsAccount; Insert: Partial<ManagedAdsAccount> & Pick<ManagedAdsAccount, 'user_id' | 'platform' | 'external_account_id' | 'business_name'>; Update: Partial<ManagedAdsAccount> }
      // MVP 2.0 — Signal Intelligence + AI Decision Engine + Memory + Lead Intent
      signals: { Row: Signal; Insert: Partial<Signal> & Pick<Signal, 'user_id' | 'signal_type' | 'source'>; Update: Partial<Signal> }
      opportunities: { Row: Opportunity; Insert: Partial<Opportunity> & Pick<Opportunity, 'user_id' | 'title'>; Update: Partial<Opportunity> }
      ai_recommendations: { Row: AiRecommendation; Insert: Partial<AiRecommendation> & Pick<AiRecommendation, 'user_id' | 'action_type' | 'recommendation'>; Update: Partial<AiRecommendation> }
      campaign_embeddings: { Row: CampaignEmbedding; Insert: Partial<CampaignEmbedding> & Pick<CampaignEmbedding, 'user_id'>; Update: Partial<CampaignEmbedding> }
      campaign_performance: { Row: CampaignPerformance; Insert: Partial<CampaignPerformance> & Pick<CampaignPerformance, 'campaign_id' | 'user_id' | 'date' | 'platform'>; Update: Partial<CampaignPerformance> }
      lead_scores: { Row: LeadScore; Insert: Partial<LeadScore> & Pick<LeadScore, 'lead_id' | 'user_id' | 'engagement_score' | 'score_type'>; Update: Partial<LeadScore> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
