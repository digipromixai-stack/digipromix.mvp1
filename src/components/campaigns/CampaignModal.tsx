import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Rocket, Loader2, Copy, Check, Zap, Globe, Share2,
  Search, CheckCircle2, ChevronDown, ChevronUp, X,
  ExternalLink, AlertTriangle,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { invokeFunction, supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useMetaIntegration } from '../../hooks/useAdIntegrations'
import type { Campaign } from '../../types/database.types'
import type { DetectedChangeWithCompetitor } from '../../types/database.types'

interface Props {
  change: DetectedChangeWithCompetitor
  open: boolean
  onClose: () => void
}

type Step = 'generate' | 'preview' | 'posted'

const CHANNELS = [
  { id: 'google',    label: 'Google Ads',  icon: Search, color: 'text-blue-600'   },
  { id: 'meta',      label: 'Meta Ads',    icon: Globe,  color: 'text-indigo-600' },
  { id: 'instagram', label: 'Instagram',   icon: Share2, color: 'text-pink-600'   },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-gray-400 hover:text-gray-600 p-1 rounded"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  )
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = value.length > 120
  const display = isLong && !expanded ? value.slice(0, 120) + '…' : value
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <CopyButton text={value} />
      </div>
      <p className={`text-sm text-gray-800 leading-relaxed ${multiline ? 'whitespace-pre-wrap' : ''}`}>{display}</p>
      {isLong && (
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-500 mt-1 flex items-center gap-0.5">
          {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
        </button>
      )}
    </div>
  )
}

