import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Rocket, Loader2, Copy, Check, Zap, Globe, Share2,
  Search, CheckCircle2, ChevronDown, ChevronUp, X,
  ExternalLink, Link2, DollarSign, Layout, Sparkles, Shield,
  Pencil, Save, Plus, RotateCcw,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { invokeFunction, supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useMetaIntegration, useGoogleAdsIntegration, minDailyForCurrency } from '../../hooks/useAdIntegrations'
import { useClients } from '../../hooks/useClients'
import type { Campaign, LandingTemplate } from '../../types/database.types'
import type { DetectedChangeWithCompetitor } from '../../types/database.types'

// ── Template options ──────────────────────────────────────────────────────────

const TEMPLATES: { id: LandingTemplate; label: string; desc: string; accent: string }[] = [
  { id: 'default',        label: 'Default',        desc: 'Dark, bold — works for any industry',  accent: 'bg-slate-700'   },
  { id: 'healthcare',     label: 'Healthcare',      desc: 'Clean blue/white, trust-focused',       accent: 'bg-blue-500'    },
  { id: 'real-estate',    label: 'Real Estate',     desc: 'Warm amber, premium property feel',     accent: 'bg-amber-500'   },
  { id: 'education',      label: 'Education',       desc: 'Purple/violet, academic style',         accent: 'bg-violet-500'  },
  { id: 'local-services', label: 'Local Services',  desc: 'Orange/red, friendly local business',  accent: 'bg-orange-500'  },
]

interface Props {
  change: DetectedChangeWithCompetitor
  open: boolean
  onClose: () => void
  // MVP 2.0 — when launched from an opportunity card, the radar already
  // computed a recommended budget + expected leads. Surfacing them as
  // pre-fill hints makes the "Launch Campaign" flow 1-click instead of
  // "fill in everything from scratch."
  opportunityHint?: {
    title?:              string
    recommended_budget?: number | null
    expected_leads?:     number | null
    estimated_cpc?:      number | null
    estimated_cpl?:      number | null
    confidence?:         number | null
    industry?:           string | null
  }
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

export function CampaignModal({ change, open, onClose, opportunityHint }: Props) {
  const qc = useQueryClient()
  const { metaIntegration }    = useMetaIntegration()
  const { googleIntegration }  = useGoogleAdsIntegration()
  const { data: clients = [] } = useClients()

  const [step, setStep]               = useState<Step>('generate')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [campaign, setCampaign]       = useState<Campaign | null>(null)
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['meta'])
  const [posting, setPosting]         = useState(false)
  const [landingUrl, setLandingUrl]   = useState('')
  const [metaResult, setMetaResult]   = useState<{ meta_campaign_id?: string } | null>(null)
  const [googleResult, setGoogleResult] = useState<{
    google_campaign_id?: string
    mode?: 'self' | 'managed'
    managed_account_id?: string | null
    billing?: { required: boolean; status?: string; url?: string } | null
  } | null>(null)
  // New fields
  const [template, setTemplate]       = useState<LandingTemplate>('default')
  const [dailyBudget, setDailyBudget] = useState('')
  const [clientId, setClientId]       = useState('')
  const [imageUrl, setImageUrl]       = useState('')
  const [insights, setInsights]       = useState<{ competitor_offer?: string; offer_justification?: string } | null>(null)
  // Launch mode per channel: 'self' = user's connected account, 'managed' = DigiPromix runs it via MCC
  const [launchModes, setLaunchModes] = useState<Record<string, 'self' | 'managed'>>({ meta: 'managed', google: 'managed' })
  const [managedBusinessName, setManagedBusinessName] = useState('')

