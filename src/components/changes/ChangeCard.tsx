import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ExternalLink,
  GitCompare,
  Tag,
  DollarSign,
  FileText,
  BookOpen,
  Megaphone,
  Edit3,
  ArrowRight,
  PlusCircle,
  MinusCircle,
  Rocket,
} from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Badge, ChangeTypeBadge, SeverityBadge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { DiffViewer } from './DiffViewer'
import { timeAgo, formatUrl } from '../../lib/utils'
import type { ChangeType, DetectedChangeWithCompetitor } from '../../types/database.types'

// Per-type visual config
const TYPE_CONFIG: Record<ChangeType, {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  border: string
}> = {
  campaign_launch: {
    icon: Rocket,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    border: 'border-l-orange-400',
  },
  promotion: {
    icon: Tag,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    border: 'border-l-red-400',
  },
  price_change: {
    icon: DollarSign,
    iconBg: 'bg-yellow-50',
    iconColor: 'text-yellow-600',
    border: 'border-l-yellow-400',
  },
  new_landing_page: {
    icon: FileText,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    border: 'border-l-blue-400',
  },
  new_blog_post: {
    icon: BookOpen,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    border: 'border-l-green-400',
  },
  banner_change: {
    icon: Megaphone,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    border: 'border-l-purple-400',
  },
  content_change: {
    icon: Edit3,
    iconBg: 'bg-gray-50',
    iconColor: 'text-gray-400',
    border: 'border-l-gray-300',
  },
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PriceChange({ before, after, detail }: { before: string[]; after: string[]; detail?: string }) {
  if (!before.length && !after.length && !detail) return null
  return (
    <div className="mt-1.5 space-y-1">
      {(before.length > 0 || after.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {before.slice(0, 3).map((p) => (
            <span key={p} className="inline-flex items-center px-2 py-0.5 rounded bg-red-50 text-red-600 text-xs font-mono line-through">
              {p}
            </span>
          ))}
          {before.length > 0 && after.length > 0 && (
            <ArrowRight size={12} className="text-gray-400 shrink-0" />
          )}
          {after.slice(0, 3).map((p) => (
            <span key={p} className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-mono font-semibold">
              {p}
            </span>
          ))}
        </div>
      )}
      {detail && (
        <p className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">{detail}</p>
      )}
    </div>
  )
}

function PromoKeywords({ keywords }: { keywords: string[] }) {
  if (!keywords.length) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
      {keywords.slice(0, 4).map((kw) => (
        <Badge key={kw} variant="danger" className="text-xs capitalize">
          {kw}
        </Badge>
      ))}
    </div>
  )
}

