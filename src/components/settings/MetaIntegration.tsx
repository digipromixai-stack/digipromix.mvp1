import { useState } from 'react'
import { Globe, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Unlink } from 'lucide-react'
import { Card, CardHeader, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { invokeFunction } from '../../lib/supabase'
import { useMetaIntegration, useInvalidateIntegrations } from '../../hooks/useAdIntegrations'
import { useToast } from '../ui/Toast'

const META_SCOPES = [
  'ads_management',
  'ads_read',
  'pages_read_engagement',
  'business_management',
].join(',')

export function MetaIntegration() {
  const { metaIntegration, isLoading } = useMetaIntegration()
  const invalidate = useInvalidateIntegrations()
  const { toast } = useToast()
  const [disconnecting, setDisconnecting] = useState(false)

  const appId = import.meta.env.VITE_META_APP_ID as string | undefined

  const connect = () => {
    if (!appId) {
      toast('VITE_META_APP_ID is not set in your environment', 'error')
      return
    }
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/meta/callback`)
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${META_SCOPES}&response_type=code`
    window.location.href = url
  }

  const disconnect = async () => {
    setDisconnecting(true)
    const { error } = await invokeFunction('meta-oauth', { action: 'disconnect' })
    setDisconnecting(false)
    if (error) { toast('Disconnect failed', 'error'); return }
    invalidate()
    toast('Meta account disconnected', 'success')
  }

  const tokenExpiry = metaIntegration?.token_expires_at
    ? new Date(metaIntegration.token_expires_at)
    : null
  const isExpiringSoon = tokenExpiry && tokenExpiry.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000

  if (isLoading) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Globe size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Meta Ads</h2>
            <p className="text-xs text-gray-400">Facebook &amp; Instagram ads from DigiPromix</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {metaIntegration ? (
          <>
            {/* Connected state */}
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
              <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">Connected</p>
                <p className="text-xs text-green-700 mt-0.5 truncate">
                  Ad account: <span className="font-mono">{metaIntegration.account_name ?? metaIntegration.account_id}</span>
                </p>
                {metaIntegration.page_name && (
                  <p className="text-xs text-green-700 truncate">
                    Page: {metaIntegration.page_name}
                  </p>
                )}
                {tokenExpiry && (
                  <p className={`text-xs mt-1 ${isExpiringSoon ? 'text-yellow-700' : 'text-green-600'}`}>
                    Token expires {tokenExpiry.toLocaleDateString()}
                    {isExpiringSoon && ' — reconnect soon'}
                  </p>
                )}
              </div>
            </div>

            {isExpiringSoon && (
              <div className="flex items-center gap-2 p-2.5 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-700">
                <AlertTriangle size={13} className="shrink-0" />
                Token expiring soon. Reconnect to continue running ads.
              </div>
            )}

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
            {/* Not connected state */}
            <p className="text-sm text-gray-600">
              Connect your Meta Business account to launch campaigns directly to Facebook and Instagram ads from DigiPromix.
            </p>

            <ul className="space-y-1.5 text-xs text-gray-500">
              {['Create campaigns from AI-generated content', 'Target high-intent audiences automatically', 'All campaigns start paused — you control activation'].map(f => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {!appId && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-700">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span><code className="font-mono">VITE_META_APP_ID</code> is not set. Add it to your <code>.env.local</code> to enable Meta connection.</span>
              </div>
            )}

            <Button onClick={connect} disabled={!appId} className="w-full">
              <Globe size={14} className="mr-2" />
              Connect Meta Account
            </Button>

            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <ExternalLink size={11} />
              Create a Facebook App to get your App ID
            </a>
          </>
        )}
      </CardContent>
    </Card>
  )
}
