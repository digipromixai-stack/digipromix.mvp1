/**
 * CookieConsent — MVP 2.0 GDPR-compliant cookie consent banner.
 *
 * Shows on first visit. User can Accept all, Reject non-essential, or
 * read the privacy policy. Choice is stored in localStorage, never sent
 * to a server. Once dismissed, the banner doesn't reappear.
 *
 * No tracking scripts gate behind this in the current build — but the
 * consent flag (`digipromix_cookie_consent`) is the single source of
 * truth for any future analytics that need explicit opt-in.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, X } from 'lucide-react'

const STORAGE_KEY = 'digipromix_cookie_consent'

type Choice = 'accepted' | 'rejected'

export function getCookieConsent(): Choice | null {
  if (typeof window === 'undefined') return null
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'accepted' || v === 'rejected' ? v : null
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Defer mount + visibility to avoid layout shift on SSR / first paint
    const id = window.setTimeout(() => {
      if (!getCookieConsent()) setVisible(true)
    }, 600)
    return () => window.clearTimeout(id)
  }, [])

  const choose = (c: Choice) => {
    try { window.localStorage.setItem(STORAGE_KEY, c) } catch { /* private mode */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[1000] bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 sm:p-5 animate-fade-in-up"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
          <Cookie size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900">Your privacy</h3>
            <button
              onClick={() => choose('rejected')}
              aria-label="Dismiss"
              className="text-gray-400 hover:text-gray-600 -mt-1 -mr-1"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mt-1">
            We use essential cookies to keep you signed in and remember your
            preferences. With your consent, we may also use analytics cookies
            to improve the product. Read our{' '}
            <Link to="/privacy" className="text-blue-600 hover:underline">privacy policy</Link>.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => choose('rejected')}
              className="flex-1 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors"
            >
              Essential only
            </button>
            <button
              onClick={() => choose('accepted')}
              className="flex-1 text-xs font-semibold text-white bg-gradient-brand hover:brightness-105 px-3 py-2 rounded-lg shadow-soft transition-all"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
