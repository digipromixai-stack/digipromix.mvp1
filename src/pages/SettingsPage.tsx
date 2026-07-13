import { useState, useEffect } from 'react'
import { MetaIntegration } from '../components/settings/MetaIntegration'
import { GoogleAdsIntegration } from '../components/settings/GoogleAdsIntegration'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { useProfile } from '../hooks/useProfile'
import type { AlertPreferences, ChangeType } from '../types/database.types'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  value_per_lead: z.number().positive('Must be a positive number'),
})
type ProfileFormData = z.infer<typeof profileSchema>

const ALERT_TYPES: { value: ChangeType; label: string }[] = [
  { value: 'promotion', label: 'Promotions' },
  { value: 'price_change', label: 'Price Changes' },
  { value: 'new_landing_page', label: 'New Landing Pages' },
  { value: 'new_blog_post', label: 'New Blog Posts' },
  { value: 'banner_change', label: 'Banner Changes' },
  { value: 'content_change', label: 'Content Changes' },
]

export function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: profile, isLoading } = useProfile()

  const { data: prefs } = useQuery({
    queryKey: ['alert_preferences', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('alert_preferences').select('*').eq('user_id', user!.id).single()
      return data as AlertPreferences | null
    },
    enabled: !!user,
  })

  const [selectedAlerts, setSelectedAlerts] = useState<ChangeType[]>([])
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [whatsappAlerts, setWhatsappAlerts] = useState(false)

  useEffect(() => {
    if (prefs) {
      setSelectedAlerts(prefs.alert_on ?? [])
      setEmailAlerts(prefs.email_alerts)
      setWebhookUrl(prefs.webhook_url ?? '')
      setWebhookEnabled(prefs.webhook_enabled ?? false)
      setWhatsappNumber(prefs.whatsapp_number ?? '')
      setWhatsappAlerts(prefs.whatsapp_alerts ?? false)
    } else {
      setSelectedAlerts(['promotion', 'price_change', 'new_landing_page'])
    }
  }, [prefs])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    if (profile) reset({ full_name: profile.full_name ?? '', value_per_lead: profile.value_per_lead ?? 100 })
  }, [profile, reset])

  const updateProfile = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const { error } = await supabase.from('profiles')
        .update({ full_name: data.full_name, value_per_lead: data.value_per_lead })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      toast('Profile updated', 'success')
    },
  })

  const updatePrefs = useMutation({
    mutationFn: async () => {
      const payload = {
        email_alerts: emailAlerts,
        dashboard_alerts: true,
        alert_on: selectedAlerts,
        webhook_url: webhookUrl.trim() || null,
        webhook_enabled: webhookEnabled && !!webhookUrl.trim(),
        whatsapp_number: whatsappNumber.trim() || null,
        whatsapp_alerts: whatsappAlerts && !!whatsappNumber.trim(),
      }
      if (prefs) {
        const { error } = await supabase.from('alert_preferences').update(payload).eq('user_id', user!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('alert_preferences').insert({ user_id: user!.id, ...payload })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert_preferences'] })
      toast('Alert preferences saved', 'success')
    },
  })

  function toggleAlertType(type: ChangeType) {
    setSelectedAlerts((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* ── Ad Integrations ─────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ad Integrations</h2>
        <div className="space-y-4">
          <MetaIntegration />
          <GoogleAdsIntegration />
        </div>
      </div>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Profile</h2></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4">
            <Input
              label="Full name"
              id="full_name"
              error={errors.full_name?.message}
              {...register('full_name')}
            />
            <Input label="Email" id="email" value={user?.email ?? ''} disabled />
            <div>
              <Input
                label="Value per lead ($)"
                id="value_per_lead"
                type="number"
                step="1"
                min="0"
                error={errors.value_per_lead?.message}
                {...register('value_per_lead', { valueAsNumber: true })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Used to estimate Revenue and ROI across the app. Set this to what a converted lead is actually
                worth to your business — the default is a generic placeholder, not a measurement.
              </p>
            </div>
            <Button type="submit" loading={isSubmitting || updateProfile.isPending}>Save profile</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Alert Preferences</h2></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Receive email alerts</span>
            </label>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Notify me about:</p>
            <div className="space-y-2">
              {ALERT_TYPES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selectedAlerts.includes(value)}
                    onChange={() => toggleAlertType(value)}
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <Button onClick={() => updatePrefs.mutate()} loading={updatePrefs.isPending}>
            Save preferences
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">WhatsApp Lead Alerts</h2>
          <p className="text-xs text-gray-400 mt-0.5">Get notified on WhatsApp the moment a new lead submits your landing page</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="WhatsApp number (international format)"
            id="whatsapp_number"
            type="tel"
            placeholder="+1 555 000 0000"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={whatsappAlerts}
              onChange={(e) => setWhatsappAlerts(e.target.checked)}
              disabled={!whatsappNumber.trim()}
            />
            <span className="text-sm text-gray-700">Enable WhatsApp lead alerts</span>
          </label>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-600">Requires Twilio WhatsApp API:</p>
            <p>Set <code className="font-mono">TWILIO_ACCOUNT_SID</code>, <code className="font-mono">TWILIO_AUTH_TOKEN</code>, and <code className="font-mono">TWILIO_WHATSAPP_NUMBER</code> in Supabase Vault (as <code className="font-mono">twilio_account_sid</code> etc.) or Edge Function secrets.</p>
          </div>
          <Button onClick={() => updatePrefs.mutate()} loading={updatePrefs.isPending}>
            Save WhatsApp settings
          </Button>
        </CardContent>
      </Card>

      {/* ── Google Ads Conversion Tracking ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Google Ads Conversion Tracking</h2>
          <p className="text-xs text-gray-400 mt-0.5">Required to unlock MAXIMIZE_CONVERSIONS Smart Bidding (gets more leads for the same budget)</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">Why this matters</p>
            <p className="text-xs text-amber-700">Currently your campaigns use <strong>Maximize Clicks</strong> bidding. Once conversion tracking is set up, DigiPromix will automatically switch to <strong>Maximize Conversions</strong> — Google's AI will optimise for actual leads, not just clicks. This typically reduces cost-per-lead by 30–50%.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700">Setup in 3 steps:</p>
            {[
              { step: '1', text: 'Go to Google Ads → Tools → Conversions → + New conversion action → Website' },
              { step: '2', text: 'Choose "Submit lead form" as the conversion event. Copy the Conversion ID and Label shown.' },
              { step: '3', text: 'Add the Google tag to your landing page (paste before </head> tag or tell me and I\'ll add it automatically).' },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-2.5 text-xs text-gray-600">
                <span className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{step}</span>
                <p className="mt-0.5">{text}</p>
              </div>
            ))}
          </div>
          <a
            href="https://ads.google.com/aw/conversions"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium"
          >
            Open Google Ads Conversions →
          </a>
          <p className="text-[10px] text-gray-400">Once set up, share your Conversion ID with us and we'll wire it into your campaigns automatically.</p>
        </CardContent>
      </Card>

      {/* ── Signal Intelligence API Keys ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Signal Intelligence — API Keys</h2>
          <p className="text-xs text-gray-400 mt-0.5">These keys power the Opportunity Radar. Add them in Supabase → Settings → Edge Function Secrets.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              name: 'SERPAPI_KEY',
              label: 'SerpAPI (Google Trends — premium)',
              status: 'optional',
              desc: 'Without this, Trends uses the free RSS fallback (less accurate). Get a free key at',
              link: 'https://serpapi.com',
              linkLabel: 'serpapi.com',
              impact: 'Better keyword-level growth %',
            },
            {
              name: 'META_APP_ACCESS_TOKEN',
              label: 'Meta Ad Library token',
              status: 'required',
              desc: 'Required for competitor ad volume signals. Get from',
              link: 'https://developers.facebook.com/tools/explorer',
              linkLabel: 'Facebook Graph Explorer',
              impact: 'AD_VOLUME_SPIKE, NEW_CREATIVE, OFFER_REPEAT signals',
            },
            {
              name: 'GEMINI_API_KEY',
              label: 'Gemini API (AI enrichment)',
              status: 'required',
              desc: 'Used for opportunity title generation and vector embeddings. Get free key at',
              link: 'https://aistudio.google.com/app/apikey',
              linkLabel: 'Google AI Studio',
              impact: 'AI-generated opportunity titles + RAG memory',
            },
          ].map(k => (
            <div key={k.name} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono font-bold text-gray-800">{k.name}</code>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                    k.status === 'required' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                  }`}>{k.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {k.desc}{' '}
                  <a href={k.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{k.linkLabel}</a>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 italic">Enables: {k.impact}</p>
              </div>
            </div>
          ))}
          <div className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="font-medium text-blue-700 mb-1">How to add secrets</p>
            <p>Supabase Dashboard → Project Settings → Edge Functions → Secrets → Add new secret</p>
            <p className="mt-1">Or via CLI: <code className="font-mono bg-blue-100 px-1 rounded">supabase secrets set KEY=value --project-ref kvsjzsmlcycgfoazfunb</code></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Webhook Notifications</h2>
          <p className="text-xs text-gray-400 mt-0.5">Send change alerts to Slack, Discord, Zapier, or any HTTP endpoint</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Webhook URL"
            id="webhook_url"
            type="url"
            placeholder="https://hooks.slack.com/services/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={webhookEnabled}
              onChange={(e) => setWebhookEnabled(e.target.checked)}
              disabled={!webhookUrl.trim()}
            />
            <span className="text-sm text-gray-700">Enable webhook notifications</span>
          </label>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-600">Payload format (JSON POST):</p>
            <pre className="font-mono text-gray-500 whitespace-pre-wrap">{`{ "change_type": "promotion", "severity": "high",\n  "title": "...", "description": "...",\n  "competitor": "Stripe", "url": "stripe.com/pricing",\n  "detected_at": "2024-..." }`}</pre>
          </div>
          <Button onClick={() => updatePrefs.mutate()} loading={updatePrefs.isPending}>
            Save webhook
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