export function CampaignModal({ change, open, onClose }: Props) {
  const qc = useQueryClient()
  const { metaIntegration } = useMetaIntegration()

  const [step, setStep]               = useState<Step>('generate')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [campaign, setCampaign]       = useState<Campaign | null>(null)
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['meta'])
  const [posting, setPosting]         = useState(false)
  const [landingUrl, setLandingUrl]   = useState('')
  const [metaResult, setMetaResult]   = useState<{ meta_campaign_id?: string } | null>(null)

  const handleClose = () => { setStep('generate'); setError(null); setCampaign(null); setMetaResult(null); onClose() }

  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: fnError } = await invokeFunction<{ campaign: Campaign }>('generate-campaign', { change_id: change.id })
      if (fnError) throw fnError
      if (!data?.campaign) throw new Error('No campaign returned')
      setCampaign(data.campaign)
      setStep('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed. Check that OPENAI_API_KEY is configured.')
    } finally { setLoading(false) }
  }

  const toggleChannel = (id: string) =>
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const postCampaign = async () => {
    if (!campaign) return
    setPosting(true); setError(null)
    try {
      // Save status + channels to DB
      await supabase
        .from('campaigns')
        .update({ status: 'active', channels: selectedChannels, landing_page_url: landingUrl || null })
        .eq('id', campaign.id)
      qc.invalidateQueries({ queryKey: ['campaigns'] })

      // Launch to Meta if connected and selected
      if (selectedChannels.includes('meta') && metaIntegration) {
        const { data, error: launchErr } = await invokeFunction<{ meta_campaign_id: string }>(
          'launch-meta-campaign',
          { campaign_id: campaign.id, landing_page_url: landingUrl || undefined }
        )
        if (launchErr) throw launchErr
        setMetaResult(data)
      }

      setStep('posted')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Post failed')
    } finally { setPosting(false) }
  }

  const metaSelected = selectedChannels.includes('meta')

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'generate' ? 'Generate Counter-Campaign' : step === 'preview' ? (campaign?.campaign_name ?? 'Campaign Ready') : 'Campaign Posted!'}
      size="xl"
    >
      {/* ── Step 1: Generate ──────────────────────────── */}
      {step === 'generate' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-xl border border-orange-100">
            <Rocket size={18} className="text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">{change.title}</p>
              <p className="text-xs text-orange-600 mt-0.5">{change.competitors?.name} · {change.change_type.replace('_', ' ')}</p>
              {change.description && <p className="text-xs text-orange-700 mt-1 line-clamp-2">{change.description}</p>}
            </div>
          </div>
          <p className="text-sm text-gray-600">
            AI will analyse this competitor move and generate a tailored counter-campaign
            with headlines, ad copy, social content, and landing page text.
          </p>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
              <X size={14} className="shrink-0 mt-0.5" />{error}
            </div>
          )}
          <Button onClick={generate} disabled={loading} className="w-full">
            {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Generating campaign…</> : <><Zap size={14} className="mr-2" />Generate Counter-Campaign</>}
          </Button>
        </div>
      )}

      {/* ── Step 2: Preview ───────────────────────────── */}
      {step === 'preview' && campaign && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              Counter to: {campaign.competitor_event}
            </span>
          </div>

          <Field label="Headline (Google / Search)" value={campaign.headline} />
          <Field label="Ad Copy" value={campaign.ad_copy} />
          {campaign.offer     && <Field label="Offer" value={campaign.offer} />}
          {campaign.social_copy && <Field label="Social Post (Instagram / Facebook)" value={campaign.social_copy} multiline />}

          {campaign.keywords.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Keywords to target</span>
              <div className="flex flex-wrap gap-1.5">
                {campaign.keywords.map(kw => (
                  <span key={kw} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{kw}</span>
                ))}
              </div>
            </div>
          )}

          {campaign.landing_page_title && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block">Landing Page</span>
              <Field label="Hero Title" value={campaign.landing_page_title} />
              {campaign.landing_page_body && <Field label="Body" value={campaign.landing_page_body} />}
              {campaign.landing_page_cta && (
                <span className="inline-block text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg font-semibold">
                  {campaign.landing_page_cta}
                </span>
              )}
            </div>
          )}

          {/* Channels */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Post to channels</p>
            <div className="flex gap-2 flex-wrap">
              {CHANNELS.map(({ id, label, icon: Icon, color }) => {
                const active = selectedChannels.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleChannel(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={13} className={active ? color : 'text-gray-400'} />
                    {label}
                    {id === 'meta' && metaIntegration && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Connected" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Meta connection status */}
          {metaSelected && !metaIntegration && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-700">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Meta account not connected.{' '}
                <Link to="/settings" className="underline font-medium">Connect in Settings</Link>
                {' '}to launch ads directly, or use the content above to create ads manually.
              </span>
            </div>
          )}

          {/* Landing page URL — required for Meta */}
          {metaSelected && metaIntegration && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Landing page URL <span className="text-gray-400 font-normal">(where Meta will send ad clicks)</span>
              </label>
              <input
                type="url"
                placeholder="https://your-landing-page.com"
                value={landingUrl}
                onChange={e => setLandingUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
              <X size={14} className="shrink-0 mt-0.5" />{error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep('generate')} className="flex-1">Regenerate</Button>
            <Button onClick={postCampaign} disabled={posting} className="flex-1">
              {posting
                ? <><Loader2 size={14} className="animate-spin mr-2" />Posting…</>
                : <><Rocket size={14} className="mr-2" />Post Campaign</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Posted ────────────────────────────── */}
      {step === 'posted' && campaign && (
        <div className="space-y-4 text-center py-2">
          <CheckCircle2 size={48} className="text-green-500 mx-auto" />
          <div>
            <p className="text-lg font-bold text-gray-900">{campaign.campaign_name}</p>
            <p className="text-sm text-gray-500 mt-1">Campaign is now <span className="text-green-600 font-semibold">active</span></p>
          </div>

          {/* Meta success */}
          {metaResult?.meta_campaign_id && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-left">
              <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-2">
                <Globe size={14} />
                Meta campaign created
              </div>
              <p className="text-xs text-blue-600">
                Campaign ID: <code className="font-mono">{metaResult.meta_campaign_id}</code>
              </p>
              <p className="text-xs text-blue-600 mt-1">Status: <span className="font-semibold">PAUSED</span> — review and activate in Meta Ads Manager.</p>
              <a
                href="https://business.facebook.com/adsmanager"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 underline mt-2"
              >
                Open Ads Manager <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* Manual channels */}
          {selectedChannels.some(ch => ch !== 'meta' || !metaIntegration) && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-left">
              <p className="text-xs font-semibold text-gray-600 mb-2">Manual upload</p>
              {selectedChannels.filter(ch => !(ch === 'meta' && metaIntegration)).map(ch => (
                <div key={ch} className="flex items-center gap-2 text-sm text-gray-600 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                  Copy the headline + ad copy above into{' '}
                  {ch === 'google' ? 'Google Ads Manager' : ch === 'meta' ? 'Meta Ads Manager' : 'Instagram'}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose} className="flex-1">Close</Button>
            <Button onClick={() => window.location.href = '/campaigns'} className="flex-1">View All Campaigns</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
