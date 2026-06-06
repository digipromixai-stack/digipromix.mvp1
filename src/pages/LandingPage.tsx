/**
 * Public landing page — /lp/:slug
 * Premium, conversion-optimised design with 5 industry templates.
 * Layout: two-column (hero left · sticky form right) on desktop, stacked on mobile.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, CheckCircle2, AlertTriangle, Zap, Heart, Home,
  GraduationCap, Wrench, Shield, Lock, Clock, ArrowRight,
  User, Mail, Phone, MessageSquare, Star, Gift,
} from 'lucide-react'
import { supabase, invokeFunction } from '../lib/supabase'
import type { Campaign, LandingTemplate } from '../types/database.types'

type PageState = 'loading' | 'ready' | 'submitting' | 'success' | 'not_found'

// ── Per-template visual config ─────────────────────────────────────────────────
interface Theme {
  page:         string
  glow1:        string
  glow2:        string
  headline:     string
  body:         string
  badgeBg:      string
  badgeBorder:  string
  badgeText:    string
  offerGrad:    string
  bulletDot:    string
  cardBg:       string
  cardBorder:   string
  cardShadow:   string
  cardTitle:    string
  cardSub:      string
  divider:      string
  label:        string
  inputBg:      string
  inputBorder:  string
  inputFocus:   string
  inputText:    string
  inputPh:      string
  iconColor:    string
  btn:          string
  btnShadow:    string
  trustText:    string
  trustBg:      string
  trustBorder:  string
  avatarBorder: string
  Icon:         React.ElementType
  iconAccent:   string
  urgencyBg:    string
  urgencyBorder:string
  urgencyIcon:  string
  urgencyText:  string
}

const THEMES: Record<LandingTemplate, Theme> = {
  'default': {
    page:         'bg-[#030914]',
    glow1:        'absolute -top-40 -right-40 w-[700px] h-[700px] bg-blue-600/20 rounded-full blur-[130px] pointer-events-none',
    glow2:        'absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-purple-700/15 rounded-full blur-[110px] pointer-events-none',
    headline:     'text-white',
    body:         'text-slate-400',
    badgeBg:      'bg-blue-500/10',
    badgeBorder:  'border-blue-500/20',
    badgeText:    'text-blue-300',
    offerGrad:    'from-blue-500 via-indigo-500 to-purple-600',
    bulletDot:    'bg-blue-500',
    cardBg:       'bg-white/[0.04] backdrop-blur-2xl',
    cardBorder:   'border-white/10',
    cardShadow:   'shadow-2xl',
    cardTitle:    'text-white',
    cardSub:      'text-slate-400',
    divider:      'border-white/8',
    label:        'text-slate-400',
    inputBg:      'bg-white/5',
    inputBorder:  'border-white/10',
    inputFocus:   'focus:border-blue-500 focus:ring-blue-500/10',
    inputText:    'text-white',
    inputPh:      'placeholder-slate-600',
    iconColor:    'text-slate-600',
    btn:          'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500',
    btnShadow:    'shadow-blue-500/30',
    trustText:    'text-slate-600',
    trustBg:      'bg-white/5',
    trustBorder:  'border-white/8',
    avatarBorder: 'border-[#030914]',
    Icon:         Zap,
    iconAccent:   'text-blue-400',
    urgencyBg:    'bg-red-500/10',
    urgencyBorder:'border-red-500/20',
    urgencyIcon:  'text-red-400',
    urgencyText:  'text-red-300',
  },
  'healthcare': {
    page:         'bg-gradient-to-br from-sky-50 via-white to-blue-50',
    glow1:        'absolute -top-40 -right-40 w-[700px] h-[700px] bg-blue-200/60 rounded-full blur-[130px] pointer-events-none',
    glow2:        'absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-cyan-200/50 rounded-full blur-[110px] pointer-events-none',
    headline:     'text-blue-950',
    body:         'text-blue-700/70',
    badgeBg:      'bg-blue-50',
    badgeBorder:  'border-blue-200',
    badgeText:    'text-blue-600',
    offerGrad:    'from-blue-500 to-cyan-500',
    bulletDot:    'bg-blue-500',
    cardBg:       'bg-white',
    cardBorder:   'border-blue-100',
    cardShadow:   'shadow-2xl shadow-blue-100',
    cardTitle:    'text-blue-950',
    cardSub:      'text-blue-400',
    divider:      'border-blue-100',
    label:        'text-blue-700',
    inputBg:      'bg-blue-50/70',
    inputBorder:  'border-blue-200',
    inputFocus:   'focus:border-blue-500 focus:ring-blue-500/10',
    inputText:    'text-blue-950',
    inputPh:      'placeholder-blue-300',
    iconColor:    'text-blue-300',
    btn:          'from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400',
    btnShadow:    'shadow-blue-300/50',
    trustText:    'text-blue-400',
    trustBg:      'bg-blue-50',
    trustBorder:  'border-blue-100',
    avatarBorder: 'border-white',
    Icon:         Heart,
    iconAccent:   'text-blue-500',
    urgencyBg:    'bg-red-50',
    urgencyBorder:'border-red-200',
    urgencyIcon:  'text-red-500',
    urgencyText:  'text-red-700',
  },
  'real-estate': {
    page:         'bg-gradient-to-br from-amber-50 via-white to-orange-50',
    glow1:        'absolute -top-40 -right-40 w-[700px] h-[700px] bg-amber-200/60 rounded-full blur-[130px] pointer-events-none',
    glow2:        'absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-orange-200/50 rounded-full blur-[110px] pointer-events-none',
    headline:     'text-stone-900',
    body:         'text-stone-500',
    badgeBg:      'bg-amber-50',
    badgeBorder:  'border-amber-200',
    badgeText:    'text-amber-700',
    offerGrad:    'from-amber-500 to-orange-500',
    bulletDot:    'bg-amber-500',
    cardBg:       'bg-white',
    cardBorder:   'border-amber-100',
    cardShadow:   'shadow-2xl shadow-amber-100',
    cardTitle:    'text-stone-900',
    cardSub:      'text-stone-400',
    divider:      'border-amber-100',
    label:        'text-stone-600',
    inputBg:      'bg-amber-50/70',
    inputBorder:  'border-amber-200',
    inputFocus:   'focus:border-amber-500 focus:ring-amber-500/10',
    inputText:    'text-stone-900',
    inputPh:      'placeholder-amber-300',
    iconColor:    'text-amber-300',
    btn:          'from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400',
    btnShadow:    'shadow-amber-300/50',
    trustText:    'text-stone-400',
    trustBg:      'bg-amber-50',
    trustBorder:  'border-amber-100',
    avatarBorder: 'border-white',
    Icon:         Home,
    iconAccent:   'text-amber-500',
    urgencyBg:    'bg-red-50',
    urgencyBorder:'border-red-200',
    urgencyIcon:  'text-red-500',
    urgencyText:  'text-red-700',
  },
  'education': {
    page:         'bg-gradient-to-br from-violet-50 via-white to-purple-50',
    glow1:        'absolute -top-40 -right-40 w-[700px] h-[700px] bg-violet-200/60 rounded-full blur-[130px] pointer-events-none',
    glow2:        'absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-purple-200/50 rounded-full blur-[110px] pointer-events-none',
    headline:     'text-violet-950',
    body:         'text-violet-600/80',
    badgeBg:      'bg-violet-50',
    badgeBorder:  'border-violet-200',
    badgeText:    'text-violet-600',
    offerGrad:    'from-violet-500 to-purple-600',
    bulletDot:    'bg-violet-500',
    cardBg:       'bg-white',
    cardBorder:   'border-violet-100',
    cardShadow:   'shadow-2xl shadow-violet-100',
    cardTitle:    'text-violet-950',
    cardSub:      'text-violet-400',
    divider:      'border-violet-100',
    label:        'text-violet-700',
    inputBg:      'bg-violet-50/70',
    inputBorder:  'border-violet-200',
    inputFocus:   'focus:border-violet-500 focus:ring-violet-500/10',
    inputText:    'text-violet-950',
    inputPh:      'placeholder-violet-300',
    iconColor:    'text-violet-300',
    btn:          'from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500',
    btnShadow:    'shadow-violet-300/50',
    trustText:    'text-violet-400',
    trustBg:      'bg-violet-50',
    trustBorder:  'border-violet-100',
    avatarBorder: 'border-white',
    Icon:         GraduationCap,
    iconAccent:   'text-violet-500',
    urgencyBg:    'bg-red-50',
    urgencyBorder:'border-red-200',
    urgencyIcon:  'text-red-500',
    urgencyText:  'text-red-700',
  },
  'local-services': {
    page:         'bg-gradient-to-br from-orange-50 via-white to-red-50',
    glow1:        'absolute -top-40 -right-40 w-[700px] h-[700px] bg-orange-200/60 rounded-full blur-[130px] pointer-events-none',
    glow2:        'absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-red-200/50 rounded-full blur-[110px] pointer-events-none',
    headline:     'text-gray-900',
    body:         'text-gray-500',
    badgeBg:      'bg-orange-50',
    badgeBorder:  'border-orange-200',
    badgeText:    'text-orange-700',
    offerGrad:    'from-orange-500 to-red-500',
    bulletDot:    'bg-orange-500',
    cardBg:       'bg-white',
    cardBorder:   'border-orange-100',
    cardShadow:   'shadow-2xl shadow-orange-100',
    cardTitle:    'text-gray-900',
    cardSub:      'text-gray-400',
    divider:      'border-orange-100',
    label:        'text-gray-600',
    inputBg:      'bg-orange-50/70',
    inputBorder:  'border-orange-200',
    inputFocus:   'focus:border-orange-500 focus:ring-orange-500/10',
    inputText:    'text-gray-900',
    inputPh:      'placeholder-orange-300',
    iconColor:    'text-orange-300',
    btn:          'from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400',
    btnShadow:    'shadow-orange-300/50',
    trustText:    'text-gray-400',
    trustBg:      'bg-orange-50',
    trustBorder:  'border-orange-100',
    avatarBorder: 'border-white',
    Icon:         Wrench,
    iconAccent:   'text-orange-500',
    urgencyBg:    'bg-red-50',
    urgencyBorder:'border-red-200',
    urgencyIcon:  'text-red-500',
    urgencyText:  'text-red-700',
  },
}

// Template-specific default benefit bullets (shown when no keywords available)
const TEMPLATE_BENEFITS: Record<LandingTemplate, string[]> = {
  'default':        ['No long-term contracts required', 'Results delivered within 48 hours', 'Dedicated account manager included'],
  'healthcare':     ['HIPAA-compliant secure process', 'Same-day appointments available', 'All major insurance plans accepted'],
  'real-estate':    ['Free property valuation included', 'Expert local market knowledge', 'Zero upfront fees or hidden costs'],
  'education':      ['Flexible learning schedule options', 'Certified expert instructors', 'Free trial session available'],
  'local-services': ['Same-day service appointments', 'Fully licensed and insured team', 'Free on-site estimate included'],
}

// ── Template testimonials ─────────────────────────────────────────────────────
const TEMPLATE_TESTIMONIALS: Record<LandingTemplate, Array<{ name: string; quote: string; initial: string }>> = {
  'default':        [
    { initial: 'S', name: 'Sarah M.',   quote: 'Doubled our leads in 2 weeks. Incredible results!' },
    { initial: 'J', name: 'James K.',   quote: 'Best ROI we\'ve ever seen from any marketing tool.' },
    { initial: 'R', name: 'Riya P.',    quote: 'Setup was instant. The team was super responsive.' },
  ],
  'healthcare':     [
    { initial: 'A', name: 'Anita D.',   quote: 'Got 3 new patients in the first week. Highly recommend.' },
    { initial: 'M', name: 'Michael T.', quote: 'Easy booking process and professional staff. 5 stars.' },
    { initial: 'P', name: 'Priya S.',   quote: 'Same-day appointment was a lifesaver. Thank you!' },
  ],
  'real-estate':    [
    { initial: 'K', name: 'Karan R.',   quote: 'Sold my property 40% faster than expected. Amazing service.' },
    { initial: 'L', name: 'Laura B.',   quote: 'Free valuation saved me thousands. Couldn\'t be happier.' },
    { initial: 'D', name: 'David N.',   quote: 'Expert guidance throughout the whole process. Top notch.' },
  ],
  'education':      [
    { initial: 'T', name: 'Tanya G.',   quote: 'Passed my certification exam on the first try. Thank you!' },
    { initial: 'O', name: 'Omar F.',    quote: 'Flexible schedule made it possible to learn while working.' },
    { initial: 'H', name: 'Hannah L.',  quote: 'The free trial convinced me immediately. Worth every penny.' },
  ],
  'local-services': [
    { initial: 'V', name: 'Vikram S.',  quote: 'Same-day service, fair price, and zero hassle. Perfect.' },
    { initial: 'C', name: 'Claire W.',  quote: 'Team was on time and professional from start to finish.' },
    { initial: 'N', name: 'Nadia E.',   quote: 'Free estimate was accurate. No hidden surprises at all.' },
  ],
}

// ── Engagement tracker ────────────────────────────────────────────────────────
// MVP 2.0 Lead Intent Scoring inputs. Captured passively on the landing page
// and sent with the lead submission so the backend can classify HOT/MEDIUM/LOW.
function useEngagementSignals() {
  const startRef = useRef<number>(Date.now())
  const scrollRef = useRef<number>(0)
  const clickRef  = useRef<number>(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = Math.max(1, doc.scrollHeight - doc.clientHeight)
      const pct = Math.round((doc.scrollTop / max) * 100)
      if (pct > scrollRef.current) scrollRef.current = Math.min(100, pct)
    }
    const onClick = () => { clickRef.current += 1 }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('click', onClick)
    }
  }, [])

  // Snapshot accessor — called at submit time
  return useCallback(() => ({
    time_on_page_seconds: Math.round((Date.now() - startRef.current) / 1000),
    scroll_depth_pct:     scrollRef.current,
    click_count:          clickRef.current,
  }), [])
}

// Detect returning visitors via localStorage — a revisit signals higher intent.
// Key is per-slug so different campaigns don't interfere.
function useReturnVisitor(slug: string | undefined): boolean {
  const [isReturning, setIsReturning] = useState(false)
  useEffect(() => {
    if (!slug) return
    const key = `dp_v_${slug}`
    const prev = localStorage.getItem(key)
    if (prev) setIsReturning(true)
    localStorage.setItem(key, String(Date.now()))
  }, [slug])
  return isReturning
}

// Read UTM and referrer once on mount
function useAttribution() {
  const [attribution] = useState(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    return {
      utm_source:   params.get('utm_source')   ?? null,
      utm_medium:   params.get('utm_medium')   ?? null,
      utm_campaign: params.get('utm_campaign') ?? null,
      utm_content:  params.get('utm_content')  ?? null,
      utm_term:     params.get('utm_term')     ?? null,
      referrer:     typeof document !== 'undefined' && document.referrer ? document.referrer : null,
    }
  })
  return attribution
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function LandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [state,     setState]     = useState<PageState>('loading')
  const [campaign,  setCampaign]  = useState<Campaign | null>(null)
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [message,   setMessage]   = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const getEngagement  = useEngagementSignals()
  const attribution    = useAttribution()
  const isReturning    = useReturnVisitor(slug)

  useEffect(() => {
    if (!slug) { setState('not_found'); return }
    supabase
      .from('campaigns').select('*').eq('slug', slug).eq('published', true).single()
      .then(({ data, error }) => {
        if (error || !data) { setState('not_found'); return }
        setCampaign(data as Campaign)
        setState('ready')
        // Track page view — non-blocking, best-effort
        supabase.rpc('increment_campaign_views_count', { campaign_id_param: data.id })
          .then(() => {}) // fire-and-forget
      })
  }, [slug])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() && !email.trim() && !phone.trim()) {
      setFormError('Please fill in at least your name, email or phone.')
      return
    }
    setFormError(null)
    setState('submitting')
    const engagement = getEngagement()
    const { error } = await invokeFunction('submit-lead', {
      slug,
      name:                 name.trim()    || null,
      email:                email.trim()   || null,
      phone:                phone.trim()   || null,
      message:              message.trim() || null,
      is_returning_visitor: isReturning,
      ...engagement,
      ...attribution,
    })
    if (error) { setFormError('Something went wrong. Please try again.'); setState('ready'); return }
    setState('success')
  }

  const tpl     = (campaign?.template as LandingTemplate) ?? 'default'
  const t       = THEMES[tpl] ?? THEMES['default']
  const { Icon } = t
  const cta     = campaign?.landing_page_cta ?? 'Get My Free Offer'

  // Derive 3 benefit bullets from keywords, or fall back to template defaults
  const benefits = (() => {
    const kws = (campaign?.keywords as string[] | null) ?? []
    if (kws.length >= 2) return kws.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1))
    return TEMPLATE_BENEFITS[tpl] ?? TEMPLATE_BENEFITS['default']
  })()

  const inputBase = `w-full ${t.inputBg} border ${t.inputBorder} ${t.inputFocus} rounded-xl px-4 py-3 pl-9 text-sm ${t.inputText} ${t.inputPh} focus:outline-none focus:ring-2 transition-colors duration-150`

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${THEMES['default'].page}`}>
        <Loader2 size={36} className="text-blue-400 animate-spin" />
      </div>
    )
  }

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (state === 'not_found') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${THEMES['default'].page} px-6`}>
        <div className="text-center space-y-3">
          <AlertTriangle size={48} className="text-yellow-400 mx-auto" />
          <p className="text-white font-bold text-xl">Page not found</p>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            This offer is no longer active or the link may be incorrect.
          </p>
        </div>
      </div>
    )
  }

  // ── Page ──────────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${t.page} relative overflow-hidden`}>
      {/* Decorative glow blobs */}
      <div className={t.glow1} />
      <div className={t.glow2} />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── Header ── */}
        <header className={`border-b ${t.divider} px-6 py-4`}>
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-xl ${t.badgeBg} border ${t.badgeBorder} flex items-center justify-center`}>
                <Icon size={13} className={t.iconAccent} />
              </div>
              <span className={`text-xs font-semibold ${t.badgeText} truncate max-w-[180px] sm:max-w-xs`}>
                {campaign?.campaign_name ?? 'Special Offer'}
              </span>
            </div>
            <div className={`hidden sm:flex items-center gap-1.5 text-xs ${t.trustText}`}>
              <Lock size={10} />
              <span>Secure & Private</span>
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 lg:py-20">
          <div className="grid lg:grid-cols-[1fr_420px] gap-12 lg:gap-16 items-start">

            {/* ───── Left: Hero content ───── */}
            <div>

              {/* Badge */}
              <div className={`inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border ${t.badgeBg} ${t.badgeBorder}`}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className={`text-xs font-semibold tracking-wide ${t.badgeText}`}>
                  Limited Time Offer
                </span>
              </div>

              {/* Headline */}
              <h1 className={`text-4xl sm:text-5xl lg:text-[56px] font-black tracking-tight leading-[1.05] mb-6 ${t.headline}`}>
                {campaign?.landing_page_title ?? campaign?.headline ?? 'An Exclusive Offer Just for You'}
              </h1>

              {/* Body text */}
              {(campaign?.landing_page_body || campaign?.ad_copy) && (
                <p className={`text-lg leading-relaxed mb-8 max-w-xl ${t.body}`}>
                  {campaign?.landing_page_body ?? campaign?.ad_copy}
                </p>
              )}

              {/* Offer pill */}
              {campaign?.offer && (
                <div className={`inline-flex items-center gap-2.5 bg-gradient-to-r ${t.offerGrad} text-white font-bold px-6 py-3.5 rounded-2xl shadow-lg mb-4 text-sm`}>
                  <span className="text-lg">🎯</span>
                  {campaign.offer}
                </div>
              )}

              {/* Urgency scarcity block */}
              <div className={`flex items-center gap-2 mb-6 px-4 py-3 rounded-xl border ${t.urgencyBg} ${t.urgencyBorder}`}>
                <Clock size={14} className={`${t.urgencyIcon} shrink-0`} />
                <span className={`text-sm font-semibold ${t.urgencyText}`}>Limited availability — offer expires soon</span>
              </div>

              {/* Benefit bullets */}
              <div className="space-y-3.5 mb-8">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full ${t.bulletDot} flex items-center justify-center shrink-0`}>
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className={`text-sm font-medium ${t.body}`}>{b}</span>
                  </div>
                ))}
              </div>

              {/* Testimonials strip */}
              <div className="flex gap-3 mb-8 overflow-x-auto pb-1 -mx-1 px-1">
                {TEMPLATE_TESTIMONIALS[tpl].map((t_item, i) => (
                  <div key={i} className={`flex-shrink-0 w-48 rounded-2xl p-3 border ${t.trustBg} ${t.trustBorder}`}>
                    <div className="flex gap-0.5 mb-1.5">
                      {[...Array(5)].map((_, s) => (
                        <Star key={s} size={10} className="text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className={`text-xs leading-snug mb-2 ${t.body}`}>"{t_item.quote}"</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-5 h-5 rounded-full ${t.bulletDot} flex items-center justify-center text-[9px] font-bold text-white`}>
                        {t_item.initial}
                      </div>
                      <span className={`text-[10px] font-medium ${t.body}`}>{t_item.name}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Social proof */}
              <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-2xl ${t.trustBg} border ${t.trustBorder}`}>
                {/* Avatar stack */}
                <div className="flex -space-x-2 shrink-0">
                  {['bg-blue-400','bg-emerald-400','bg-purple-400','bg-rose-400'].map((bg, i) => (
                    <div
                      key={i}
                      className={`w-7 h-7 rounded-full ${bg} border-2 ${t.avatarBorder} flex items-center justify-center text-[9px] text-white font-bold`}
                    >
                      {String.fromCharCode(65 + i)}
                    </div>
                  ))}
                </div>
                <div>
                  <p className={`text-xs font-bold ${t.headline}`}>500+ businesses already claimed this</p>
                  <p className={`text-xs ${t.body}`}>Join them — spots filling fast</p>
                </div>
              </div>

            </div>

            {/* ───── Right: Form card ───── */}
            <div className="lg:sticky lg:top-8">

              {state === 'success' ? (

                /* ── Success state ── */
                <div className={`${t.cardBg} border ${t.cardBorder} ${t.cardShadow} rounded-3xl p-10 text-center`}>
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                    <CheckCircle2 size={48} className="text-green-500" />
                  </div>
                  <h2 className={`text-2xl font-black mb-2 ${t.cardTitle}`}>You're in! 🎉</h2>
                  <p className={`text-sm leading-relaxed ${t.cardSub}`}>
                    We received your details and will reach out very soon.
                    <br />Thank you for your interest!
                  </p>
                </div>

              ) : (

                /* ── Lead form ── */
                <div className={`${t.cardBg} border ${t.cardBorder} ${t.cardShadow} rounded-3xl p-8`}>

                  {/* Card header */}
                  <div className="text-center mb-6">
                    <div className={`w-12 h-12 rounded-2xl ${t.badgeBg} border ${t.badgeBorder} flex items-center justify-center mx-auto mb-3`}>
                      <Icon size={20} className={t.iconAccent} />
                    </div>
                    <h2 className={`text-xl font-black ${t.cardTitle}`}>{cta}</h2>
                    <p className={`text-xs mt-1.5 ${t.cardSub}`}>
                      We'll respond within 24 hours — no commitment needed
                    </p>
                  </div>

                  <div className={`border-t ${t.divider} mb-6`} />

                  <form onSubmit={submit} className="space-y-4">

                    {/* Name */}
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${t.label}`}>Full name</label>
                      <div className="relative">
                        <User size={13} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${t.iconColor}`} />
                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                          placeholder="Your full name" className={inputBase} />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${t.label}`}>Email address</label>
                      <div className="relative">
                        <Mail size={13} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${t.iconColor}`} />
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                          placeholder="you@email.com" className={inputBase} />
                      </div>
                    </div>

                    {/* Phone */}
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${t.label}`}>Phone / WhatsApp</label>
                      <div className="relative">
                        <Phone size={13} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${t.iconColor}`} />
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                          placeholder="+1 555 000 0000" className={inputBase} />
                      </div>
                    </div>

                    {/* Message */}
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${t.label}`}>
                        Message <span className="font-normal opacity-50">(optional)</span>
                      </label>
                      <div className="relative">
                        <MessageSquare size={13} className={`absolute left-3.5 top-3.5 ${t.iconColor}`} />
                        <textarea value={message} onChange={e => setMessage(e.target.value)}
                          placeholder="Tell us what you need…" rows={3}
                          className={`${inputBase} resize-none`} />
                      </div>
                    </div>

                    {/* Error */}
                    {formError && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-2.5 rounded-xl text-xs">
                        <AlertTriangle size={12} className="shrink-0" />
                        {formError}
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={state === 'submitting'}
                      className={`w-full py-4 mt-1 rounded-2xl bg-gradient-to-r ${t.btn} text-white font-bold text-sm shadow-xl ${t.btnShadow} transition-all duration-150 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2`}
                    >
                      {state === 'submitting' ? (
                        <><Loader2 size={15} className="animate-spin" />Sending…</>
                      ) : (
                        <>{cta}<ArrowRight size={15} /></>
                      )}
                    </button>

                    {/* Trust signals */}
                    <div className="flex items-center justify-between pt-1 px-1 flex-wrap gap-y-1">
                      {([
                        { Icon: Lock,   label: 'Secure' },
                        { Icon: Clock,  label: '24h Response' },
                        { Icon: Shield, label: 'No Spam' },
                        { Icon: Gift,   label: '100% Free' },
                      ] as const).map(({ Icon: TIcon, label }) => (
                        <div key={label} className="flex items-center gap-1">
                          <TIcon size={10} className={t.iconColor} />
                          <span className={`text-[10px] ${t.trustText}`}>{label}</span>
                        </div>
                      ))}
                    </div>

                  </form>
                </div>
              )}
            </div>

          </div>
        </main>

        {/* ── Footer ── */}
        <footer className={`border-t ${t.divider} px-6 py-5`}>
          <div className="max-w-6xl mx-auto text-center">
            <p className={`text-[11px] ${t.trustText}`}>
              By submitting this form you agree to be contacted about this offer.
              Your data is kept private and will never be sold or shared.
            </p>
          </div>
        </footer>

      </div>

      {/* ── WhatsApp sticky button ── */}
      <a
        href={`https://wa.me/?text=${encodeURIComponent('Hi, I saw your offer: ' + (campaign?.campaign_name ?? 'Special Offer'))}`}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#22c55e] text-white font-bold px-4 py-3 rounded-full shadow-xl transition-colors"
        aria-label="Chat on WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span className="text-sm hidden sm:inline">Chat on WhatsApp</span>
      </a>
    </div>
  )
}
