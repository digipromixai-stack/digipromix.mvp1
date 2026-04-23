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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

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

    const promoCodes = (meta?.promo_codes as string[] | undefined)?.join(', ') ?? 'none'
    const promoKeywords = (meta?.promo_keywords as string[] | undefined)?.join(', ') ?? ''
    const campaignScore = meta?.campaign_score ?? 0

    const prompt = `You are an expert digital marketing strategist. A competitor just made a significant move. Generate an aggressive, highly specific counter-campaign.

COMPETITOR CONTEXT:
- Name: ${competitor.name}
- Website: ${competitor.website_url}
- Industry: ${competitor.industry ?? 'general'}
- What they did: ${change.title}
- Details: ${change.description ?? 'N/A'}
- Type of move: ${change.change_type}
- Urgency level: ${change.severity}
- Campaign intensity score: ${campaignScore}/150
- Promo codes they used: ${promoCodes}
- Keywords detected: ${promoKeywords}

Generate a counter-campaign JSON with these exact fields:
{
  "campaign_name": "short memorable name for this campaign (max 50 chars)",
  "headline": "primary ad headline that directly counters competitor's offer (max 90 chars, no punctuation at end)",
  "ad_copy": "2 sentences of compelling ad description that highlights why we are better (max 180 chars total)",
  "social_copy": "3-4 sentence Instagram/Facebook post with 2-3 relevant emojis and a strong CTA, referencing competitor's move implicitly",
  "offer": "specific counter-offer that beats competitor (be concrete, e.g. '15% off + free consultation this week only')",
  "keywords": ["5 to 8 high-intent search keywords to bid on, targeting people searching for competitor's offer"],
  "landing_page_title": "hero headline for the landing page (max 70 chars)",
  "landing_page_cta": "call-to-action button text (max 25 chars, action verb first)",
  "landing_page_body": "2-3 sentences that explain the offer and create urgency for the landing page"
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation. Make it specific to their industry and the exact move they made.`

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return jsonResponse({ error: 'OpenAI API key not configured' }, 500)

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiResponse.ok) {
      const err = await aiResponse.text()
      console.error('OpenAI error:', err)
      return jsonResponse({ error: 'AI generation failed' }, 500)
    }

    const aiJson = await aiResponse.json()
    const generated = JSON.parse(aiJson.choices[0].message.content)

    // Save campaign to DB
    const { data: campaign, error: insertError } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        change_id: change_id,
        competitor_id: change.competitor_id,
        competitor_name: competitor.name,
        competitor_event: change.title,
        industry: competitor.industry,
        campaign_name: generated.campaign_name,
        headline: generated.headline,
        ad_copy: generated.ad_copy,
        social_copy: generated.social_copy ?? null,
        offer: generated.offer ?? null,
        keywords: generated.keywords ?? [],
        landing_page_title: generated.landing_page_title ?? null,
        landing_page_cta: generated.landing_page_cta ?? null,
        landing_page_body: generated.landing_page_body ?? null,
        status: 'draft',
        channels: [],
      })
      .select()
      .single()

    if (insertError) {
      console.error('DB insert error:', insertError)
      return jsonResponse({ error: 'Failed to save campaign' }, 500)
    }

    return jsonResponse({ campaign })
  } catch (err) {
    console.error('Unexpected error:', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
