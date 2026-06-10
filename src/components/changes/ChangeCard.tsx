import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ExternalLink, GitCompare, Tag, DollarSign, FileText, BookOpen,
  Megaphone, Edit3, ArrowRight, PlusCircle, MinusCircle, Rocket,
  TrendingDown, TrendingUp, Zap, Eye, ChevronRight, Crosshair,
} from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Badge, ChangeTypeBadge, SeverityBadge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { DiffViewer } from './DiffViewer'
import { CampaignModal } from '../campaigns/CampaignModal'
import { timeAgo, formatUrl } from '../../lib/utils'
import type { ChangeType, DetectedChangeWithCompetitor } from '../../types/database.types'

// ── Per-type visual config ─────────────────────────────────────────────────
const TYPE_CONFIG: Record<ChangeType, {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  border: string
  accent: string
  label: string
}> = {
  campaign_launch: { icon: Rocket,    iconBg: 'bg-orange-50', iconColor: 'text-orange-500', border: 'border-l-orange-400', accent: 'bg-orange-50 border-orange-200', label: 'Campaign Launch' },
  promotion:       { icon: Tag,       iconBg: 'bg-red-50',    iconColor: 'text-red-500',    border: 'border-l-red-400',    accent: 'bg-red-50 border-red-200',    label: 'Promotion' },
  price_change:    { icon: DollarSign,iconBg: 'bg-yellow-50', iconColor: 'text-yellow-600', border: 'border-l-yellow-400', accent: 'bg-yellow-50 border-yellow-200',label: 'Price Change' },
  new_landing_page:{ icon: FileText,  iconBg: 'bg-blue-50',   iconColor: 'text-blue-500',   border: 'border-l-blue-400',   accent: 'bg-blue-50 border-blue-200',   label: 'New Landing Page' },
  new_blog_post:   { icon: BookOpen,  iconBg: 'bg-green-50',  iconColor: 'text-green-600',  border: 'border-l-green-400',  accent: 'bg-green-50 border-green-200', label: 'New Blog Post' },
  banner_change:   { icon: Megaphone, iconBg: 'bg-purple-50', iconColor: 'text-purple-500', border: 'border-l-purple-400', accent: 'bg-purple-50 border-purple-200',label: 'Banner Change' },
  content_change:  { icon: Edit3,     iconBg: 'bg-gray-100',  iconColor: 'text-gray-500',   border: 'border-l-gray-300',   accent: 'bg-gray-50 border-gray-200',   label: 'Content Change' },
}

// ── What-Changed detail sections ───────────────────────────────────────────

