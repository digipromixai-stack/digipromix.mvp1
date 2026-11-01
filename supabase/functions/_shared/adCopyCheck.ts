/**
 * Pre-launch ad copy check — shared by launch-meta-campaign and
 * launch-google-ads-campaign. Blocks a launch when the copy contains
 * template placeholders, a competitor's brand name, or raw change-detection
 * text, and returns one plain-language problem per issue so the user knows
 * exactly what to edit.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLACEHOLDERS: { re: RegExp; label: string }[] = [
  { re: /your\s*brand/i,                       label: '"YourBrand"' },
  { re: /\[(brand|your company|company|name|city|offer)[^\]]*\]/i, label: 'a [placeholder] in brackets' },
  { re: /\{\{?\s*\w+\s*\}?\}/,                 label: 'a {placeholder} in braces' },
  { re: /your company/i,                       label: '"Your Company"' },
  { re: /lorem ipsum/i,                        label: '"Lorem ipsum"' },
  { re: /exclusive limited[-\s]time offer/i,   label: '"exclusive limited-time offer" (generic filler)' },
]

// Text produced by changeClassifier / detect-changes that must never be shown to customers
const DETECTION_TEXT: { re: RegExp; label: string }[] = [
  { re: /new promotional content/i, label: '"New promotional content: …" (raw detection text)' },
  { re: /content change detected/i, label: '"Content change detected" (raw detection text)' },
  { re: /price change detected/i,   label: '"Price change detected" (raw detection text)' },
]

const FIELDS: { key: string; label: string }[] = [
  { key: 'campaign_name', label: 'Campaign name' },
  { key: 'headline',      label: 'Headline' },
  { key: 'ad_copy',       label: 'Ad text' },
  { key: 'social_copy',   label: 'Social text' },
  { key: 'offer',         label: 'Offer' },
  { key: 'cta',           label: 'Call to action' },
]

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Brand tokens to look for: the competitor name plus its domain's main label (zalando.de → zalando). */
function competitorTerms(c: { name?: string | null; website_url?: string | null }): string[] {
  const terms = new Set<string>()
  const name = (c.name ?? '').trim()
  if (name.length >= 3) terms.add(name)
  const raw = c.website_url ?? ''
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '')
    const label = host.split('.')[0]
    if (label && label.length >= 4) terms.add(label)
  } catch { /* no usable domain */ }
  return [...terms]
}

export async function checkAdCopy(
  admin: SupabaseClient,
  userId: string,
  campaign: Record<string, unknown>,
): Promise<string[]> {
  const problems: string[] = []

  const [{ data: competitors }, { data: profile }] = await Promise.all([
    admin.from('competitors').select('name, website_url').eq('user_id', userId),
    admin.from('profiles').select('business_name').eq('id', userId).maybeSingle(),
  ])
  const ownBrand = String(campaign.managed_business_name ?? profile?.business_name ?? '').toLowerCase()
  const brandTerms = (competitors ?? [])
    .flatMap((c) => competitorTerms(c))
    // never flag the advertiser's own brand, even if it is also tracked
    .filter((t) => !ownBrand || !ownBrand.includes(t.toLowerCase()))

  for (const { key, label } of FIELDS) {
    const text = campaign[key]
    if (typeof text !== 'string' || !text.trim()) continue

    for (const p of PLACEHOLDERS) {
      if (p.re.test(text)) problems.push(`${label} contains ${p.label} — replace it with your real wording.`)
    }
    for (const d of DETECTION_TEXT) {
      if (d.re.test(text)) problems.push(`${label} contains ${d.label} — rewrite it as customer-facing copy.`)
    }
    for (const term of brandTerms) {
      if (new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(text)) {
        problems.push(`${label} mentions the competitor "${term}" — remove competitor brand names from your ads.`)
      }
    }
  }

  return [...new Set(problems)]
}

export function adCopyErrorMessage(problems: string[]): string {
  return `Fix the ad text before launching:\n• ${problems.join('\n• ')}`
}
