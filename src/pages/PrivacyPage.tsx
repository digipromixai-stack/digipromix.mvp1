import { Link } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'

export function PrivacyPage() {
  const lastUpdated = 'May 7, 2026'

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-700 hover:text-gray-900">
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Back to home</span>
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="DigiPromix" className="w-7 h-7 rounded-lg" />
            <span className="text-base font-bold tracking-tight">DigiPromix <span className="text-blue-600">AI</span></span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">

        {/* Title */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <Shield size={13} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Privacy Policy</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-6">

          <section>
            <p className="text-base">
              DigiPromix AI ("we", "our", "us") respects your privacy. This Privacy Policy explains
              what data we collect, how we use it, who we share it with, and the choices you have.
              By using DigiPromix at <strong>www.digipromix.com</strong>, you agree to the practices
              described below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">1. Information We Collect</h2>

            <h3 className="text-base font-semibold text-gray-900 mt-4 mb-2">1.1 Information you provide</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Account data</strong> — name, email, password (hashed), profile picture (if you sign in with Google).</li>
              <li><strong>Business data</strong> — competitor URLs you choose to monitor, alert preferences, webhook URLs, WhatsApp numbers.</li>
              <li><strong>Ad platform tokens</strong> — encrypted OAuth tokens for Google Ads and Meta Ads accounts you choose to connect.</li>
              <li><strong>Lead capture data</strong> — names, emails, phone numbers submitted on landing pages you publish (collected on your behalf).</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900 mt-4 mb-2">1.2 Information we collect automatically</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Usage data</strong> — pages visited, features used, clicks, timestamps.</li>
              <li><strong>Device data</strong> — IP address, browser, operating system, device type.</li>
              <li><strong>Cookies & local storage</strong> — session tokens, theme preferences, query cache.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900 mt-4 mb-2">1.3 Information from third parties</h3>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Google</strong> — your name, email, profile picture (if you sign in with Google).</li>
              <li><strong>Public competitor websites</strong> — HTML, prices, headlines, banners (publicly accessible content only, fetched on your behalf).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Provide, maintain, and improve the DigiPromix service.</li>
              <li>Authenticate you and protect your account.</li>
              <li>Generate AI-powered counter-campaigns based on competitor signals.</li>
              <li>Launch and manage advertising campaigns on Google Ads and Meta Ads at your direction.</li>
              <li>Send transactional notifications: competitor change alerts, lead notifications, campaign confirmations.</li>
              <li>Detect abuse, prevent fraud, and comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">3. Google API Services User Data Policy</h2>
            <p>
              DigiPromix's use of information received from Google APIs adheres to the
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline"> Google API Services User Data Policy</a>,
              including the Limited Use requirements.
            </p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li><strong>Google Ads scope</strong> (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">.../auth/adwords</code>): used only to perform actions you explicitly initiate inside DigiPromix — listing your accessible accounts, creating/pausing/resuming/deleting campaigns you create.</li>
              <li><strong>Gmail send scope</strong> (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">.../auth/gmail.send</code>): used only by our service Gmail account (digipromix.ai@gmail.com) to deliver transactional notifications you have subscribed to. We never request gmail.send authorisation from end users.</li>
              <li><strong>Sign-in scopes</strong> (email, profile, openid): used only to create and authenticate your DigiPromix account.</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> use Google user data to train AI/ML models.
              We do <strong>not</strong> sell, transfer, or share Google user data with third parties for advertising or any other purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">4. How We Share Information</h2>
            <p>We do not sell your personal data. We share data only with these categories of recipients:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li><strong>Service providers</strong> — Supabase (database & auth hosting), Vercel (web hosting), Render (web crawler infrastructure), Google AI (Gemini API for content generation). All bound by data protection agreements.</li>
              <li><strong>Ad platforms</strong> — Google Ads and Meta Ads, only to fulfil campaign actions you initiate.</li>
              <li><strong>Legal authorities</strong> — when required by law, court order, or to protect rights and safety.</li>
              <li><strong>Successors</strong> — in the event of a merger, acquisition, or sale of assets, with notice to you.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">5. Data Security</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>All traffic is encrypted in transit via HTTPS (TLS 1.2+).</li>
              <li>OAuth tokens and sensitive secrets are stored encrypted at rest.</li>
              <li>Row-Level Security ensures each user can only access their own data.</li>
              <li>Authentication uses industry-standard password hashing (bcrypt) and OAuth 2.0.</li>
              <li>We follow security best practices including CSRF protection on OAuth flows, input sanitisation, and least-privilege service roles.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">6. Data Retention</h2>
            <p>
              We retain your account and business data for as long as your account is active. When you delete
              your account, all associated data — including campaigns, integrations, leads, and monitoring history —
              is permanently deleted within 30 days. Anonymised, aggregated analytics may be retained.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">7. Your Rights</h2>
            <p>
              Depending on your jurisdiction (GDPR, CCPA, etc.), you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate data.</li>
              <li>Delete your data ("right to be forgotten").</li>
              <li>Export your data in a portable format.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Withdraw consent at any time.</li>
              <li>Lodge a complaint with a data protection authority.</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, email us at <a href="mailto:digipromix.ai@gmail.com" className="text-blue-600 hover:underline">digipromix.ai@gmail.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">8. Children's Privacy</h2>
            <p>
              DigiPromix is not directed at individuals under 16. We do not knowingly collect personal data
              from children. If you believe a child has provided us with personal data, contact us and we
              will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">9. International Data Transfers</h2>
            <p>
              Your data may be processed in countries other than your own, including the United States and
              the European Union (where Supabase, Vercel, and Google operate). We rely on Standard Contractual
              Clauses and other lawful transfer mechanisms to protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">10. Changes to this Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The "Last updated" date at the top reflects
              the latest revision. Material changes will be notified via email or in-app notice before they
              take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">11. Contact</h2>
            <p>Questions, requests, or complaints about this policy?</p>
            <div className="mt-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              <p className="text-sm">
                <strong>DigiPromix AI</strong><br />
                Email: <a href="mailto:digipromix.ai@gmail.com" className="text-blue-600 hover:underline">digipromix.ai@gmail.com</a><br />
                Website: <a href="https://www.digipromix.com" className="text-blue-600 hover:underline">www.digipromix.com</a>
              </p>
            </div>
          </section>

        </div>

        {/* Footer link to terms */}
        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <Link to="/terms" className="text-sm text-blue-600 hover:underline">
            View Terms of Service →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} DigiPromix AI. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <Link to="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-700">Terms</Link>
            <Link to="/docs" className="hover:text-gray-700">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
