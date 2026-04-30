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

// Free-tier Gemini models in priority order — automatically falls back on 429
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
]

async function callGemini(apiKey: string, prompt: string): Promise<string> {
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

    // Rate/quota exceeded — try next model
    if (res.status === 429) {
      console.warn(`Model ${model} quota exceeded, trying next...`)
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
  throw new Error('All Gemini free-tier models quota exceeded. Try again later or add billing to your Google AI key.')
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

    const prompt = `You are an expert digital marketing strategist. A competitor just made a move. Generate a counter-campaign.

Competitor: ${competitor.name} (${competitor.website_url})
Industry: ${industry}
What they did: ${change.title}
Details: ${change.description ?? 'N/A'}
Added content: ${addedContent || 'N/A'}
Change type: ${change.change_type}
Severity: ${change.severity}
Score: ${campaignScore}/150
Promo codes: ${promoCodes}
Keywords: ${promoKeywords}

Return ONLY a valid JSON object (no markdown, no extra text) with these exact fields:
{
  "campaign_name": "string max 50 chars",
  "competitor_offer_extracted": "string",
  "headline": "string max 90 chars",
  "ad_copy": "string max 180 chars",
  "social_copy": "string 3-4 sentences with emojis",
  "offer": "string concrete offer",
  "offer_justification": "string 1 sentence",
  "keywords": ["array of 8-12 strings"],
  "landing_page_title": "string max 70 chars",
  "landing_page_cta": "string max 25 chars",
  "landing_page_body": "string 2-3 sentences",
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

    function makeSlug(name: string): string {
      return name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '').trim()
        .replace(/\s+/g, '-').replace(/-+/g, '-')
        .slice(0, 48) + '-' + Math.random().toString(36).slice(2, 7)
    }
    const slug = makeSlug((generated.campaign_name as string) || 'campaign')
    const template = (generated.suggested_template as string) || suggestedTemplate

    const { data: campaign, error: insertError } = await supabase
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

    if (insertError) {
      console.error('DB insert error:', insertError.code, insertError.message)
      return jsonResponse({ error: 'Failed to save campaign', detail: insertError.message }, 500)
    }

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