  // ── Inline editor state ───────────────────────────────────────────────────
  const [editing,    setEditing]    = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editSaved,  setEditSaved]  = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  // Local editable copy — seeded from campaign when edit mode opens
  const [draft, setDraft] = useState<{
    headline:            string
    ad_copy:             string
    offer:               string
    social_copy:         string
    keywords:            string[]
    landing_page_title:  string
    landing_page_body:   string
    landing_page_cta:    string
  } | null>(null)

  function openEditor() {
    if (!campaign) return
    setDraft({
      headline:           campaign.headline            ?? '',
      ad_copy:            campaign.ad_copy             ?? '',
      offer:              campaign.offer               ?? '',
      social_copy:        campaign.social_copy         ?? '',
      keywords:           campaign.keywords            ?? [],
      landing_page_title: campaign.landing_page_title ?? '',
      landing_page_body:  campaign.landing_page_body  ?? '',
      landing_page_cta:   campaign.landing_page_cta   ?? '',
    })
    setEditing(true)
    setEditSaved(false)
  }

  function cancelEditor() {
    setEditing(false)
    setDraft(null)
    setNewKeyword('')
  }

  async function saveEdits() {
    if (!campaign || !draft) return
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('campaigns').update({
        headline:            draft.headline,
        ad_copy:             draft.ad_copy,
        offer:               draft.offer    || null,
        social_copy:         draft.social_copy || null,
        keywords:            draft.keywords,
        landing_page_title:  draft.landing_page_title || null,
        landing_page_body:   draft.landing_page_body  || null,
        landing_page_cta:    draft.landing_page_cta   || null,
      }).eq('id', campaign.id)
      if (error) throw error
      // Reflect edits in the live campaign object so the preview updates
      Object.assign(campaign, draft)
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      setEditSaved(true)
      setEditing(false)
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingEdit(false)
    }
  }

  function addKeyword() {
    const kw = newKeyword.trim()
    if (!kw || !draft) return
    if (!draft.keywords.includes(kw)) {
      setDraft({ ...draft, keywords: [...draft.keywords, kw] })
    }
    setNewKeyword('')
  }

  function removeKeyword(kw: string) {
    if (!draft) return
    setDraft({ ...draft, keywords: draft.keywords.filter(k => k !== kw) })
  }

  const handleClose = () => {
    setStep('generate'); setError(null); setCampaign(null); setMetaResult(null); setGoogleResult(null)
    setTemplate('default'); setDailyBudget(''); setClientId(''); setImageUrl(''); setInsights(null)
    setLaunchModes({ meta: 'managed', google: 'managed' }); setManagedBusinessName('')
    onClose()
  }

  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: fnError } = await invokeFunction<{
        campaign: Campaign
        insights?: { competitor_offer?: string; offer_justification?: string; suggested_template?: string }
      }>('generate-campaign', { change_id: change.id })
      if (fnError) throw fnError
      if (!data?.campaign) throw new Error('No campaign returned')
      setCampaign(data.campaign)
      if (data.insights) {
        setInsights({ competitor_offer: data.insights.competitor_offer, offer_justification: data.insights.offer_justification })
        if (data.insights.suggested_template) setTemplate(data.insights.suggested_template as LandingTemplate)
      }
      setStep('preview')
      // Fire predict-budget (non-blocking) — writes predictions back to DB and
      // updates the preview so the user sees estimated leads/CPC before launching.
      invokeFunction<{
        predicted_leads: number; predicted_cpc: number
        predicted_cpl: number; confidence_score: number
      }>('predict-budget', {
        campaign_id: data.campaign.id,
        days: 7,
      }).then(({ data: pred }) => {
        if (pred) {
          setCampaign(prev => prev ? {
            ...prev,
            predicted_leads:  pred.predicted_leads,
            predicted_cpc:    pred.predicted_cpc,
            predicted_cpl:    pred.predicted_cpl,
            confidence_score: pred.confidence_score,
          } : prev)
        }
      }).catch(() => { /* non-fatal — predictions are best-effort */ })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed. Check that GEMINI_API_KEY is configured.')
    } finally { setLoading(false) }
  }

  const toggleChannel = (id: string) =>
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const postCampaign = async () => {
    if (!campaign) return

    // ── Client-side validation before hitting any edge function ──────────
    // A launch happens when channel selected AND (managed mode OR self mode with connected integration)
    const metaWillLaunch =
      selectedChannels.includes('meta') &&
      (launchModes.meta === 'managed' || !!metaIntegration)
    const googleWillLaunch =
      selectedChannels.includes('google') &&
      (launchModes.google === 'managed' || !!googleIntegration)

    if (metaWillLaunch || googleWillLaunch) {
      try {
        const u = new URL(landingUrl.trim())
        if (!['http:', 'https:'].includes(u.protocol) || /example\.com$/i.test(u.hostname)) {
          setError('Landing page URL must be a real https:// URL (not example.com).'); return
        }
      } catch {
        setError('Enter a valid landing page URL before launching.'); return
      }
    }

    if (metaWillLaunch) {
      const currency  = metaIntegration?.currency ?? null
      const minBudget = minDailyForCurrency(currency)
      const n = Number(dailyBudget)
      if (!Number.isFinite(n) || n < minBudget) {
        setError(`Daily budget must be at least ${minBudget} ${currency ?? ''} for your Meta account.`)
        return
      }
    }

    setPosting(true); setError(null)
    try {
      // Determine which mode(s) this campaign is using. If ANY selected channel is
      // managed, mark the whole campaign as managed in the DB so the launch
      // functions take the MCC / agency-Business-Manager code path.
      const anyManaged =
        (selectedChannels.includes('meta')   && launchModes.meta   === 'managed') ||
        (selectedChannels.includes('google') && launchModes.google === 'managed')

      // Save status + channels + template + budget + client + launch mode + publish landing page
      await supabase
        .from('campaigns')
        .update({
          status: 'active',
          channels: selectedChannels,
          landing_page_url: landingUrl || null,
          published: true,
          template,
          daily_budget: dailyBudget ? parseInt(dailyBudget, 10) : null,
          client_id: clientId || null,
          launch_mode: anyManaged ? 'managed' : 'self',
          managed_business_name: anyManaged ? (managedBusinessName || null) : null,
          managed_provision_status: anyManaged ? 'pending' : 'not_required',
        })
        .eq('id', campaign.id)
      qc.invalidateQueries({ queryKey: ['campaigns'] })

      const budgetNum = dailyBudget ? Number(dailyBudget) : undefined

      // Launch to Meta when:
      //   - SELF mode AND user account is connected, OR
      //   - MANAGED mode (the function uses the agency Business Manager + System User)
      if (metaWillLaunch) {
        const { data, error: launchErr } = await invokeFunction<{ meta_campaign_id: string }>(
          'launch-meta-campaign',
          {
            campaign_id:      campaign.id,
            landing_page_url: landingUrl || undefined,
            daily_budget_usd: budgetNum,   // backend treats this as account-currency units
            image_url:        imageUrl.trim() || undefined,
          }
        )
        if (launchErr) throw launchErr
        setMetaResult(data)
      }

      // Launch to Google Ads when:
      //   - SELF mode AND user account is connected, OR
      //   - MANAGED mode (the function provisions an MCC sub-account on demand)
      if (googleWillLaunch) {
        const { data, error: launchErr } = await invokeFunction<{
          google_campaign_id: string
          mode?: 'self' | 'managed'
          managed_account_id?: string | null
          billing?: { required: boolean; status?: string; url?: string } | null
        }>(
          'launch-google-ads-campaign',
          {
            campaign_id:      campaign.id,
            landing_page_url: landingUrl || undefined,
            daily_budget_usd: budgetNum,
          }
        )
        if (launchErr) throw launchErr
        setGoogleResult(data)
      }

      setStep('posted')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Post failed')
    } finally { setPosting(false) }
  }

  const metaSelected = selectedChannels.includes('meta')
  const googleSelected = selectedChannels.includes('google')

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

          {/* MVP 2.0 — pre-fill panel from Opportunity Radar */}
          {opportunityHint && (opportunityHint.recommended_budget != null || opportunityHint.expected_leads != null) && (
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={13} className="text-violet-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">AI Radar prediction</span>
                {opportunityHint.confidence != null && (
                  <span className="ml-auto text-[10px] text-violet-700 font-semibold">
                    {Math.round(opportunityHint.confidence * 100)}% confidence
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {opportunityHint.recommended_budget != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Recommended budget</div>
                    <div className="text-sm font-bold text-gray-900">${opportunityHint.recommended_budget}/wk</div>
                  </div>
                )}
                {opportunityHint.expected_leads != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Expected leads</div>
                    <div className="text-sm font-bold text-gray-900">{opportunityHint.expected_leads}</div>
                  </div>
                )}
                {opportunityHint.estimated_cpc != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Est. CPC</div>
                    <div className="text-sm font-bold text-gray-900">${opportunityHint.estimated_cpc.toFixed(2)}</div>
                  </div>
                )}
                {opportunityHint.estimated_cpl != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Est. CPL</div>
                    <div className="text-sm font-bold text-gray-900">${opportunityHint.estimated_cpl.toFixed(2)}</div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-violet-700 mt-2">
                These are heuristic projections from the AI Opportunity Radar. Actual numbers depend on creative quality + targeting.
              </p>
            </div>
          )}

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

          {/* Budget predictions (arrive shortly after generation via predict-budget) */}
          {(campaign.predicted_leads != null || campaign.predicted_cpc != null) && (
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={12} className="text-violet-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">AI Budget Prediction — 7-day outlook</span>
                {campaign.confidence_score != null && (
                  <span className="ml-auto text-[10px] text-violet-600 font-semibold">
                    {Math.round(campaign.confidence_score * 100)}% confidence
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {campaign.predicted_leads != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Est. leads</div>
                    <div className="text-sm font-bold text-gray-900">{campaign.predicted_leads}</div>
                  </div>
                )}
                {campaign.predicted_cpc != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Est. CPC</div>
                    <div className="text-sm font-bold text-gray-900">${campaign.predicted_cpc.toFixed(2)}</div>
                  </div>
                )}
                {campaign.predicted_cpl != null && (
                  <div className="bg-white/70 rounded-lg p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Cost/lead</div>
                    <div className="text-sm font-bold text-gray-900">${campaign.predicted_cpl.toFixed(2)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI insights */}
          {insights && (insights.competitor_offer || insights.offer_justification) && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1.5">
              {insights.competitor_offer && (
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Their offer:</span> {insights.competitor_offer}
                </p>
              )}
              {insights.offer_justification && (
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Why you win:</span> {insights.offer_justification}
                </p>
              )}
            </div>
          )}

          {/* ── Edit / Save toolbar ─────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400">Review your AI-generated content before launching</p>
            <div className="flex items-center gap-2 shrink-0">
              {editSaved && !editing && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check size={11} /> Saved
                </span>
              )}
              {editing ? (
                <>
                  <button
                    onClick={cancelEditor}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    <RotateCcw size={11} /> Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={savingEdit}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingEdit ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    {savingEdit ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              ) : (
                <button
                  onClick={openEditor}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
            </div>
          </div>

          {/* ── Ad content (view or edit) ────────────────────────────────── */}
          {editing && draft ? (
            <div className="space-y-3 border border-blue-200 bg-blue-50/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Pencil size={11} /> Editing — changes save to DB and update your live landing page
              </p>

              {/* Headline */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center justify-between mb-1">
                  Headline (Google Search — max 30 chars)
                  <span className={`font-mono ${draft.headline.length > 30 ? 'text-red-500' : 'text-gray-300'}`}>
                    {draft.headline.length}/30
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={draft.headline}
                  onChange={e => setDraft({ ...draft, headline: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {draft.headline.length > 30 && (
                  <p className="text-[10px] text-orange-600 mt-0.5">Google Ads truncates headlines at 30 chars — first 30 will be used</p>
                )}
              </div>

              {/* Ad Copy */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center justify-between mb-1">
                  Ad Copy
                  <span className="font-mono text-gray-300">{draft.ad_copy.length} chars</span>
                </label>
                <textarea
                  rows={3}
                  value={draft.ad_copy}
                  onChange={e => setDraft({ ...draft, ad_copy: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Offer */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Offer</label>
                <input
                  type="text"
                  value={draft.offer}
                  onChange={e => setDraft({ ...draft, offer: e.target.value })}
                  placeholder="e.g. 20% off this week only"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Social Copy */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
                  Social Post (Instagram / Facebook)
                </label>
                <textarea
                  rows={3}
                  value={draft.social_copy}
                  onChange={e => setDraft({ ...draft, social_copy: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Keywords */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
                  Keywords to target
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {draft.keywords.map(kw => (
                    <span key={kw} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="hover:text-red-600 ml-0.5">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={e => setNewKeyword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                    placeholder="Add keyword…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addKeyword}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>
              </div>

              {/* Landing Page */}
              <div className="space-y-2 border-t border-blue-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Landing Page</p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Hero Title</label>
                  <input
                    type="text"
                    value={draft.landing_page_title}
                    onChange={e => setDraft({ ...draft, landing_page_title: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Body Text</label>
                  <textarea
                    rows={3}
                    value={draft.landing_page_body}
                    onChange={e => setDraft({ ...draft, landing_page_body: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">CTA Button Text</label>
                  <input
                    type="text"
                    value={draft.landing_page_cta}
                    onChange={e => setDraft({ ...draft, landing_page_cta: e.target.value })}
                    placeholder="e.g. Get My Free Quote"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Headline (Google / Search)" value={campaign.headline} />
              <Field label="Ad Copy" value={campaign.ad_copy} />
              {campaign.offer && <Field label="Offer" value={campaign.offer} />}
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
            </div>
          )}

          {/* Landing page template */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Layout size={11} /> Landing page template
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATES.map(({ id, label, desc, accent }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTemplate(id)}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                    template === id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${accent}`} />
                  <div>
                    <p className={`text-xs font-semibold ${template === id ? 'text-blue-700' : 'text-gray-700'}`}>{label}</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Client assignment */}
          {clients.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Assign to client <span className="font-normal normal-case">(optional)</span></p>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Daily budget — currency-aware when Meta is connected */}
          {(() => {
            const currency = metaIntegration?.currency ?? null
            const minBudget = minDailyForCurrency(currency)
            const recommended = Math.max(minBudget * 5, 5)
            const isRequired = selectedChannels.includes('meta') && !!metaIntegration
            return (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <DollarSign size={11} /> Daily budget {isRequired
                    ? <span className="text-red-500 font-normal normal-case">(required for Meta launch)</span>
                    : <span className="font-normal normal-case">(optional)</span>}
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-mono">
                    {currency ?? '$'}
                  </span>
                  <input
                    type="number"
                    min={minBudget}
                    step={minBudget < 1 ? '0.1' : '1'}
                    value={dailyBudget}
                    onChange={e => setDailyBudget(e.target.value)}
                    placeholder={String(recommended)}
                    className={`w-full pl-12 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isRequired && dailyBudget && Number(dailyBudget) < minBudget
                        ? 'border-red-300 bg-red-50/40'
                        : 'border-gray-200'
                    }`}
                  />
                </div>
                {currency ? (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Your Meta account currency is <span className="font-semibold">{currency}</span>.
                    Meta requires at least <span className="font-semibold">{minBudget} {currency}/day</span>.
                    Recommended start: <span className="font-semibold">{recommended} {currency}/day</span>.
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-1">Saved for your records — doesn't auto-charge your ad accounts.</p>
                )}
                {isRequired && dailyBudget && Number(dailyBudget) < minBudget && (
                  <p className="text-[10px] text-red-600 mt-1 font-medium">
                    Below the {currency} minimum — Meta will reject this launch.
                  </p>
                )}
              </div>
            )
          })()}

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
                    {id === 'google' && googleIntegration && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Connected" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Launch Mode chooser (per channel) ──────────────────────────
              Implements the "Connect or Let DigiPromix Run For You" UX flow.
              Removes the friction of forcing users to set up Google/Meta ad accounts. */}
          {(metaSelected || googleSelected) && (
            <div className="space-y-3">
              {metaSelected && (
                <LaunchModeChooser
                  platform="Meta"
                  connected={!!metaIntegration}
                  mode={launchModes.meta ?? 'managed'}
                  onChange={mode => setLaunchModes(prev => ({ ...prev, meta: mode }))}
                />
              )}
              {googleSelected && (
                <LaunchModeChooser
                  platform="Google Ads"
                  connected={!!googleIntegration}
                  mode={launchModes.google ?? 'managed'}
                  onChange={mode => setLaunchModes(prev => ({ ...prev, google: mode }))}
                />
              )}
            </div>
          )}

          {/* Managed-mode quick details (business name needed for MCC sub-account) */}
          {((metaSelected && launchModes.meta === 'managed') || (googleSelected && launchModes.google === 'managed')) && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                <Sparkles size={12} /> Done-for-you details
              </div>
              <input
                type="text"
                placeholder="Your business name (used to create the managed ad account)"
                value={managedBusinessName}
                onChange={e => setManagedBusinessName(e.target.value)}
                className="w-full bg-white border border-violet-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <p className="text-[11px] text-violet-600 leading-relaxed">
                Our team will provision a sub-account under our agency Manager (MCC) and launch your campaign within 24 hours.
                Billing stays in your name — we'll send you a one-time setup link when ready.
              </p>
            </div>
          )}

          {/* Landing page URL — required for any launch (self or managed) */}
          {(
            (metaSelected   && (launchModes.meta   === 'managed' || metaIntegration)) ||
            (googleSelected && (launchModes.google === 'managed' || googleIntegration))
          ) && (() => {
            const isValid = (() => {
              if (!landingUrl.trim()) return false
              try {
                const u = new URL(landingUrl.trim())
                return (u.protocol === 'https:' || u.protocol === 'http:') && !/example\.com$/i.test(u.hostname)
              } catch { return false }
            })()
            const showError = landingUrl.length > 0 && !isValid
            return (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Landing page URL <span className="text-red-500 font-normal">(required)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://your-landing-page.com"
                  value={landingUrl}
                  onChange={e => setLandingUrl(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    showError ? 'border-red-300 bg-red-50/40' : 'border-gray-200'
                  }`}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {campaign?.slug && (
                    <>Tip: use your hosted landing page —{' '}
                    <button
                      type="button"
                      className="text-blue-600 underline"
                      onClick={() => setLandingUrl(`${window.location.origin}/lp/${campaign.slug}`)}
                    >
                      use this campaign's /lp/{campaign.slug}
                    </button>
                    </>
                  )}
                </p>
                {showError && (
                  <p className="text-[10px] text-red-600 mt-1 font-medium">
                    Enter a valid https:// URL (not example.com).
                  </p>
                )}
              </div>
            )
          })()}

          {/* Ad image URL — Meta (no SVG); supports both self + managed mode */}
          {metaSelected && (launchModes.meta === 'managed' || metaIntegration) && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Ad image URL <span className="text-gray-400 font-normal">(optional — Meta will auto-scrape og:image if blank)</span>
              </label>
              <input
                type="url"
                placeholder="https://your-site.com/og-image.png"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Must be a public PNG / JPG (not SVG), at least 600×600px. 1200×630 recommended.
              </p>
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

          {/* Landing page URL */}
          {campaign.slug && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-left">
              <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm mb-2">
                <Link2 size={14} />
                Landing page is live
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-indigo-600 bg-white border border-indigo-100 rounded px-2 py-1 flex-1 truncate">
                  {window.location.origin}/lp/{campaign.slug}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/lp/${campaign.slug}`)}
                  className="shrink-0 p-1.5 rounded text-indigo-500 hover:bg-indigo-100"
                  title="Copy link"
                >
                  <Copy size={13} />
                </button>
                <a
                  href={`/lp/${campaign.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 p-1.5 rounded text-indigo-500 hover:bg-indigo-100"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
              <p className="text-xs text-indigo-500 mt-1.5">Share this link — leads who fill the form appear in your Leads page.</p>
            </div>
          )}

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
              <p className="text-xs text-green-600 mt-1">Status: <span className="font-semibold">ACTIVE</span> — running now. Pause or delete anytime from Campaigns.</p>
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

          {/* Google Ads success */}
          {googleResult?.google_campaign_id && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-left">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
                <Search size={14} />
                Google Ads campaign created
              </div>
              <p className="text-xs text-red-600">
                Campaign ID: <code className="font-mono">{googleResult.google_campaign_id}</code>
              </p>
              <p className="text-xs text-green-600 mt-1">Status: <span className="font-semibold">ENABLED</span> — running now. Pause or delete anytime from Campaigns.</p>
              <a
                href="https://ads.google.com/aw/campaigns"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-red-600 underline mt-2"
              >
                Open Google Ads <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* Billing setup CTA — managed mode only */}
          {googleResult?.mode === 'managed' && googleResult.billing?.required && googleResult.billing.url && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-left">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-1.5">
                <DollarSign size={16} className="text-amber-600" /> Action required: Add billing to activate ads
              </div>
              <p className="text-xs text-amber-800 leading-relaxed mb-3">
                Your DigiPromix-managed Google Ads sub-account is provisioned (ID:{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">{googleResult.managed_account_id}</code>).
                The campaign is sitting in PAUSED state. Add a payment method to start serving ads — usually takes 2 minutes.
              </p>
              <a
                href={googleResult.billing.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Open Google Ads billing setup <ExternalLink size={11} />
              </a>
              <p className="text-[10px] text-amber-700 mt-2">
                Status: <span className="font-semibold uppercase">{googleResult.billing.status ?? 'pending'}</span> · Billing is paid by you directly — DigiPromix never touches your card.
              </p>
            </div>
          )}

          {/* DigiPromix-managed channels */}
          {selectedChannels.some(ch => (ch === 'meta' && launchModes.meta === 'managed') || (ch === 'google' && launchModes.google === 'managed')) && (
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-4 text-left">
              <div className="flex items-center gap-1.5 text-violet-700 font-semibold text-sm mb-2">
                <Sparkles size={14} /> Done-for-you queue
              </div>
              <p className="text-xs text-violet-700 leading-relaxed">
                Our team will set up the managed ad account and launch your campaign on{' '}
                {selectedChannels.filter(ch => (ch === 'meta' && launchModes.meta === 'managed') || (ch === 'google' && launchModes.google === 'managed')).map(ch => ch === 'meta' ? 'Meta' : 'Google').join(' + ')} within 24 hours.
                You'll get a confirmation email once it's live.
              </p>
            </div>
          )}

          {/* Manual channels (instagram-only or other channels not auto-launched) */}
          {selectedChannels.some(ch => ch === 'instagram') && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-left">
              <p className="text-xs font-semibold text-gray-600 mb-2">Manual upload</p>
              <div className="flex items-center gap-2 text-sm text-gray-600 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                Copy the headline + ad copy above into Instagram
              </div>
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

// ── Launch Mode Chooser ──────────────────────────────────────────────────────
// Implements the "Connect or Let Us Run" hybrid UX from the MVP spec.
// Removes onboarding friction by offering a done-for-you managed option
// (DigiPromix runs the ad via MCC) alongside the standard self-connect flow.

function LaunchModeChooser({
  platform,
  connected,
  mode,
  onChange,
}: {
  platform: 'Meta' | 'Google Ads'
  connected: boolean
  mode: 'self' | 'managed'
  onChange: (mode: 'self' | 'managed') => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-600">How should we launch on <span className="text-gray-900">{platform}</span>?</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        {/* OPTION A — Connect your own account */}
        <button
          type="button"
          onClick={() => onChange('self')}
          className={`flex items-start gap-2.5 p-3 text-left transition-colors ${
            mode === 'self' ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
          }`}
        >
          <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
            mode === 'self' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
          }`}>
            {mode === 'self' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`text-sm font-semibold ${mode === 'self' ? 'text-blue-700' : 'text-gray-800'}`}>
                Connect my account
              </p>
              {connected && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-green-500" /> Connected
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
              {connected
                ? "Your account is linked — we'll launch directly."
                : <>You'll need to <Link to="/settings" className="text-blue-600 underline">connect in Settings</Link> first.</>}
            </p>
          </div>
        </button>

        {/* OPTION B — Let DigiPromix run it (Recommended) */}
        <button
          type="button"
          onClick={() => onChange('managed')}
          className={`relative flex items-start gap-2.5 p-3 text-left transition-colors ${
            mode === 'managed' ? 'bg-violet-50' : 'bg-white hover:bg-gray-50'
          }`}
        >
          <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-1.5 py-0.5 rounded">
            ⭐ Recommended
          </span>
          <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
            mode === 'managed' ? 'border-violet-500 bg-violet-500' : 'border-gray-300'
          }`}>
            {mode === 'managed' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles size={11} className={mode === 'managed' ? 'text-violet-600' : 'text-gray-400'} />
              <p className={`text-sm font-semibold ${mode === 'managed' ? 'text-violet-700' : 'text-gray-800'}`}>
                Let DigiPromix run it
              </p>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug mt-0.5 flex items-center gap-1">
              <Shield size={9} className="text-violet-400 shrink-0" />
              No ad account needed — we'll launch within 24h
            </p>
          </div>
        </button>
      </div>
    </div>
  )
}
