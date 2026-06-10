/**
 * GDPR Cookie Consent Banner
 * Shows once on first visit. Stores preference in localStorage.
 */
import { useState, useEffect } from 'react'
import { Cookie, X } from 'lucide-react'

const STORAGE_KEY = 'digipromix_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      const t = setTimeout(() => setVisible(true), 1200)
      return () => clearTimeout(t)
    }
  }, [])

  if (!visible) return null

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setVisible(false)
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 pointer-events-none"
    >
      <div className="max-w-4xl mx-auto bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 flex-wrap pointer-events-auto border border-gray-700/60">
        <Cookie size={18} className="text-amber-400 shrink-0" />
        <p className="flex-1 text-sm text-gray-300 min-w-[200px] leading-relaxed">
          We use cookies to keep you signed in and understand how you use DigiPromix AI.
          No ad tracking.{' '}
          <a href="/privacy" className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors">
            Privacy policy
          </a>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={decline}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={11} /> Decline
          </button>
          <button
            onClick={accept}
            className="text-xs px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold transition-colors shadow-sm"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}

/** Returns current consent state — use in analytics hooks to gate tracking */
export function getCookieConsent(): 'accepted' | 'declined' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'accepted' ? 'accepted' : v === 'declined' ? 'declined' : null
  } catch {
    return null
  }
}
