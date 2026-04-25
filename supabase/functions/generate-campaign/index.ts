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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Authenticate via user-scoped client (passes JWT to Auth API)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    // Service-role client for privileged DB operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { change_id } = await req.json()
    if (!change_id) return jsonResponse({ error: 'change_id is required' }, 400)

    // Fetch change with competitor details
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

    if (changeError || !change) return jsonResponse({ error: 'Change not found' }, 404)

    const competitor = change.competitors as { name: string; website_url: string; industry: string | null }
    const meta = change.metadata as Record<string, unknown> | null

    const promoCodes    = (meta?.promo_codes    as string[] | undefined)?.join(', ') ?? 'none'
    const promoKeywords = (meta?.promo_keywords as string[] | undefined)?.join(', ') ?? ''
    const addedContent  = (meta?.added_content  as string[] | undefined)?.slice(0, 3).join(' | ') ?? ''
    const campaignScore = meta?.campaign_score ?? 0
    const industry      = competitor.industry?.toLowerCase() ?? 'general'

    // Map industry to best landing page template
    const templateMap: Record<string, string> = {
      healthcare: 'healthcare', medical: 'healthcare', dental: 'healthcare', pharmacy: 'healthcare',
      'real estate': 'real-estate', property: 'real-estate', realty: 'real-estate',
      education: 'education', school: 'education', training: 'education', tutoring: 'education',
      'local services': 'local-services', plumbing: 'local-services', electrician: 'local-services',
      cleaning: 'local-services', repair: 'local-services', restaurant: 'local-services',
    }
    const suggestedTemplate = Object.entries(templateMap).find(([k]) => industry.includes(k))?.[1] ?? 'default'

    const prompt = `You are an elite digital marketing strategist specialising in competitive intelligence. A competitor just made a move. Your job: create a ruthlessly effective counter-campaign that steals their customers.

═══ COMPETITOR INTELLIGENCE ═══
Company: ${competitor.name}
Website: ${competitor.website_url}
Industry: ${industry}
What they did: ${change.title}
Details: ${change.description ?? 'N/A'}
New content detected: ${addedContent || 'N/A'}
Move type: ${change.change_type}
Urgency: ${change.severity}
Campaign intensity score: ${campaignScore}/150
Their promo codes: ${promoCodes}
Their keywords: ${promoKeywords}

═══ YOUR STRATEGY ═══
1. ANALYSE their offer — what benefit are they promising? Extract it from the details.
2. OUTBID that offer — counter with something MORE compelling (higher %, extra bonus, better terms, free add-on).
3. CREATE urgency — limited time, limited availability, exclusive.
4. TARGET their search traffic — bid on keywords people use to find ${competitor.name} or their offer.

Generate a JSON object with EXACTLY these fields:
{
  "campaign_name": "memorable internal campaign name (max 50 chars)",
  "competitor_offer_extracted": "in 1 sentence: what is the competitor actually offering?",
  "headline": "Google Search headline that counters their offer directly — start with a benefit, max 90 chars",
  "ad_copy": "2 punchy sentences: (1) name their weakness / your advantage, (2) CTA with urgency. Max 180 chars total.",
  "social_copy": "3-4 sentence Instagram/Facebook post. Open with a hook, reference competitor's move implicitly, include 2-3 emojis, end with strong CTA.",
  "offer": "your specific counter-offer — be very concrete, e.g. '20% off + free onsite assessment, this week only'. Must beat their offer.",
  "offer_justification": "1 sentence: why YOUR offer is better than ${competitor.name}'s",
  "keywords": ["8 to 12 high-intent keywords — include competitor brand name variants, their offer terms, and generic category terms"],
  "landing_page_title": "hero headline for landing page (max 70 chars) — lead with the benefit",
  "landing_page_cta": "CTA button text (max 25 chars, action verb first, e.g. 'Claim My Discount')",
  "landing_page_body": "2-3 sentences that explain the offer, create urgency, and differentiate from competitor",
  "suggested_template": "${suggestedTemplate}"
}

CRITICAL: Return ONLY valid JSON. No markdown fences, no explanation text. Make every field hyper-specific to ${competitor.name}'s industry (${industry}) and the exact move they made.`

    // Try env secret first, fall back to Supabase Vault via RPC
    let geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      const { data: vaultKey, error: vaultErr } = await supabase
        .rpc('get_vault_secret', { secret_name: 'gemini_api_key' })
      if (vaultErr) console.error('Vault read error:', vaultErr.message)
      geminiKey = vaultKey ?? null
    }
    if (!geminiKey) return jsonResponse({ error: 'Gemini API key not configured' }, 500)

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    )

    if (!aiResponse.ok) {
      const errBody = await aiResponse.json().catch(() => ({ error: { message: 'unknown' } }))
      const errMsg = errBody?.error?.message ?? 'unknown Gemini error'
      console.error('Gemini error:', aiResponse.status, errMsg)
      return jsonResponse({ error: `AI generation failed: ${errMsg}` }, 500)
    }

    const aiJson = await aiResponse.json()
    const rawText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const generated = JSON.parse(rawText)

    // Generate a unique URL-safe slug from campaign name
    function makeSlug(name: string): string {
      return name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 48) + '-' + Math.random().toString(36).slice(2, 7)
    }
    const slug = makeSlug(generated.campaign_name ?? 'campaign')

    // Use AI's template suggestion if available
    const template = generated.suggested_template ?? suggestedTemplate

    // Save campaign to DB
    const { data: campaign, error: insertError } = await supabase
      .from('campaigns')
      .insert({
        user_id:            user.id,
        change_id:          change_id,
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
      console.error('DB insert error:', insertError)
      return jsonResponse({ error: 'Failed to save campaign' }, 500)
    }

    return jsonResponse({
      campaign,
      insights: {
        competitor_offer: generated.competitor_offer_extracted ?? null,
        offer_justification: generated.offer_justification ?? null,
        suggested_template: template,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