function ContentDelta({
  added,
  removed,
  compact = false,
}: {
  added: string[]
  removed: string[]
  compact?: boolean
}) {
  if (!added.length && !removed.length) return null
  const maxItems = compact ? 2 : 4

  return (
    <div className={`space-y-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
      {removed.slice(0, maxItems).map((item, i) => (
        <div key={`rm-${i}`} className="flex items-start gap-1.5">
          <MinusCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
          <span className="text-xs text-red-600 line-through leading-snug">{item}</span>
        </div>
      ))}
      {added.slice(0, maxItems).map((item, i) => (
        <div key={`add-${i}`} className="flex items-start gap-1.5">
          <PlusCircle size={11} className="text-green-500 shrink-0 mt-0.5" />
          <span className="text-xs text-green-700 leading-snug">{item}</span>
        </div>
      ))}
    </div>
  )
}

function CampaignSignals({
  score,
  codes,
  coordinated,
}: {
  score?: number
  codes?: string[]
  coordinated?: boolean
}) {
  if (score === undefined && !codes?.length && !coordinated) return null
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      {score !== undefined && (
        <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
          Score {score}/150
        </span>
      )}
      {codes?.slice(0, 3).map((c) => (
        <span key={c} className="text-xs font-mono bg-pink-50 text-pink-700 px-2 py-0.5 rounded font-semibold">
          {c}
        </span>
      ))}
      {coordinated && (
        <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-semibold">
          ⚡ Coordinated launch
        </span>
      )}
    </div>
  )
}

// ── Main card ──────────────────────────────────────────────────────────────

export function ChangeCard({ change }: { change: DetectedChangeWithCompetitor }) {
  const [showDiff, setShowDiff] = useState(false)
  const cfg  = TYPE_CONFIG[change.change_type] ?? TYPE_CONFIG.content_change
  const Icon = cfg.icon
  const meta = change.metadata

  const addedContent   = meta?.added_content   ?? []
  const removedContent = meta?.removed_content ?? []
  const hasContentDelta = addedContent.length > 0 || removedContent.length > 0
  const isCampaign = change.change_type === 'campaign_launch'

  return (
    <>
      <Card className={`border-l-4 ${cfg.border} hover:shadow-md transition-shadow`}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            {/* Type icon */}
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5 ${cfg.iconBg}`}>
              <Icon size={15} className={cfg.iconColor} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <ChangeTypeBadge type={change.change_type} />
                <SeverityBadge severity={change.severity} />
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-gray-900 leading-snug">{change.title}</p>

              {/* Description */}
              {change.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{change.description}</p>
              )}

              {/* Campaign signals (campaign_launch only) */}
              {isCampaign && (
                <CampaignSignals
                  score={meta?.campaign_score}
                  codes={meta?.promo_codes}
                  coordinated={meta?.is_coordinated}
                />
              )}

              {/* Price change */}
              {change.change_type === 'price_change' && meta && (
                <PriceChange
                  before={meta.price_before ?? []}
                  after={meta.price_after ?? []}
                  detail={meta.price_change_detail}
                />
              )}

              {/* Promo keywords */}
              {change.change_type === 'promotion' && meta?.promo_keywords?.length ? (
                <PromoKeywords keywords={meta.promo_keywords} />
              ) : null}

              {/* Added / removed content (compact — 2 items each) */}
              {hasContentDelta && change.change_type !== 'price_change' && (
                <ContentDelta added={addedContent} removed={removedContent} compact />
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Link
                  to={`/timeline/${change.competitor_id}`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {change.competitors?.name}
                </Link>
                <span className="text-gray-200 text-xs">·</span>
                <a
                  href={change.monitored_pages?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                >
                  {formatUrl(change.monitored_pages?.url ?? '')}
                  <ExternalLink size={9} className="ml-0.5" />
                </a>
                <span className="text-gray-200 text-xs">·</span>
                <span className="text-xs text-gray-400">{timeAgo(change.detected_at)}</span>
                {change.diff_storage_path && (
                  <>
                    <span className="text-gray-200 text-xs">·</span>
                    <button
                      onClick={() => setShowDiff(true)}
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-0.5 hover:underline"
                    >
                      <GitCompare size={11} />
                      View diff
                    </button>
                  </>
                )}

                {/* Campaign CTA button */}
                {isCampaign && (
                  <button
                    className="ml-auto text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-full font-semibold flex items-center gap-1 transition-colors"
                    onClick={() => alert('Coming soon: AI counter-campaign generator')}
                  >
                    <Rocket size={11} />
                    Launch Counter Campaign
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diff modal */}
      {change.diff_storage_path && (
        <Modal
          open={showDiff}
          onClose={() => setShowDiff(false)}
          title="Page Diff"
          size="xl"
        >
          {/* Modal header */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${cfg.iconBg}`}>
              <Icon size={13} className={cfg.iconColor} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <ChangeTypeBadge type={change.change_type} />
              <SeverityBadge severity={change.severity} />
            </div>
            <span className="text-xs text-gray-400 ml-auto">
              {change.competitors?.name} · {timeAgo(change.detected_at)}
            </span>
          </div>

          {/* Campaign signals in modal */}
          {isCampaign && (
            <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-orange-50 border border-orange-100">
              <Rocket size={14} className="text-orange-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <CampaignSignals
                  score={meta?.campaign_score}
                  codes={meta?.promo_codes}
                  coordinated={meta?.is_coordinated}
                />
                {meta?.action_recommended && (
                  <p className="text-xs text-orange-700 mt-1 font-medium">{meta.action_recommended}</p>
                )}
              </div>
            </div>
          )}

          {/* Price detail in modal */}
          {change.change_type === 'price_change' && meta && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-100 text-sm">
              <DollarSign size={14} className="text-yellow-600 shrink-0" />
              <PriceChange
                before={meta.price_before ?? []}
                after={meta.price_after ?? []}
                detail={meta.price_change_detail}
              />
            </div>
          )}

          {/* Promo keywords in modal */}
          {change.change_type === 'promotion' && meta?.promo_keywords?.length ? (
            <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
              <Tag size={14} className="text-red-500 shrink-0 mt-0.5" />
              <PromoKeywords keywords={meta.promo_keywords} />
            </div>
          ) : null}

          {/* Full added/removed list in modal */}
          {hasContentDelta && (
            <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What changed</p>
              <ContentDelta added={addedContent} removed={removedContent} compact={false} />
            </div>
          )}

          {/* AI description */}
          {change.description && (
            <p className="text-sm text-gray-600 mb-4">{change.description}</p>
          )}

          {/* Page URL */}
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-gray-400">Page:</span>
            <a
              href={change.monitored_pages?.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
            >
              {change.monitored_pages?.url}
              <ExternalLink size={9} />
            </a>
          </div>

          <DiffViewer diffStoragePath={change.diff_storage_path} />
        </Modal>
      )}
    </>
  )
}
