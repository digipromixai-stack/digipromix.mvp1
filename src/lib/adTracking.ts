/**
 * Consent-gated ad tracking for public campaign landing pages.
 *
 * Google Consent Mode v2: every consent type starts "denied" and the Google tag
 * is only loaded once the visitor accepts. The Meta pixel is not loaded at all
 * before consent. IDs come from env vars so nothing loads when they're unset:
 *   VITE_GOOGLE_ADS_TAG_ID        e.g. AW-123456789
 *   VITE_GOOGLE_ADS_LEAD_LABEL    conversion label for the lead action
 *   VITE_META_PIXEL_ID            e.g. 1234567890
 */
import { getCookieConsent } from '../components/ui/CookieConsent'

const GOOGLE_TAG_ID    = import.meta.env.VITE_GOOGLE_ADS_TAG_ID as string | undefined
const GOOGLE_LEAD_LABEL = import.meta.env.VITE_GOOGLE_ADS_LEAD_LABEL as string | undefined
const META_PIXEL_ID    = import.meta.env.VITE_META_PIXEL_ID as string | undefined

export const CONSENT_EVENT = 'digipromix:consent'

type Gtag = (...args: unknown[]) => void
type Fbq  = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; callMethod?: (...a: unknown[]) => void }
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag; fbq?: Fbq; _fbq?: Fbq }
}

let initialised = false
let loaded = false

function loadScript(src: string) {
  const s = document.createElement('script')
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

function ensureGtagStub() {
  window.dataLayer = window.dataLayer ?? []
  // gtag must push the `arguments` object, not an array — Google's loader relies on it
  // eslint-disable-next-line prefer-rest-params
  window.gtag = window.gtag ?? function gtag() { window.dataLayer!.push(arguments) }
}

function grantAndLoad() {
  if (loaded) return
  loaded = true

  if (GOOGLE_TAG_ID) {
    window.gtag!('consent', 'update', {
      ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted',
    })
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`)
    window.gtag!('js', new Date())
    window.gtag!('config', GOOGLE_TAG_ID)
  }

  if (META_PIXEL_ID && !window.fbq) {
    // Standard Meta pixel bootstrap: a queueing stub until fbevents.js arrives
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue!.push(args)
    } as Fbq
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    window.fbq = fbq
    window._fbq = fbq
    loadScript('https://connect.facebook.net/en_US/fbevents.js')
    fbq('init', META_PIXEL_ID)
    fbq('track', 'PageView')
  }
}

/** Call once on a landing page. Sets Consent Mode defaults and loads tags if/when consent is given. */
export function initAdTracking() {
  if (initialised || (!GOOGLE_TAG_ID && !META_PIXEL_ID)) return
  initialised = true

  if (GOOGLE_TAG_ID) {
    ensureGtagStub()
    window.gtag!('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied',
      wait_for_update: 500,
    })
  }

  if (getCookieConsent() === 'accepted') grantAndLoad()
  else window.addEventListener(CONSENT_EVENT, () => { if (getCookieConsent() === 'accepted') grantAndLoad() })
}

/** Report a submitted lead to the ad platforms — a no-op without consent. */
export function trackLeadConversion() {
  if (!loaded) return
  if (GOOGLE_TAG_ID && GOOGLE_LEAD_LABEL) {
    window.gtag?.('event', 'conversion', { send_to: `${GOOGLE_TAG_ID}/${GOOGLE_LEAD_LABEL}` })
  }
  if (META_PIXEL_ID) window.fbq?.('track', 'Lead')
}
