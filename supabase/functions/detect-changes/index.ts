import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractNormalizedLines } from '../_shared/htmlExtractor.ts'
import { bestDiff, formatDiffAsText } from '../_shared/diffGenerator.ts'
import { classifyChange } from '../_shared/changeClassifier.ts'
import type { ChangeClassification } from '../_shared/changeClassifier.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function makeAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── Type priority for merging AI vs local classification ──────────────────
const TYPE_PRIORITY: Record<string, number> = {
  campaign_launch:  6,
  promotion:        5,
  price_change:     4,
  new_landing_page: 3,
  banner_change:    3,
  new_blog_post:    2,
  content_change:   1,
}

function mergeAiSummary(
  local: ChangeClassification,
  ai: Record<string, unknown> | null,
): ChangeClassification {
  if (!ai) return local

  const merged = { ...local }

  // Use AI title/description when they carry meaningful content
  if (typeof ai.title === 'string' && ai.title.trim().length > 5) {
    merged.title = ai.title.trim()
  }
  if (typeof ai.description === 'string' && ai.description.trim().length > 10) {
    merged.description = ai.description.trim()
  }

  // Use AI change_type only when it has strictly higher priority
  const validTypes = Object.keys(TYPE_PRIORITY)
  if (typeof ai.change_type === 'string' && validTypes.includes(ai.change_type)) {
    const aiPriority    = TYPE_PRIORITY[ai.change_type] ?? 0
    const localPriority = TYPE_PRIORITY[local.change_type] ?? 0
    if (aiPriority > localPriority) {
      merged.change_type = ai.change_type as ChangeClassification['change_type']
    }
  }

  // Use AI severity only if it is higher
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3 }
  if (typeof ai.severity === 'string' && severityRank[ai.severity] !== undefined) {
    if ((severityRank[ai.severity] ?? 0) > (severityRank[local.severity] ?? 0)) {
      merged.severity = ai.severity as ChangeClassification['severity']
    }
  }

  return merged
}

