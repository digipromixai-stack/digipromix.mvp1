import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { extractNormalizedLines } from '../_shared/htmlExtractor.ts'
import { bestDiff, formatDiffAsText } from '../_shared/diffGenerator.ts'
import { classifyChange } from '../_shared/changeClassifier.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  let body: { monitored_page_id?: string; snapshot_before_id?: string; snapshot_after_id?: string; ai_summary?: any } = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { monitored_page_id, snapshot_before_id, snapshot_after_id } = body
  if (!monitored_page_id || !snapshot_before_id || !snapshot_after_id) {
    return jsonResponse({ error: 'monitored_page_id, snapshot_before_id, snapshot_after_id required' }, 400)
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

  // Fetch page metadata
  const { data: page } = await supabaseAdmin
    .from('monitored_pages')
    .select('*, competitors(id, user_id)')
    .eq('id', monitored_page_id)
    .single()

  if (!page) {
    return jsonResponse({ error: 'Page not found' }, 404)
  }

  const competitorId = page.competitor_id

  // Download both HTML files from Storage
  const [beforeFile, afterFile] = await Promise.all([
    supabaseAdmin.storage.from('snapshots').download(beforeSnap.data.storage_path),
    supabaseAdmin.storage.from('snapshots').download(afterSnap.data.storage_path),
  ])

  if (beforeFile.error || afterFile.error) {
    return jsonResponse({ error: 'Could not download snapshots' }, 500)
  }

  const beforeHtml = await beforeFile.data!.text()
  const afterHtml = await afterFile.data!.text()

  // Extract lines first — shared between classification and diff generation
  const beforeLines = extractNormalizedLines(beforeHtml)
  const afterLines = extractNormalizedLines(afterHtml)

  // Classify the change (pass lines to avoid word-bag false positives)
  let classification = classifyChange(beforeHtml, afterHtml, page.url, beforeLines, afterLines)

  // Override with Gemini AI Summary if provided by the Python crawler
  if (body.ai_summary) {
    classification.title = body.ai_summary.title || classification.title
    classification.description = body.ai_summary.description || classification.description
    
    // Ensure valid enums are passed by Gemini
    const validChangeTypes = ['promotion', 'price_change', 'new_landing_page', 'new_blog_post', 'banner_change', 'content_change']
    if (validChangeTypes.includes(body.ai_summary.change_type)) {
      classification.change_type = body.ai_summary.change_type
    }
    
    const validSeverities = ['low', 'medium', 'high']
    if (validSeverities.includes(body.ai_summary.severity)) {
       classification.severity = body.ai_summary.severity
    }
  }

  // Generate diff — Myers for small pages (context-aware), simpleDiff fallback for large
  const diff = bestDiff(beforeLines, afterLines)
  const diffText = formatDiffAsText(diff)

  // Store diff in Storage
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
      user_id: userId,
      snapshot_before: snapshot_before_id,
      snapshot_after: snapshot_after_id,
      change_type: classification.change_type,
      severity: classification.severity,
      title: classification.title,
      description: classification.description,
      diff_storage_path: diffPath,
      metadata: {
        price_before: classification.price_before ?? [],
        price_after: classification.price_after ?? [],
        promo_keywords: classification.promo_keywords ?? [],
        // Richer fields from Python / Gemini AI
        added_content: body.ai_summary?.added_content ?? [],
        removed_content: body.ai_summary?.removed_content ?? [],
        price_change_detail: body.ai_summary?.price_change_detail ?? '',
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

  const alertOn: string[] = prefs?.alert_on ?? ['promotion', 'price_change', 'new_landing_page']
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
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ change_id: change.id }),
    }).catch(console.error)
  }

  return jsonResponse({ change_id: change.id, change_type: classification.change_type }, 200)
})
