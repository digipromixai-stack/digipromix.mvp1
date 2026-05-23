import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Free-tier Gemini models for this API key (tested 2026-05).
// Newer Google AI keys only support 2.5+ series — 2.0 models return 404.
// Falls back automatically on 429 (quota) or 404 (unavailable).
const GEMINI_MODELS = [
  'gemini-2.5-flash',       // best free model, 15 RPM
  'gemini-flash-latest',    // always points to latest flash, free
  'gemini-2.5-flash-lite',  // lightest, fastest fallback, free
]

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  let lastError = ''
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    // Quota exceeded or model unavailable/removed — try next
    if (res.status === 429 || res.status === 404) {
      lastError = `Model ${model} unavailable (HTTP ${res.status})`
      console.warn(lastError + ', trying next...')
      continue
    }

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    }

    const json = await res.json()
    const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!text) {
      const reason = json.candidates?.[0]?.finishReason ?? 'unknown'
      throw new Error(`Empty response from ${model}, finishReason: ${reason}`)
    }
    console.log(`Generated with model: ${model}`)
    return text
  }
  throw new Error(`All Gemini models failed. Last error: ${lastError}. Try again later or add billing to your Google AI key.`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonResponse({ error: 'Unauthorized', detail: authError?.message }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { change_id } = await req.json()
    if (!change_id) return jsonResponse({ error: 'change_id is required' }, 400)

    const { data: change, error: changeError } = await supabase
      .from('detected_changes')
      .select(`
        id, title, description, change_type, severity, metadata,
        competitor_id,
        competitors ( name, website_url, industry ),
        monitored_pages ( url, page_type )
      `)
      .eq('id', change_id)
      .eq('user_id', user.id)
      .single()

    if (changeError || !change) return jsonResponse({ error: 'Change not found', detail: changeError?.message }, 404)

    const competitor = change.competitors as { name: string; website_url: string; industry: string | null }
    const meta = change.metadata as Record<string, unknown> | null

    const promoCodes    = (meta?.promo_codes    as string[] | undefined)?.join(', ') ?? 'none'
    const promoKeywords = (meta?.promo_keywords as string[] | undefined)?.join(', ') ?? ''
    const addedContent  = (meta?.added_content  as string[] | undefined)?.slice(0, 3).join(' | ') ?? ''
    const campaignScore = meta?.campaign_score ?? 0
    const industry      = competitor.industry?.toLowerCase() ?? 'general'

    const templateMap: Record<string, string> = {
      healthcare: 'healthcare', medical: 'healthcare', dental: 'healthcare', pharmacy: 'healthcare',
      'real estate': 'real-estate', property: 'real-estate', realty: 'real-estate',
      education: 'education', school: 'education', training: 'education', tutoring: 'education',
      'local services': 'local-services', plumbing: 'local-services', electrician: 'local-services',
      cleaning: 'local-services', repair: 'local-services', restaurant: 'local-services',
    }
    const suggestedTemplate = Object.entries(templateMap).find(([k]) => industry.includes(k))?.[1] ?? 'default'

    // ── MVP 2.0 §6 — RAG retrieval ─────────────────────────────────────
    // Embed the trigger event + look up similar past campaigns from the
    // user's memory. Failures here are non-fatal — the generator still
    // works, just without past-outcome context.
    let ragContext = ''
    try {
      const ragQuery = [
        `Industry: ${industry}`,
        `Event: ${change.change_type}`,
        `Signal: ${change.title}`,
        promoKeywords ? `Keywords: ${promoKeywords}` : null,
      ].filter(Boolean).join('\n')

      // Gemini gemini-embedding-001 — 768-dim, free under the existing key
      const ragKey = Deno.env.get('GEMINI_API_KEY')
        ?? (await supabase.rpc('get_vault_secret', { secret_name: 'gemini_api_key' })).data
      if (ragKey) {
        const embRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${ragKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/gemini-embedding-001',
              content: { parts: [{ text: ragQuery.slice(0, 8000) }] },
              taskType: 'RETRIEVAL_QUERY',
              outputDimensionality: 768,
            }),
          },
        )
        if (embRes.ok) {
          const embData = await embRes.json() as { embedding: { values: number[] } }
          const qVec = embData.embedding.values
          const { data: similar } = await supabase.rpc('match_campaign_embeddings', {
            query_embedding: qVec,
            match_user_id:   user.id,
            match_threshold: 0.55,
            match_count:     3,
            exclude_campaign: null,
          })
          if (similar && (similar as unknown[]).length > 0) {
            const lines = (similar as Array<{
              similarity: number; outcome_leads: number | null;
              outcome_conversions: number | null; outcome_spend: number | null;
              content_text: string | null;
            }>).map((m, i) => {
              const o: string[] = []
              if (m.outcome_leads        != null) o.push(`${m.outcome_leads} leads`)
              if (m.outcome_conversions  != null) o.push(`${m.outcome_conversions} conv`)
              if (m.outcome_spend        != null) o.push(`$${m.outcome_spend} spend`)
              const outcome = o.length ? ` [outcome: ${o.join(', ')}]` : ''
              const snippet = (m.content_text ?? '').replace(/\s+/g, ' ').slice(0, 300)
              return `[${i + 1}] sim=${m.similarity.toFixed(2)}${outcome} → ${snippet}`
            }).join('\n')
            ragContext = `\n\nPAST CAMPAIGN MEMORY (similar opportunities you've launched before — use as inspiration for what works, do NOT copy verbatim):\n${lines}\n`
          }
        }
      }
    } catch (e) {
      console.warn('RAG retrieval failed (non-fatal):', e instanceof Error ? e.message : e)
    }

    const prompt = `You are an expert digital marketing strategist and legal compliance specialist.
A market opportunity has been detected in the ${industry} industry. Generate a counter-campaign that positions YOUR brand strongly.

STRICT LEGAL RULES — you MUST follow all of these:
1. NEVER mention, reference, or allude to any competitor name, brand, product, or website.
2. NEVER make comparative claims (e.g. "better than", "unlike others", "competitors charge more").
3. NEVER use another company's trademark, slogan, or branded terms.
4. All claims must be truthful, non-misleading, and supportable — no superlatives like "the best in the world" unless generic.
5. Focus entirely on YOUR brand's own strengths, value, and offer.
6. Copy must comply with FTC guidelines and general advertising law.

Market context (use only to understand the opportunity — do NOT copy or reference):
- Industry: ${industry}
- Market event type: ${change.change_type}
- Opportunity signal: ${change.title}
- Relevant keywords in market: ${promoKeywords || 'N/A'}
- Active promotions in market: ${promoCodes !== 'none' ? 'Yes — consider matching or beating with your own offer' : 'None detected'}
- Market intensity score: ${campaignScore}/150
${ragContext}
Your task: Write campaign content that:
- Highlights YOUR unique value proposition in the ${industry} space
- Creates urgency and a compelling offer WITHOUT referencing anyone else
- Uses positive, benefit-focused language about what YOU provide
- Is ready to run on Google Ads and social media without any legal review issues

Return ONLY a valid JSON object (no markdown, no extra text) with these exact fields:
{
  "campaign_name": "string max 50 chars — your brand campaign name only",
  "competitor_offer_extracted": "string — describe the market opportunity in neutral terms",
  "headline": "string max 90 chars — your value prop, no competitor mention",
  "ad_copy": "string max 180 chars — benefit-focused, legally safe, no comparisons",
  "social_copy": "string 3-4 sentences with emojis — positive, engaging, brand-focused",
  "offer": "string — your concrete offer (discount, free trial, guarantee etc.)",
  "offer_justification": "string 1 sentence — why this offer makes sense for your audience",
  "keywords": ["array of 8-12 generic industry keywords — no competitor brand names"],
  "landing_page_title": "string max 70 chars — benefit headline",
  "landing_page_cta": "string max 25 chars — action-oriented CTA",
  "landing_page_body": "string 2-3 sentences — value-focused, legally safe body copy",
  "suggested_template": "${suggestedTemplate}"
}`

    // Resolve Gemini API key
    let geminiKey: string | null = Deno.env.get('GEMINI_API_KEY') ?? null
    if (!geminiKey) {
      const { data: vaultKey, error: vaultErr } = await supabase
        .rpc('get_vault_secret', { secret_name: 'gemini_api_key' })
      if (vaultErr) {
        console.error('Vault RPC error:', vaultErr.message)
        return jsonResponse({ error: 'Vault lookup failed', detail: vaultErr.message }, 500)
      }
      geminiKey = vaultKey ?? null
    }
    if (!geminiKey) return jsonResponse({ error: 'Gemini API key not configured' }, 500)

    // Call Gemini with automatic free-tier model fallback
    let rawText: string
    try {
      rawText = await callGemini(geminiKey, prompt)
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
      console.error('Gemini error:', msg)
      return jsonResponse({ error: 'AI generation failed', detail: msg }, 500)
    }

    // Strip markdown code fences just in case
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let generated: Record<string, unknown>
    try {
      generated = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('JSON parse failed. Raw (500 chars):', rawText.slice(0, 500))
      return jsonResponse({ error: 'AI returned invalid JSON', detail: rawText.slice(0, 300) }, 500)
    }

    function makeSlugBase(name: string): string {
      return name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '').trim()
        .replace(/\s+/g, '-').replace(/-+/g, '-')
        .slice(0, 48) || 'campaign'
    }
    function randomSuffix(): string {
      // 8 chars from crypto.randomUUID — ~280 trillion possibilities
      return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    }
    const slugBase = makeSlugBase((generated.campaign_name as string) || 'campaign')
    const template = (generated.suggested_template as string) || suggestedTemplate

    // Retry insert up to 3 times if slug collides (Postgres unique violation = 23505)
    let campaign: Record<string, unknown> | null = null
    let insertError: { code?: string; message: string } | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = `${slugBase}-${randomSuffix()}`
      const result = await supabase
        .from('campaigns')
        .insert({
          user_id:            user.id,
          change_id,
          competitor_id:      change.competitor_id,
          competitor_name:    competitor.name,
          competitor_event:   change.title,
          industry:           competitor.industry,
          campaign_name:      generated.campaign_name,
          headline:           generated.headline,
          ad_copy:            generated.ad_copy,
          social_copy:        generated.social_copy        ?? null,
          offer:              generated.offer              ?? null,
          keywords:           generated.keywords           ?? [],
          landing_page_title: generated.landing_page_title ?? null,
          landing_page_cta:   generated.landing_page_cta   ?? null,
          landing_page_body:  generated.landing_page_body  ?? null,
          status:             'draft',
          channels:           [],
          slug,
          published:          false,
          leads_count:        0,
          template,
        })
        .select()
        .single()

      if (!result.error) { campaign = result.data; insertError = null; break }
      insertError = { code: result.error.code, message: result.error.message }
      // Unique violation on slug — retry with new suffix
      if (result.error.code === '23505') continue
      break
    }

    if (insertError || !campaign) {
      console.error('DB insert error:', insertError?.code, insertError?.message)
      return jsonResponse({ error: 'Failed to save campaign', detail: insertError?.message }, 500)
    }

    // ── MVP 2.0 §6 — Add this campaign to AI Memory (fire-and-forget) ──
    // Generates an embedding so future opportunities can RAG-retrieve this
    // campaign as past inspiration. Failure is silent; the embedding is
    // ancillary and can be backfilled later by re-running embed-campaign.
    const embedUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/embed-campaign`
    const embedReq = fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: (campaign as { id: string }).id,
        admin_token: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      }),
    }).catch((e) => console.warn('embed-campaign dispatch failed:', e))
    // @ts-expect-error EdgeRuntime is Supabase-specific
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(embedReq)

    return jsonResponse({
      campaign,
      insights: {
        competitor_offer:    generated.competitor_offer_extracted ?? null,
        offer_justification: generated.offer_justification        ?? null,
        suggested_template:  template,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Unexpected error:', msg)
    return jsonResponse({ error: 'Internal server error', detail: msg }, 500)
  }
})
