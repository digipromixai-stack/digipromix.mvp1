export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type ChangeType =
  | 'promotion'
  | 'price_change'
  | 'new_landing_page'
  | 'new_blog_post'
  | 'banner_change'
  | 'content_change'

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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