// ── Coordinated campaign detection ───────────────────────────────────────
// Returns true when ≥2 other pages of the same competitor changed in the
// last 15 minutes — a strong signal that a multi-page campaign just launched.
async function checkCoordinatedLaunch(
  supabaseAdmin: ReturnType<typeof makeAdmin>,
  competitorId: string,
  currentPageId: string,
): Promise<boolean> {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('detected_changes')
    .select('monitored_page_id')
    .eq('competitor_id', competitorId)
    .neq('monitored_page_id', currentPageId)
    .gte('detected_at', fifteenMinAgo)
    .limit(3)
  return (data?.length ?? 0) >= 2
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabaseAdmin = makeAdmin()

  let body: {
    monitored_page_id?: string
    snapshot_before_id?: string
    snapshot_after_id?: string
    ai_summary?: Record<string, unknown> | null
  } = {}

  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { monitored_page_id, snapshot_before_id, snapshot_after_id } = body
  if (!monitored_page_id || !snapshot_before_id || !snapshot_after_id) {
    return jsonResponse(
      { error: 'monitored_page_id, snapshot_before_id, snapshot_after_id required' },
      400,
    )
  }

  // Fetch both snapshots
  const [beforeSnap, afterSnap] = await Promise.all([
    supabaseAdmin.from('page_snapshots').select('*').eq('id', snapshot_before_id).single(),
    supabaseAdmin.from('page_snapshots').select('*').eq('id', snapshot_after_id).single(),
  ])

  if (beforeSnap.error || afterSnap.error) {
    return jsonResponse({ error: 'Snapshots not found' }, 404)
  }

  const userId = afterSnap.data.user_id

  // Fetch page + competitor metadata
  const { data: page } = await supabaseAdmin
    .from('monitored_pages')
    .select('*, competitors(id, user_id)')
    .eq('id', monitored_page_id)
    .single()

  if (!page) {
    return jsonResponse({ error: 'Page not found' }, 404)
  }

  const competitorId = page.competitor_id

  // Download both HTML snapshots from Storage
  const [beforeFile, afterFile] = await Promise.all([
    supabaseAdmin.storage.from('snapshots').download(beforeSnap.data.storage_path),
    supabaseAdmin.storage.from('snapshots').download(afterSnap.data.storage_path),
  ])

  if (beforeFile.error || afterFile.error) {
    return jsonResponse({ error: 'Could not download snapshots' }, 500)
  }

  const beforeHtml = await beforeFile.data!.text()
  const afterHtml  = await afterFile.data!.text()

  // Normalise lines — shared between classification and diff generation
  const beforeLines = extractNormalizedLines(beforeHtml)
  const afterLines  = extractNormalizedLines(afterHtml)

  // Local classification (score-based, 7 tiers)
  let classification = classifyChange(beforeHtml, afterHtml, page.url, beforeLines, afterLines)

  // Merge Gemini AI summary from Python crawler (AI wins on higher-priority type)
  const aiSummary = body.ai_summary && typeof body.ai_summary === 'object' ? body.ai_summary : null
  if (aiSummary) {
    // Sanitise AI array fields
    for (const f of ['added_content', 'removed_content', 'promo_codes']) {
      if (!Array.isArray(aiSummary[f])) {
        aiSummary[f] = []
      } else {
        aiSummary[f] = (aiSummary[f] as unknown[])
          .filter((v) => typeof v === 'string')
          .slice(0, 10)
      }
    }
    if (typeof aiSummary.price_change_detail !== 'string') aiSummary.price_change_detail = ''

    classification = mergeAiSummary(classification, aiSummary)
  }

  // Check for coordinated multi-page campaign launch
  const isCoordinated = await checkCoordinatedLaunch(supabaseAdmin, competitorId, monitored_page_id)

  // Escalate to campaign_launch if coordinated and currently only promotion/banner
  if (
    isCoordinated &&
    ['promotion', 'banner_change', 'content_change'].includes(classification.change_type)
  ) {
    classification.change_type = 'campaign_launch'
    classification.severity    = 'high'
    if (!classification.title.includes('Campaign')) {
      classification.title = `Coordinated campaign launched on ${(() => { try { return new URL(page.url).hostname } catch { return page.url } })()}`
    }
    classification.is_coordinated    = true
    classification.action_recommended = 'Launch counter-campaign'
  } else if (isCoordinated && classification.change_type === 'campaign_launch') {
    classification.is_coordinated = true
  }

  // Generate diff and store to Storage
  const diff     = bestDiff(beforeLines, afterLines)
  const diffText = formatDiffAsText(diff)
  const diffPath = `${userId}/${competitorId}/${snapshot_after_id}.diff.txt`
  await supabaseAdmin.storage
    .from('diffs')
    .upload(diffPath, diffText, { contentType: 'text/plain', upsert: true })

  // Insert detected_change row
  const { data: change, error: changeError } = await supabaseAdmin
    .from('detected_changes')
    .insert({
      monitored_page_id,
      competitor_id: competitorId,
      user_id:       userId,
      snapshot_before: snapshot_before_id,
      snapshot_after:  snapshot_after_id,
      change_type:   classification.change_type,
      severity:      classification.severity,
      title:         classification.title,
      description:   classification.description,
      diff_storage_path: diffPath,
      metadata: {
        // Standard fields
        price_before:       classification.price_before       ?? [],
        price_after:        classification.price_after        ?? [],
        promo_keywords:     classification.promo_keywords     ?? [],
        added_content:      aiSummary?.added_content          ?? [],
        removed_content:    aiSummary?.removed_content        ?? [],
        price_change_detail: aiSummary?.price_change_detail   ?? '',
        // Campaign fields
        campaign_score:     classification.campaign_score,
        promo_codes:        classification.promo_codes        ?? aiSummary?.promo_codes ?? [],
        action_recommended: classification.action_recommended ?? null,
        is_coordinated:     classification.is_coordinated     ?? false,
        ai_enhanced:        aiSummary !== null,
      },
    })
    .select()
    .single()

  if (changeError || !change) {
    return jsonResponse({ error: 'Failed to insert change' }, 500)
  }

  // Check user alert preferences
  const { data: prefs } = await supabaseAdmin
    .from('alert_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  const defaultAlertOn = ['promotion', 'price_change', 'new_landing_page', 'campaign_launch']
  const alertOn: string[] = prefs?.alert_on ?? defaultAlertOn
  const shouldAlert = alertOn.includes(classification.change_type)

  if (shouldAlert) {
    const alertsToInsert = []
    if (prefs?.dashboard_alerts !== false) {
      alertsToInsert.push({ user_id: userId, change_id: change.id, channel: 'dashboard', status: 'pending' })
    }
    if (prefs?.email_alerts !== false) {
      alertsToInsert.push({ user_id: userId, change_id: change.id, channel: 'email', status: 'pending' })
    }
    if (alertsToInsert.length > 0) {
      await supabaseAdmin.from('alerts').insert(alertsToInsert)
    }

    // Trigger email send (fire and forget)
    const emailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email-alert`
    fetch(emailUrl, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type':   'application/json',
      },
      body: JSON.stringify({ change_id: change.id }),
    }).catch(console.error)
  }

  return jsonResponse({
    change_id:      change.id,
    change_type:    classification.change_type,
    campaign_score: classification.campaign_score ?? null,
    is_coordinated: classification.is_coordinated ?? false,
    ai_enhanced:    aiSummary !== null,
  })
})
