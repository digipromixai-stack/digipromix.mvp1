/**
 * Handles OAuth redirect from Google:
 *   /auth/google-ads/callback?code=...
 *
 * Exchanges the code for tokens, lets user pick a Google Ads customer account,
 * saves the integration, and redirects to Settings.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react'
import { invokeFunction } from '../lib/supabase'
import { Button } from '../components/ui/Button'

interface GoogleAdsAccount { id: string; resource_name: string; descriptive_name?: string }

type Step = 'exchanging' | 'selecting' | 'saving' | 'done' | 'error'

export function GoogleAdsCallbackPage() {
  const navigate = useNavigate()
  const [step, setStep]           = useState<Step>('exchanging')
  const [error, setError]         = useState<string | null>(null)
  const [accessToken, setAccessToken]   = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [accounts, setAccounts]   = useState<GoogleAdsAccount[]>([])
  const [selected, setSelected]   = useState<GoogleAdsAccount | null>(null)
  const [managerId, setManagerId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const errParam = params.get('error_description') ?? params.get('error')

    if (errParam) { setError(errParam); setStep('error'); return }
    if (!code)    { setError('No authorization code received from Google.'); setStep('error'); return }

    const redirectUri = `${window.location.origin}/auth/google-ads/callback`

    invokeFunction<{
      access_token: string
      refresh_token: string
      expires_at: string
      accounts: GoogleAdsAccount[]
    }>('google-ads-oauth', { action: 'exchange', code, redirect_uri: redirectUri })
      .then(({ data, error: fnErr }) => {
        if (fnErr || !data) {
          setError((fnErr as Error)?.message ?? 'Token exchange failed')
          setStep('error')
          return
        }
        setAccessToken(data.access_token)
        setRefreshToken(data.refresh_token)
        setExpiresAt(data.expires_at)
        setAccounts(data.accounts)
        if (data.accounts.length === 1) setSelected(data.accounts[0])
        setStep('selecting')
      })
  }, [])

  const save = async () => {
    if (!selected) return
    setStep('saving')
    const { error: fnErr } = await invokeFunction('google-ads-oauth', {
      action:            'save',
      access_token:      accessToken,
      refresh_token:     refreshToken,
      expires_at:        expiresAt,
      account_id:        selected.id,
      account_name:      selected.descriptive_name ?? selected.id,
      login_customer_id: managerId.trim() || null,
    })
    if (fnErr) { setError((fnErr as Error).message); setStep('error'); return }
    setStep('done')
    setTimeout(() => navigate('/settings'), 1500)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">

        {step === 'exchanging' && (
          <div className="text-center space-y-3">
            <Loader2 size={40} className="text-red-500 animate-spin mx-auto" />
            <p className="text-gray-700 font-medium">Connecting your Google Ads account…</p>
          </div>
        )}

        {step === 'selecting' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Connect Google Ads</h2>
              <p className="text-sm text-gray-500 mt-1">Select the Google Ads customer account to use for campaigns.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Account</label>
              <div className="relative">
                <select
                  className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={selected?.id ?? ''}
                  onChange={e => setSelected(accounts.find(a => a.id === e.target.value) ?? null)}
                >
                  <option value="">— Select account —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.descriptive_name ? `${a.descriptive_name} (${a.id})` : a.id}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {accounts.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  No accessible Google Ads accounts. Make sure the developer token is approved and this Google account has Google Ads access.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Manager Account ID <span className="text-gray-400 font-normal">(optional — required if using MCC)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 1234567890"
                value={managerId}
                onChange={e => setManagerId(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank if the account above is accessed directly (not via MCC).</p>
            </div>

            <Button onClick={save} disabled={!selected} className="w-full">
              Connect Account
            </Button>
          </div>
        )}

        {step === 'saving' && (
          <div className="text-center space-y-3">
            <Loader2 size={40} className="text-red-500 animate-spin mx-auto" />
            <p className="text-gray-700 font-medium">Saving your account…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-3">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <p className="text-gray-800 font-semibold">Google Ads connected!</p>
            <p className="text-sm text-gray-500">Redirecting to Settings…</p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-red-700">
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Connection failed</p>
                <p className="text-sm mt-0.5">{error}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate('/settings')} className="w-full">
              Back to Settings
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
