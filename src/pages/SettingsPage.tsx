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
import type { Profile, AlertPreferences, ChangeType } from '../types/database.types'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
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

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return data as Profile | null
    },
    enabled: !!user,
  })

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
      setWebhookUrl((prefs as typeof prefs & { webhook_url?: string }).webhook_url ?? '')
      setWebhookEnabled((prefs as typeof prefs & { webhook_enabled?: boolean }).webhook_enabled ?? false)
      setWhatsappNumber((prefs as typeof prefs & { whatsapp_number?: string }).whatsapp_number ?? '')
      setWhatsappAlerts((prefs as typeof prefs & { whatsapp_alerts?: boolean }).whatsapp_alerts ?? false)
    } else {
      setSelectedAlerts(['promotion', 'price_change', 'new_landing_page'])
    }
  }, [prefs])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    if (profile) reset({ full_name: profile.full_name ?? '' })
  }, [profile, reset])

  const updateProfile = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const { error } = await supabase.from('profiles').update({ full_name: data.full_name }).eq('id', user!.id)
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