function PriceChangeDetail({ before, after, detail }: { before: string[]; after: string[]; detail?: string }) {
  const hasBoth = before.length > 0 && after.length > 0
  const isIncrease = hasBoth && parseFloat(after[0].replace(/[^0-9.]/g,'')) > parseFloat(before[0].replace(/[^0-9.]/g,''))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <DollarSign size={13} />
        Price Changed
      </div>

      {hasBoth ? (
        <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200">
          {/* Before */}
          <div className="text-center flex-1">
            <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">Before</p>
            <div className="space-y-1">
              {before.slice(0,3).map(p => (
                <p key={p} className="text-xl font-bold text-red-500 line-through font-mono">{p}</p>
              ))}
            </div>
          </div>
          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <ArrowRight size={20} className="text-gray-400" />
            {isIncrease
              ? <span className="text-xs text-red-600 font-semibold flex items-center gap-0.5"><TrendingUp size={11}/>Up</span>
              : <span className="text-xs text-green-600 font-semibold flex items-center gap-0.5"><TrendingDown size={11}/>Down</span>
            }
          </div>
          {/* After */}
          <div className="text-center flex-1">
            <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">After</p>
            <div className="space-y-1">
              {after.slice(0,3).map(p => (
                <p key={p} className={`text-xl font-bold font-mono ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {before.map(p => <span key={p} className="px-3 py-1 rounded-lg bg-red-50 text-red-600 text-sm font-mono font-semibold line-through">{p}</span>)}
          {after.map(p => <span key={p} className="px-3 py-1 rounded-lg bg-green-50 text-green-700 text-sm font-mono font-semibold">{p}</span>)}
        </div>
      )}

      {detail && (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-lg">{detail}</p>
      )}
    </div>
  )
}

function PromoDetail({ keywords, codes }: { keywords: string[]; codes?: string[] }) {
  return (
    <div className="space-y-3">
      {codes && codes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Tag size={12}/>Promo Codes Detected</p>
          <div className="flex flex-wrap gap-2">
            {codes.map(c => (
              <span key={c} className="px-3 py-1.5 rounded-lg bg-pink-100 text-pink-800 text-sm font-mono font-bold border border-pink-200 tracking-wider">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      {keywords.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Zap size={12}/>Promotion Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map(kw => (
              <Badge key={kw} variant="danger" className="capitalize">{kw}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ContentDeltaDetail({ added, removed }: { added: string[]; removed: string[] }) {
  if (!added.length && !removed.length) return null
  return (
    <div className="space-y-3">
      {removed.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <MinusCircle size={12}/>Removed Content
          </p>
          <div className="space-y-1.5">
            {removed.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                <MinusCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 line-through leading-snug">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {added.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <PlusCircle size={12}/>Added Content
          </p>
          <div className="space-y-1.5">
            {added.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-green-50 border border-green-100">
                <PlusCircle size={13} className="text-green-500 shrink-0 mt-0.5" />
                <p className="text-sm text-green-800 leading-snug">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CampaignDetail({ score, codes, coordinated, action }: { score?: number; codes?: string[]; coordinated?: boolean; action?: string }) {
  const intensity = score === undefined ? 0 : Math.min(100, Math.round((score / 150) * 100))
  const intensityColor = intensity >= 70 ? 'bg-red-500' : intensity >= 40 ? 'bg-orange-400' : 'bg-yellow-400'
  return (
    <div className="space-y-3">
      {score !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign Intensity</p>
            <span className="text-sm font-bold text-orange-700">{score} / 150</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${intensityColor} rounded-full transition-all`} style={{ width: `${intensity}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {intensity >= 70 ? '🔴 High urgency — counter now' : intensity >= 40 ? '🟡 Medium signal — monitor closely' : '🟢 Low signal'}
          </p>
        </div>
      )}
      {codes && codes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Tag size={12}/>Promo Codes</p>
          <div className="flex flex-wrap gap-2">
            {codes.map(c => (
              <span key={c} className="px-3 py-1.5 rounded-lg bg-pink-100 text-pink-800 text-sm font-mono font-bold border border-pink-200">{c}</span>
            ))}
          </div>
        </div>
      )}
      {coordinated && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <Zap size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-semibold">Coordinated launch — multiple pages changed simultaneously</p>
        </div>
      )}
      {action && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200">
          <Rocket size={14} className="text-orange-500 shrink-0" />
          <p className="text-sm text-orange-800 font-medium">{action}</p>
        </div>
      )}
    </div>
  )
}

// Compact inline preview shown directly on the card
function CardPreview({ change }: { change: DetectedChangeWithCompetitor }) {
  const meta = change.metadata
  const type = change.change_type

  if (type === 'price_change' && meta) {
    const before = meta.price_before ?? []
    const after  = meta.price_after  ?? []
    if (before.length || after.length) {
      return (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {before.slice(0,2).map(p => <span key={p} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-500 line-through">{p}</span>)}
          {before.length > 0 && after.length > 0 && <ArrowRight size={11} className="text-gray-400 shrink-0" />}
          {after.slice(0,2).map(p => <span key={p} className="text-xs font-mono px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">{p}</span>)}
          {meta.price_change_detail && <span className="text-xs text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded">{meta.price_change_detail}</span>}
        </div>
      )
    }
  }

  if ((type === 'promotion' || type === 'campaign_launch') && meta) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {meta.promo_codes?.slice(0,2).map(c => (
          <span key={c} className="text-xs font-mono px-2 py-0.5 rounded bg-pink-50 text-pink-700 font-bold border border-pink-100">{c}</span>
        ))}
        {meta.promo_keywords?.slice(0,3).map(kw => (
          <Badge key={kw} variant="danger" className="text-xs capitalize">{kw}</Badge>
        ))}
        {meta.campaign_score !== undefined && (
          <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-semibold">Score {meta.campaign_score}/150</span>
        )}
      </div>
    )
  }

  const added   = meta?.added_content   ?? []
  const removed = meta?.removed_content ?? []
  if (added.length || removed.length) {
    return (
      <div className="mt-1.5 space-y-0.5">
        {removed.slice(0,1).map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <MinusCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
            <span className="text-xs text-red-600 line-through line-clamp-1">{item}</span>
          </div>
        ))}
        {added.slice(0,2).map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <PlusCircle size={11} className="text-green-500 shrink-0 mt-0.5" />
            <span className="text-xs text-green-700 line-clamp-1">{item}</span>
          </div>
        ))}
        {(added.length + removed.length) > 3 && (
          <p className="text-xs text-gray-400 ml-4">+{added.length + removed.length - 3} more changes</p>
        )}
      </div>
    )
  }

  return null
}

// ── Deep-link helper ───────────────────────────────────────────────────────
// Build a Chrome/Edge/Safari "text fragment" URL that auto-scrolls + highlights
// the changed text on the live page. Browsers without support just ignore the
// fragment, so it degrades to a normal URL.
//
// Spec: https://wicg.github.io/scroll-to-text-fragment/
// Syntax: <url>#:~:text=<startText>[,<endText>]
//
// Returns { url, searchText } — searchText is shown in the button tooltip so
// the user can see what we're hunting for on the live page.
function buildDeepLink(
  url: string | undefined,
  change: DetectedChangeWithCompetitor,
): { url: string; searchText: string } | null {
  if (!url) return null
  const meta = change.metadata

  // Collect every potential anchor string we have.
  const raw: (string | undefined)[] = [
    ...(meta?.added_content   ?? []),
    ...(meta?.promo_codes     ?? []),
    ...(meta?.price_after     ?? []),
    ...(meta?.promo_keywords  ?? []),
    change.title,
  ]

  // Clean each candidate and score it for "how findable it is on the live page".
  // Higher score = more likely to match a single, unique DOM text node.
  const candidates = raw
    .filter((s): s is string => typeof s === 'string')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 6)
    // Skip concatenated nav-junk like "HomeAboutUsServicesResources" or
    // "HomeAbout UsServicesResources" — strings with 2+ direct CamelCase
    // glue points are usually merged menu items. They exist in the crawler's
    // collapsed text but never appear as a single DOM text node on the live
    // site, so Chrome will never find them.
    .filter(s => (s.match(/[a-z][A-Z]/g) ?? []).length < 2)
    // Strip characters that break the fragment grammar
    .map(s => s.replace(/[,&#]/g, '').trim())
    .filter(s => s.length >= 6)

  if (candidates.length === 0) return null

  // Prefer the candidate with the MOST words (more distinctive → less chance
  // of matching the wrong section). Tie-break by raw length.
  const ranked = candidates
    .map(s => ({ s, words: s.split(' ').length, len: s.length }))
    .sort((a, b) => (b.words - a.words) || (b.len - a.len))

  const winner = ranked[0].s

  // Build the fragment. For phrases ≥10 words use the `textStart,textEnd`
  // range syntax so Chrome highlights the whole block, not just the first
  // word. Cap each end at 5 words to keep the URL short and matchable.
  const allWords = winner.split(' ')
  let fragment: string
  let searchText: string
  if (allWords.length >= 10) {
    const start = allWords.slice(0, 5).join(' ')
    const end   = allWords.slice(-5).join(' ')
    fragment   = `${encodeURIComponent(start)},${encodeURIComponent(end)}`
    searchText = `"${start}" → "${end}"`
  } else {
    // Up to 8 words, single match
    const phrase = allWords.slice(0, 8).join(' ')
    fragment   = encodeURIComponent(phrase)
    searchText = `"${phrase}"`
  }

  const base = url.split('#')[0]
  return { url: `${base}#:~:text=${fragment}`, searchText }
}

// ── Main card ──────────────────────────────────────────────────────────────

export function ChangeCard({ change }: { change: DetectedChangeWithCompetitor }) {
  const [showDetail, setShowDetail] = useState(false)
  // showDiff state removed — DiffViewer is now inline inside the detail modal
  const [showCampaign, setShowCampaign] = useState(false)

  const cfg  = TYPE_CONFIG[change.change_type] ?? TYPE_CONFIG.content_change
  const Icon = cfg.icon
  const meta = change.metadata

  const addedContent   = meta?.added_content   ?? []
  const removedContent = meta?.removed_content ?? []
  const hasContentDelta = addedContent.length > 0 || removedContent.length > 0
  const hasDetail = hasContentDelta
    || (change.change_type === 'price_change' && meta)
    || (change.change_type === 'promotion' && (meta?.promo_keywords?.length || meta?.promo_codes?.length))
    || (change.change_type === 'campaign_launch')
    || change.diff_storage_path

  return (
    <>
      {/* ── Card ── */}
      <Card
        className={`border-l-4 ${cfg.border} hover:shadow-md transition-all cursor-pointer group`}
        onClick={() => setShowDetail(true)}
      >
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5 ${cfg.iconBg}`}>
              <Icon size={15} className={cfg.iconColor} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Badges row */}
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <ChangeTypeBadge type={change.change_type} />
                <SeverityBadge severity={change.severity} />
                {!change.is_read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" title="Unread" />
                )}
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-gray-900 leading-snug">{change.title}</p>

              {/* Inline preview of what changed */}
              <CardPreview change={change} />

              {/* Description (fallback if no preview) */}
              {!hasContentDelta && change.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{change.description}</p>
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Link
                  to={`/timeline/${change.competitor_id}`}
                  onClick={e => e.stopPropagation()}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {change.competitors?.name}
                </Link>
                <span className="text-gray-200 text-xs">·</span>
                <a
                  href={change.monitored_pages?.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                >
                  {formatUrl(change.monitored_pages?.url ?? '')}
                  <ExternalLink size={9} className="ml-0.5" />
                </a>
                <span className="text-gray-200 text-xs">·</span>
                <span className="text-xs text-gray-400">{timeAgo(change.detected_at)}</span>

                {/* "See details" hint */}
                {hasDetail && (
                  <span className="ml-auto text-xs text-gray-400 group-hover:text-blue-500 flex items-center gap-0.5 transition-colors">
                    <Eye size={11} />See details
                    <ChevronRight size={11} />
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Detail Modal ── */}
      <Modal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={cfg.label}
        size="lg"
      >
        {/* WHERE — competitor + page-type + full URL with Open Page button.
            Replaces the older two-row layout so the "what page on whose site"
            answer is immediately visible. */}
        {(() => {
          const pageUrl  = change.monitored_pages?.url ?? ''
          const pageType = (change.monitored_pages?.page_type ?? 'custom').replace('_', ' ')
          const compName = change.competitors?.name ?? 'Unknown'
          const compSite = change.competitors?.website_url ?? ''
          const favicon  = compSite ? `https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(compSite).hostname } catch { return '' } })()}&sz=64` : null
          const deepLink = buildDeepLink(pageUrl, change)
          return (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Where this changed</p>
              <div className="flex items-start gap-3">
                {favicon && (
                  <img src={favicon} alt="" className="w-10 h-10 rounded-lg bg-white border border-gray-200 p-1 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-gray-900">{compName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold uppercase tracking-wide">
                      {pageType}
                    </span>
                  </div>
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1 truncate"
                    title={pageUrl}
                  >
                    {pageUrl}
                    <ExternalLink size={10} className="shrink-0" />
                  </a>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <ChangeTypeBadge type={change.change_type} />
                    <SeverityBadge severity={change.severity} />
                    <span className="text-xs text-gray-400">{timeAgo(change.detected_at)}</span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col gap-1.5 shrink-0">
                  {deepLink && (
                    <a
                      href={deepLink.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Scrolls to ${deepLink.searchText} on the live page (Chrome / Edge / Safari).`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                    >
                      <Crosshair size={12} />
                      Jump to change
                    </a>
                  )}
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open page
                  </a>
                </div>
              </div>
              {/* Mobile-friendly buttons (full-width below) */}
              <div className="sm:hidden flex gap-2 mt-3">
                {deepLink && (
                  <a
                    href={deepLink.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`Scrolls to ${deepLink.searchText} on the live page.`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg"
                  >
                    <Crosshair size={12} />
                    Jump to change
                  </a>
                )}
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg"
                >
                  <ExternalLink size={12} />
                  Open page
                </a>
              </div>
            </div>
          )
        })()}

        {/* WHAT — short title acts as the summary headline */}
        <p className="text-base font-semibold text-gray-900 leading-snug mb-4">{change.title}</p>

        {/* ── Type-specific "What Changed" ── */}
        <div className="space-y-5">

          {/* Price change */}
          {change.change_type === 'price_change' && meta && (
            <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200">
              <PriceChangeDetail
                before={meta.price_before ?? []}
                after={meta.price_after  ?? []}
                detail={meta.price_change_detail}
              />
            </div>
          )}

          {/* Promotion */}
          {change.change_type === 'promotion' && meta && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <PromoDetail
                keywords={meta.promo_keywords ?? []}
                codes={meta.promo_codes}
              />
            </div>
          )}

          {/* Campaign launch */}
          {change.change_type === 'campaign_launch' && meta && (
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
              <CampaignDetail
                score={meta.campaign_score}
                codes={meta.promo_codes}
                coordinated={meta.is_coordinated}
                action={meta.action_recommended}
              />
            </div>
          )}

          {/* Added / removed content */}
          {hasContentDelta && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Edit3 size={12} />What Changed on the Page
              </p>
              <ContentDeltaDetail added={addedContent} removed={removedContent} />
            </div>
          )}

          {/* AI Summary */}
          {change.description && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">AI Summary</p>
              <p className="text-sm text-blue-900 leading-relaxed">{change.description}</p>
            </div>
          )}

          {/* Exact Page Changes — always visible.
              • When a diff file was stored (HTML snapshot path): render DiffViewer.
              • When only content-delta is available (normalised-text path): render a
                lightweight inline diff so the section is never empty.
              • When neither is present: show a subtle "not available" note. */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <GitCompare size={12} />Exact Page Changes
            </p>
            {change.diff_storage_path ? (
              <DiffViewer diffStoragePath={change.diff_storage_path} />
            ) : hasContentDelta ? (
              /* Inline diff — mirrors DiffViewer's dark mono style */
              <div className="rounded-xl overflow-hidden border border-gray-800">
                {/* toolbar */}
                <div className="flex items-center gap-4 px-4 py-2 bg-gray-950 border-b border-gray-800 text-xs">
                  <span className="text-gray-400 font-medium font-mono">content delta</span>
                  <span className="ml-auto flex items-center gap-3">
                    {removedContent.length > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <MinusCircle size={10} />{removedContent.length} removed
                      </span>
                    )}
                    {addedContent.length > 0 && (
                      <span className="flex items-center gap-1 text-green-400">
                        <PlusCircle size={10} />{addedContent.length} added
                      </span>
                    )}
                  </span>
                </div>
                {/* diff lines */}
                <div className="font-mono text-xs bg-gray-950 text-gray-200 max-h-80 overflow-y-auto">
                  {removedContent.map((line, i) => (
                    <div key={`r${i}`} className="flex hover:bg-red-900/20">
                      <span className="select-none w-7 shrink-0 text-center py-1 leading-5 font-bold text-red-500 border-r border-gray-800">−</span>
                      <span className="flex-1 py-1 px-3 leading-5 whitespace-pre-wrap break-all text-red-300 bg-red-500/10">{line}</span>
                    </div>
                  ))}
                  {addedContent.map((line, i) => (
                    <div key={`a${i}`} className="flex hover:bg-green-900/20">
                      <span className="select-none w-7 shrink-0 text-center py-1 leading-5 font-bold text-green-500 border-r border-gray-800">+</span>
                      <span className="flex-1 py-1 px-3 leading-5 whitespace-pre-wrap break-all text-green-300 bg-green-500/10">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-12 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 text-xs gap-1.5">
                <GitCompare size={12} />Snapshot diff not stored for this change
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={() => { setShowDetail(false); setShowCampaign(true) }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Rocket size={14} />
            Generate Counter-Campaign
          </button>
        </div>
      </Modal>

      {/* ── Campaign Modal ── */}
      <CampaignModal
        change={change}
        open={showCampaign}
        onClose={() => setShowCampaign(false)}
      />

      {/* Diff Modal removed — DiffViewer is now inline inside the detail modal above */}
    </>
  )
}
