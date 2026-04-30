/**
 * Handles the OAuth redirect from Facebook:
 * /auth/meta/callback?code=...&state=...
 *
 * Exchanges the code for a token, presents account/page selection,
 * then saves and redirects to Settings.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react'
import { invokeFunction } from '../lib/supabase'
import { Button } from '../components/ui/Button'

interface MetaAccount { id: string; name: string; account_status?: number; currency?: string }
interface MetaPage    { id: string; name: string; category?: string }

type Step = 'exchanging' | 'selecting' | 'saving' | 'done' | 'error'

export function MetaCallbackPage() {
  const navigate  = useNavigate()
  const [step, setStep]       = useState<Step>('exchanging')
  const [error, setError]     = useState<string | null>(null)
  const [token, setToken]     = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [accounts, setAccounts] = useState<MetaAccount[]>([])
  const [pages, setPages]     = useState<MetaPage[]>([])
  const [selectedAcc, setSelectedAcc] = useState<MetaAccount | null>(null)
  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const errParam = params.get('error_description')

    if (errParam) { setError(errParam); setStep('error'); return }
    if (!code)    { setError('No authorization code received from Meta.'); setStep('error'); return }

    const redirectUri = `${window.location.origin}/auth/meta/callback`

    invokeFunction<{ access_token: string; expires_at: string; accounts: MetaAccount[]; pages: MetaPage[] }>(
      'meta-oauth',
      { action: 'exchange', code, redirect_uri: redirectUri }
    ).then(({ data, error: fnErr }) => {
      if (fnErr || !data) {
        setError((fnErr as Error)?.message ?? 'Token exchange failed')
        setStep('error')
        return
      }
      setToken(data.access_token)
      setExpiresAt(data.expires_at)
      setAccounts(data.accounts)
      setPages(data.pages)
      if (data.accounts.length === 1) setSelectedAcc(data.accounts[0])
      if (data.pages.length === 1) setSelectedPage(data.pages[0])
      setStep('selecting')
    })
  }, [])

  const save = async () => {
    if (!selectedAcc) return
    setStep('saving')
    const { error: fnErr } = await invokeFunction('meta-oauth', {
      action:       'save',
      access_token: token,
      expires_at:   expiresAt,
      account_id:   selectedAcc.id,
      account_name: selectedAcc.name,
      page_id:      selectedPage?.id ?? null,
      page_name:    selectedPage?.name ?? null,
    })
    if (fnErr) { setError((fnErr as Error).message); setStep('error'); return }
    setStep('done')
    setTimeout(() => navigate('/settings'), 1500)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">

        {/* Exchanging */}
        {step === 'exchanging' && (
          <div className="text-center space-y-3">
            <Loader2 size={40} className="text-blue-500 animate-spin mx-auto" />
            <p className="text-gray-700 font-medium">Connecting your Meta account…</p>
          </div>
        )}

        {/* Select account + page */}
        {step === 'selecting' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Connect Meta Account</h2>
              <p className="text-sm text-gray-500 mt-1">Select the ad account and page to use for campaigns.</p>
            </div>

            {/* Ad account selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ad Account</label>
              <div className="relative">
                <select
                  className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedAcc?.id ?? ''}
                  onChange={e => setSelectedAcc(accounts.find(a => a.id === e.target.value) ?? null)}
                >
                  <option value="">— Select ad account —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Page selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Page <span className="text-gray-400 font-normal">(required for ads)</span></label>
              <div className="relative">
                <select
                  className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedPage?.id ?? ''}
                  onChange={e => setSelectedPage(pages.find(p => p.id === e.target.value) ?? null)}
                >
                  <option value="">— Select page —</option>
                  {pages.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {pages.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">No pages found. You can still connect but won't be able to run ads until a page is linked.</p>
              )}
            </div>

            <Button onClick={save} disabled={!selectedAcc} className="w-full">
              Connect Account
            </Button>
          </div>
        )}

        {/* Saving */}
        {step === 'saving' && (
          <div className="text-center space-y-3">
            <Loader2 size={40} className="text-blue-500 animate-spin mx-auto" />
            <p className="text-gray-700 font-medium">Saving your account…</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="text-center space-y-3">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <p className="text-gray-800 font-semibold">Meta account connected!</p>
            <p className="text-sm text-gray-500">Redirecting to Settings…</p>
          </div>
        )}

        {/* Error */}
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
