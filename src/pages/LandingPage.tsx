/**
 * Public landing page — /lp/:slug
 * No authentication required.
 * Supports 5 visual templates: default | healthcare | real-estate | education | local-services
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle, Zap, Heart, Home, GraduationCap, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/supabase'
import type { Campaign, LandingTemplate } from '../types/database.types'

type PageState = 'loading' | 'ready' | 'submitting' | 'success' | 'error' | 'not_found'

// ── Template config ────────────────────────────────────────────────────────────

interface TemplateConfig {
  bg: string
  surface: string
  surfaceBorder: string
  text: string
  subtext: string
  accent: string
  accentText: string
  inputBg: string
  inputBorder: string
  inputText: string
  inputPlaceholder: string
  btnGradient: string
  badgeBg: string
  badgeText: string
  offerGradient: string
  icon: React.ElementType
}

const TEMPLATES: Record<LandingTemplate, TemplateConfig> = {
  'default': {
    bg:              'bg-slate-950',
    surface:         'bg-white/5',
    surfaceBorder:   'border-white/10',
    text:            'text-white',
    subtext:         'text-gray-300',
    accent:          'text-blue-400',
    accentText:      'text-blue-400',
    inputBg:         'bg-white/10',
    inputBorder:     'border-white/10',
    inputText:       'text-white',
    inputPlaceholder:'placeholder-gray-500',
    btnGradient:     'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500',
    badgeBg:         'bg-white/5 border-white/10',
    badgeText:       'text-gray-300',
    offerGradient:   'from-green-500 to-emerald-600',
    icon:            Zap,
  },
  'healthcare': {
    bg:              'bg-blue-50',
    surface:         'bg-white',
    surfaceBorder:   'border-blue-100',
    text:            'text-blue-900',
    subtext:         'text-blue-700',
    accent:          'text-blue-600',
    accentText:      'text-blue-600',
    inputBg:         'bg-blue-50',
    inputBorder:     'border-blue-200',
    inputText:       'text-blue-900',
    inputPlaceholder:'placeholder-blue-300',
    btnGradient:     'from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500',
    badgeBg:         'bg-blue-100 border-blue-200',
    badgeText:       'text-blue-700',
    offerGradient:   'from-cyan-500 to-blue-600',
    icon:            Heart,
  },
  'real-estate': {
    bg:              'bg-amber-50',
    surface:         'bg-white',
    surfaceBorder:   'border-amber-100',
    text:            'text-amber-900',
    subtext:         'text-amber-800',
    accent:          'text-amber-600',
    accentText:      'text-amber-700',
    inputBg:         'bg-amber-50',
    inputBorder:     'border-amber-200',
    inputText:       'text-amber-900',
    inputPlaceholder:'placeholder-amber-400',
    btnGradient:     'from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500',
    badgeBg:         'bg-amber-100 border-amber-200',
    badgeText:       'text-amber-700',
    offerGradient:   'from-amber-500 to-orange-600',
    icon:            Home,
  },
  'education': {
    bg:              'bg-violet-50',
    surface:         'bg-white',
    surfaceBorder:   'border-violet-100',
    text:            'text-violet-900',
    subtext:         'text-violet-700',
    accent:          'text-violet-600',
    accentText:      'text-violet-700',
    inputBg:         'bg-violet-50',
    inputBorder:     'border-violet-200',
    inputText:       'text-violet-900',
    inputPlaceholder:'placeholder-violet-400',
    btnGradient:     'from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500',
    badgeBg:         'bg-violet-100 border-violet-200',
    badgeText:       'text-violet-700',
    offerGradient:   'from-violet-500 to-purple-600',
    icon:            GraduationCap,
  },
  'local-services': {
    bg:              'bg-orange-50',
    surface:         'bg-white',
    surfaceBorder:   'border-orange-100',
    text:            'text-orange-900',
    subtext:         'text-orange-800',
    accent:          'text-orange-600',
    accentText:      'text-orange-700',
    inputBg:         'bg-orange-50',
    inputBorder:     'border-orange-200',
    inputText:       'text-orange-900',
    inputPlaceholder:'placeholder-orange-400',
    btnGradient:     'from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400',
    badgeBg:         'bg-orange-100 border-orange-200',
    badgeText:       'text-orange-700',
    offerGradient:   'from-orange-500 to-red-500',
    icon:            Wrench,
  },
}

// ── Lead form ─────────────────────────────────────────────────────────────────

interface LeadFormProps {
  t: TemplateConfig
  cta: string
  state: PageState
  onSubmit: (e: React.FormEvent) => void
  name: string; setName: (v: string) => void
  email: string; setEmail: (v: string) => void
  phone: string; setPhone: (v: string) => void
  message: string; setMessage: (v: string) => void
  formError: string | null
}

function LeadForm({ t, cta, state, onSubmit, name, setName, email, setEmail, phone, setPhone, message, setMessage, formError }: LeadFormProps) {
  const baseInput = `w-full ${t.inputBg} border ${t.inputBorder} rounded-lg px-3 py-2.5 text-sm ${t.inputText} ${t.inputPlaceholder} focus:outline-none focus:ring-2 focus:ring-current`

  return (
    <form onSubmit={onSubmit} className={`${t.surface} border ${t.surfaceBorder} rounded-2xl p-8 space-y-4 shadow-xl`}>
      <h2 className={`text-lg font-bold text-center mb-2 ${t.text}`}>{cta}</h2>

      <div>
        <label className={`block text-xs font-medium mb-1 ${t.subtext}`}>Full name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Your name" className={baseInput} />
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${t.subtext}`}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" className={baseInput} />
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${t.subtext}`}>Phone / WhatsApp</label>
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="+1 555 000 0000" className={baseInput} />
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${t.subtext}`}>
          Message <span className="opacity-50">(optional)</span>
        </label>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Tell us about your needs…" rows={3}
          className={`${baseInput} resize-none`} />
      </div>

      {formError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={12} />{formError}
        </p>
      )}

      <button
        type="submit"
        disabled={state === 'submitting'}
        className={`w-full py-3 rounded-xl bg-gradient-to-r ${t.btnGradient} text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2`}
      >
        {state === 'submitting'
          ? <><Loader2 size={16} className="animate-spin" />Sending…</>
          : cta
        }
      </button>

      <p className={`text-xs text-center opacity-40 ${t.text}`}>
        By submitting you agree to be contacted. No spam.
      </p>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [state, setState]       = useState<PageState>('loading')
  const [campaign, setCampaign] = useState<Campaign | null>(null)

  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [phone,   setPhone]   = useState('')
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) { setState('not_found'); return }
    supabase
      .from('campaigns')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setState('not_found'); return }
        setCampaign(data as Campaign)
        setState('ready')
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

    const { error } = await invokeFunction('submit-lead', {
      slug,
      name:    name.trim()    || null,
      email:   email.trim()   || null,
      phone:   phone.trim()   || null,
      message: message.trim() || null,
    })

    if (error) {
      setFormError('Something went wrong. Please try again.')
      setState('ready')
      return
    }
    setState('success')
  }

  const templateKey: LandingTemplate = (campaign?.template as LandingTemplate) ?? 'default'
  const t = TEMPLATES[templateKey] ?? TEMPLATES['default']
  const Icon = t.icon
  const cta = campaign?.landing_page_cta ?? 'Get My Free Offer'

  if (state === 'loading') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${TEMPLATES['default'].bg}`}>
        <Loader2 size={32} className="text-blue-400 animate-spin" />
      </div>
    )
  }

  if (state === 'not_found') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${TEMPLATES['default'].bg} p-6`}>
        <div className="text-center">
          <AlertTriangle size={40} className="text-yellow-400 mx-auto mb-3" />
          <p className="text-white font-semibold text-lg">Page not found</p>
          <p className="text-gray-400 text-sm mt-1">This landing page doesn't exist or is no longer active.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${t.bg}`}>
      {/* Hero */}
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-10 text-center">
        {/* Badge */}
        <div className={`inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full ${t.badgeBg} border`}>
          <Icon size={13} className={t.accentText} />
          <span className={`text-xs font-medium ${t.badgeText}`}>
            {campaign?.competitor_name
              ? `${campaign.competitor_name} competitor offer detected`
              : 'Exclusive offer'
            }
          </span>
        </div>

        <h1 className={`text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-5 ${t.text}`}>
          {campaign?.landing_page_title ?? campaign?.headline ?? 'Exclusive Offer'}
        </h1>

        {campaign?.landing_page_body && (
          <p className={`text-lg leading-relaxed mb-6 ${t.subtext}`}>
            {campaign.landing_page_body}
          </p>
        )}

        {campaign?.offer && (
          <div className={`inline-block bg-gradient-to-r ${t.offerGradient} text-white font-bold px-6 py-2.5 rounded-full text-sm shadow-lg mb-8`}>
            🎯 {campaign.offer}
          </div>
        )}
      </div>

      {/* Form */}
      <div className="max-w-md mx-auto px-6 pb-20">
        {state === 'success' ? (
          <div className={`${t.surface} border ${t.surfaceBorder} rounded-2xl p-8 text-center shadow-xl`}>
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
            <h2 className={`text-xl font-bold mb-2 ${t.text}`}>You're in!</h2>
            <p className={`text-sm ${t.subtext}`}>
              We'll be in touch very soon. Thanks for your interest!
            </p>
          </div>
        ) : (
          <LeadForm
            t={t} cta={cta} state={state} onSubmit={submit}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            phone={phone} setPhone={setPhone}
            message={message} setMessage={setMessage}
            formError={formError}
          />
        )}
      </div>
    </div>
  )
}
