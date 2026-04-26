import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import type { Profile, AlertPreferences, ChangeType, AdIntegration } from '../types/database.types'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
})
type ProfileFormData = z.infer<typeof profileSchema>

const ALERT_TYPES: { value: ChangeType; label: string }[] = [
  { value: 'campaign_launch', label: 'Campaign Launches' },
  { value: 'promotion', label: 'Promotions' },
  { value: 'price_change', label: 'Price Changes' },
  { value: 'new_landing_page', label: 'New Landing Pages' },
  { value: 'new_blog_post', label: 'New Blog Posts' },
  { value: 'banner_change', label: 'Banner Changes' },
  { value: 'content_change', label: 'Content Changes' },
]

// Build Google OAuth URL
function buildGoogleOAuthUrl(userId: string): string {
  const clientId     = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
  const redirectUri  = encodeURIComponent(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-ads-auth`
  )
  const scope        = encodeURIComponent(
    'https://www.googleapis.com/auth/adwords'
  )
  return (
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${userId}`
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()

  // ── Profile ────────────────────────────────────────────────────────────────
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return data as Profile | null
    },
    enabled: !!user,
  })

  // ── Alert prefs ────────────────────────────────────────────────────────────
  const { data: prefs } = useQuery({
    queryKey: ['alert_preferences', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('alert_preferences').select('*').eq('user_id', user!.id).single()
      return data as AlertPreferences | null
    },
    enabled: !!user,
  })

  // ── Ad integrations ────────────────────────────────────────────────────────
  const { data: googleIntegration, refetch: refetchIntegration } = useQuery({
    queryKey: ['ad_integration_google', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_integrations')
        .select('*')
        .eq('user_id', user!.id)
        .eq('platform', 'google_ads')
        .single()
      return data as AdIntegration | null
    },
    enabled: !!user,
  })

  // Check for OAuth callback result in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleAds = params.get('google_ads')
    if (googleAds === 'connected') {
      toast('Google Ads connected successfully!', 'success')
      refetchIntegration()
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (googleAds === 'error') {
      const reason = params.get('reason') ?? 'unknown error'
      toast(`Google Ads connection failed: ${reason}`, 'error')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const disconnectGoogle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('ad_integrations')
        .update({ is_active: false })
        .eq('user_id', user!.id)
        .eq('platform', 'google_ads')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad_integration_google'] })
      toast('Google Ads disconnected', 'success')
    },
    onError: () => toast('Failed to disconnect', 'error'),
  })

  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedAlerts, setSelectedAlerts] = useState<ChangeType[]>([])
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEnabled, setWebhookEnabled] = useState(false)

  useEffect(() => {
    if (prefs) {
      setSelectedAlerts(prefs.alert_on ?? [])
      setEmailAlerts(prefs.email_alerts)
      setWebhookUrl((prefs as typeof prefs & { webhook_url?: string }).webhook_url ?? '')
      setWebhookEnabled((prefs as typeof prefs & { webhook_enabled?: boolean }).webhook_enabled ?? false)
    } else {
      setSelectedAlerts(['campaign_launch', 'promotion', 'price_change', 'new_landing_page'])
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

  const isGoogleConnected = !!googleIntegration?.is_active

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* ── Profile ──────────────────────────────────────────────────────── */}
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

      {/* ── Connected Platforms ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Connected Platforms</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Connect ad accounts to launch counter-campaigns instantly when competitors run promos
          </p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Google Ads */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              {/* Google Ads "G" logo in colour */}
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Google Ads</p>
                {isGoogleConnected ? (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    {googleIntegration?.account_name ?? 'Connected'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Not connected</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isGoogleConnected ? (
                <>
                  <a
                    href="https://ads.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                  >
                    Open <ExternalLink size={11} className="ml-0.5" />
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectGoogle.mutate()}
                    loading={disconnectGoogle.isPending}
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    if (!user) return
                    const url = buildGoogleOAuthUrl(user.id)
                    window.location.href = url
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4"
                >
                  Connect
                </Button>
              )}
            </div>
          </div>

          {/* Meta Ads — coming soon */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 opacity-60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.027 4.388 11.024 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.097 24 18.1 24 12.073z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Meta Ads</p>
                <p className="text-xs text-gray-400">Coming soon</p>
              </div>
            </div>
            <Button size="sm" disabled className="text-xs px-4">Connect</Button>
          </div>

          {/* Setup note */}
          {!isGoogleConnected && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Google Ads setup required</p>
                <p className="text-amber-600 mt-0.5">
                  You need a <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> in your .env file
                  and the <code className="bg-amber-100 px-1 rounded">GOOGLE_ADS_DEVELOPER_TOKEN</code>,{' '}
                  <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code>, and{' '}
                  <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> secrets set in Supabase.
                  See the setup guide.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Alert Preferences ─────────────────────────────────────────────── */}
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

      {/* ── Webhook Notifications ─────────────────────────────────────────── */}
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
