import { useState } from 'react'
import { Search, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Unlink } from 'lucide-react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { invokeFunction } from '../../lib/supabase'
import { useGoogleAdsIntegration, useInvalidateIntegrations } from '../../hooks/useAdIntegrations'
import { useToast } from '../ui/Toast'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
].join(' ')

export function GoogleAdsIntegration() {
  const { googleIntegration, isLoading } = useGoogleAdsIntegration()
  const invalidate = useInvalidateIntegrations()
  const { toast } = useToast()
  const [disconnecting, setDisconnecting] = useState(false)

  const clientId = import.meta.env.VITE_GOOGLE_ADS_CLIENT_ID as string | undefined

  const connect = () => {
    if (!clientId) {
      toast('VITE_GOOGLE_ADS_CLIENT_ID is not set in your environment', 'error')
      return
    }
    const redirectUri = `${window.location.origin}/auth/google-ads/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  const disconnect = async () => {
    setDisconnecting(true)
    const { error } = await invokeFunction('google-ads-oauth', { action: 'disconnect' })
    setDisconnecting(false)
    if (error) { toast('Disconnect failed', 'error'); return }
    invalidate()
    toast('Google Ads account disconnected', 'success')
  }

  if (isLoading) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
            <Search size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Google Ads</h2>
            <p className="text-xs text-gray-400">Search campaigns launched from DigiPromix</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleIntegration ? (
          <>
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
              <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">Connected</p>
                <p className="text-xs text-green-700 mt-0.5 truncate">
                  Customer: <span className="font-mono">{googleIntegration.account_name ?? googleIntegration.account_id}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={connect} className="flex-1">
                Reconnect / Switch account
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={disconnect}
                disabled={disconnecting}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                {disconnecting
                  ? <Loader2 size={13} className="animate-spin" />
                  : <><Unlink size={13} className="mr-1" />Disconnect</>
                }
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Connect Google Ads to launch Search campaigns (Campaign → Ad Group → Responsive Search Ad + keywords) directly from DigiPromix.
            </p>

            <ul className="space-y-1.5 text-xs text-gray-500">
              {['Responsive Search Ads built from AI content', 'Keywords bid automatically on competitor search terms', 'All campaigns start paused — you control activation'].map(f => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {!clientId && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-700">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span><code className="font-mono">VITE_GOOGLE_ADS_CLIENT_ID</code> is not set. Add it to your <code>.env.local</code> to enable Google Ads connection.</span>
              </div>
            )}

            <Button onClick={connect} disabled={!clientId} className="w-full">
              <Search size={14} className="mr-2" />
              Connect Google Ads
            </Button>

            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <ExternalLink size={11} />
              Create an OAuth Client in Google Cloud Console
            </a>
          </>
        )}
      </CardContent>
    </Card>
  )
}
