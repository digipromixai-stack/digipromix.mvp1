/**
 * embed-campaign — MVP 2.0 §6 AI Memory Layer
 *
 * Generates an OpenAI text-embedding-3-small (1536-dim) for a single
 * campaign and persists it to `campaign_embeddings`. Idempotent: a second
 * call for the same campaign updates the existing row instead of inserting
 * a duplicate.
 *
 * POST { campaign_id, admin_token? }
 *   - admin_token equals SUPABASE_SERVICE_ROLE_KEY → bypass user auth
 *     (used by generate-campaign + backfill scripts)
 *   - otherwise: standard user-auth check
 *
 * Returns { embedding_id, similarity_to_top_match, used_tokens }.
 * The embedding model is fixed at text-embedding-3-small (1536-dim) to match
 * the vector column dimension. Cost: ~$0.02 per 1M tokens — negligible.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Build the text-to-embed from a campaign row. Order matters: most informative
// fields first so truncation at the model's token limit doesn't drop the
// signal.
function campaignToText(c: Record<string, unknown>): string {
  return [
    c.industry        ? `Industry: ${c.industry}`        : null,
    c.campaign_name   ? `Campaign: ${c.campaign_name}`   : null,
    c.headline        ? `Headline: ${c.headline}`        : null,
    c.offer           ? `Offer: ${c.offer}`              : null,
    c.ad_copy         ? `Ad copy: ${c.ad_copy}`          : null,
    c.social_copy     ? `Social: ${c.social_copy}`       : null,
    c.landing_page_title ? `Landing title: ${c.landing_page_title}` : null,
    c.landing_page_body  ? `Landing body: ${c.landing_page_body}`   : null,
    Array.isArray(c.keywords) && (c.keywords as unknown[]).length
      ? `Keywords: ${(c.keywords as string[]).join(', ')}`
      : null,
    c.competitor_name ? `Competitor: ${c.competitor_name}` : null,
    c.competitor_event ? `Trigger event: ${c.competitor_event}` : null,
  ].filter(Boolean).join('\n')
}

/**
 * Generate a 768-dim normalized embedding via Gemini `gemini-embedding-001`.
 * Free under the standard Gemini API key. Dimension is requested explicitly
 * (the model natively outputs 3072; 768 is enough for MVP retrieval).
 */
async function geminiEmbed(text: string, apiKey: string): Promise<{ embedding: number[]; tokens: number }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: text.slice(0, 30000) }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini embeddings ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json() as { embedding: { values: number[] } }
  return { embedding: data.embedding.values, tokens: 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const body = await req.json().catch(() => ({}))
    const { campaign_id, admin_token } = body as { campaign_id?: string; admin_token?: string }
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    // Auth — service-role bypass OR user JWT verification.
    // Accept admin_token if it matches the SERVICE_ROLE_KEY env var OR if it
    // decodes as a valid service_role JWT (Supabase recently introduced a new
    // `sb_secret_...` format; the env value may differ from the JWT we have).
    function isServiceRoleToken(token: string): boolean {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (serviceKey && token === serviceKey) return true
      // JWT shape with role=service_role in payload
      const parts = token.split('.')
      if (parts.length !== 3) return false
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        return payload?.role === 'service_role'
      } catch { return false }
    }

    let userId: string | null = null
    if (admin_token && isServiceRoleToken(admin_token)) {
      // Lookup campaign owner directly
      const { data: c } = await admin.from('campaigns').select('user_id').eq('id', campaign_id).single()
      if (!c) return json({ error: 'Campaign not found' }, 404)
      userId = c.user_id as string
    } else {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: { user }, error: authErr } = await userClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
      userId = user.id
    }

    // Fetch the campaign content
    const { data: campaign, error: campErr } = await admin
      .from('campaigns')
      .select('id, user_id, industry, campaign_name, headline, ad_copy, social_copy, offer, keywords, landing_page_title, landing_page_body, competitor_name, competitor_event')
      .eq('id', campaign_id)
      .eq('user_id', userId!)
      .single()
    if (campErr || !campaign) return json({ error: 'Campaign not found or access denied' }, 404)

    const text = campaignToText(campaign)
    if (text.length < 10) {
      return json({ error: 'Campaign has no embeddable content yet' }, 400)
    }

    // Resolve Gemini key (env → vault)
    let apiKey = Deno.env.get('GEMINI_API_KEY') ?? null
    if (!apiKey) {
      const { data: vaultKey } = await admin.rpc('get_vault_secret', { secret_name: 'gemini_api_key' })
      apiKey = (vaultKey as string | null) ?? null
    }
    if (!apiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 500)

    // Generate the embedding (Gemini text-embedding-004 → 768-dim, free tier)
    const { embedding, tokens } = await geminiEmbed(text, apiKey)

    // Upsert into campaign_embeddings (idempotent on campaign_id)
    // First try update — if no row, insert.
    const { data: existing } = await admin
      .from('campaign_embeddings')
      .select('id')
      .eq('campaign_id', campaign_id)
      .maybeSingle()

    let embeddingId: string
    if (existing) {
      const { error } = await admin.from('campaign_embeddings')
        .update({
          content_text: text,
          embedding,
          metadata: { tokens, model: 'gemini-embedding-001', dim: 768, embedded_at: new Date().toISOString() },
        })
        .eq('id', existing.id)
      if (error) return json({ error: 'Update failed', detail: error.message }, 500)
      embeddingId = existing.id as string
    } else {
      const { data, error } = await admin.from('campaign_embeddings')
        .insert({
          user_id:      userId!,
          campaign_id,
          content_text: text,
          embedding,
          metadata:     { tokens, model: 'gemini-embedding-001', dim: 768, embedded_at: new Date().toISOString() },
        })
        .select('id').single()
      if (error || !data) return json({ error: 'Insert failed', detail: error?.message }, 500)
      embeddingId = data.id as string
    }

    // Find the closest existing match (for diagnostics — shows whether this campaign
    // is unique or near-duplicate of past work)
    const { data: matches } = await admin
      .rpc('match_campaign_embeddings', {
        query_embedding: embedding,
        match_user_id:   userId,
        match_threshold: 0.5,
        match_count:     2,
        exclude_campaign: campaign_id,
      })

    return json({
      embedding_id: embeddingId,
      tokens_used:  tokens,
      similar_past_campaigns: (matches ?? []).map((m: { campaign_id: string; similarity: number }) => ({
        campaign_id: m.campaign_id,
        similarity:  Math.round(m.similarity * 1000) / 1000,
      })),
    })
  } catch (err) {
    console.error('embed-campaign error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
