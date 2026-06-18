import { Link } from 'react-router-dom'
import { FileText, ArrowLeft } from 'lucide-react'

export function TermsPage() {
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
          <Link to="/">
            <img src="/digipromix-logo.png" alt="DigiPromix AI" className="h-8 w-auto object-contain" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">

        {/* Title */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100">
            <FileText size={13} className="text-violet-600" />
            <span className="text-xs font-semibold text-violet-700">Terms of Service</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-6">

          <section>
            <p className="text-base">
              These Terms of Service ("Terms") govern your use of DigiPromix AI ("DigiPromix", "the Service",
              "we", "our", "us"), a competitor monitoring and marketing automation platform available at
              <strong> www.digipromix.com</strong>. By creating an account or using the Service, you agree to
              these Terms. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">1. Eligibility</h2>
            <p>
              You must be at least 16 years old and have the legal capacity to enter a binding contract to
              use DigiPromix. If you use the Service on behalf of an organisation, you confirm you are
              authorised to bind that organisation to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">2. Account Registration</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>You must provide accurate, complete information when creating an account.</li>
              <li>You are responsible for safeguarding your password and any activity under your account.</li>
              <li>You must notify us immediately of any unauthorised use of your account.</li>
              <li>One person or legal entity per account; sharing credentials is not allowed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">3. The Service</h2>
            <p>
              DigiPromix lets you (a) monitor publicly accessible competitor websites, (b) generate AI-powered
              counter-campaigns based on detected changes, (c) launch and manage advertising campaigns on
              third-party platforms (Google Ads, Meta Ads) you have explicitly connected, and (d) capture
              leads via published landing pages.
            </p>
            <p className="mt-3">
              Features may be added, removed, or modified at any time. We aim for high availability but do
              not guarantee uninterrupted service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">4. Acceptable Use</h2>
            <p>You agree NOT to:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li>Use the Service for any unlawful, fraudulent, deceptive, or harmful purpose.</li>
              <li>Monitor websites in violation of their robots.txt, terms of service, or applicable laws.</li>
              <li>Generate or publish ad copy that infringes third-party trademarks, makes false comparative claims, or violates advertising regulations (FTC, ASCI, etc.).</li>
              <li>Send spam, unsolicited bulk messages, or malicious content via the Service.</li>
              <li>Attempt to reverse-engineer, scrape, or circumvent security or rate-limit controls.</li>
              <li>Resell or sublicense the Service without our written permission.</li>
              <li>Upload viruses, malware, or interfere with other users' use of the Service.</li>
              <li>Impersonate any person or entity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">5. Third-Party Services</h2>
            <p>
              DigiPromix integrates with third-party platforms including <strong>Google Ads, Meta Ads,
              Google Gemini AI, and Google Workspace (Gmail)</strong>. Your use of those services is
              governed by their own terms:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li><a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google Terms of Service</a></li>
              <li><a href="https://www.facebook.com/legal/terms" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Meta Platforms Terms</a></li>
              <li><a href="https://ai.google.dev/terms" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google AI / Gemini Terms</a></li>
            </ul>
            <p className="mt-3">
              You authorise DigiPromix to act on your behalf on these platforms only to the extent of the
              actions you initiate inside our application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">6. AI-Generated Content</h2>
            <p>
              DigiPromix uses Google Gemini AI to generate ad copy, headlines, descriptions, and landing
              page content based on inputs you provide. While we instruct the AI to comply with advertising
              regulations and avoid competitor names, AI output may contain errors, inaccuracies, or
              compliance issues.
            </p>
            <p className="mt-3">
              <strong>You are solely responsible</strong> for reviewing AI-generated content before publishing,
              advertising, or using it commercially. We do not warrant that AI output is accurate, lawful,
              non-infringing, or fit for any particular purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">7. Intellectual Property</h2>
            <p>
              <strong>Our IP:</strong> The DigiPromix software, brand, logos, and trademarks are owned by us.
              These Terms grant you a limited, non-exclusive, non-transferable, revocable licence to use
              the Service.
            </p>
            <p className="mt-3">
              <strong>Your content:</strong> You retain ownership of all content you upload (competitor lists,
              campaigns, landing pages, etc.). By using the Service, you grant us a limited licence to host,
              display, process, and transmit your content as needed to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">8. Fees and Billing</h2>
            <p>
              Some features of DigiPromix may require a paid subscription. If you subscribe to a paid plan:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li>You authorise us to charge the payment method you provide on a recurring basis.</li>
              <li>Fees are non-refundable except where required by law.</li>
              <li>We may change pricing with at least 30 days' notice; price changes take effect at the next billing cycle.</li>
              <li>You are responsible for any taxes applicable to your subscription.</li>
              <li>Advertising spend on Google Ads and Meta Ads is billed directly by those platforms — we do not collect or process ad spend.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">9. Termination</h2>
            <p>
              You may terminate your account at any time from Settings or by contacting us. We may suspend
              or terminate your account immediately, without notice, if you breach these Terms, fail to pay
              fees, or use the Service in a manner that puts us or other users at risk.
            </p>
            <p className="mt-3">
              On termination: your access ends, paid features stop, and your data is deleted within 30 days
              (subject to legal retention obligations).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">10. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS
              OR IMPLIED. WE DISCLAIM ALL WARRANTIES INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING.
            </p>
            <p className="mt-3">
              We do not warrant that the Service will be uninterrupted, error-free, secure from all threats,
              or that ads launched through the Service will produce specific results.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, DIGIPROMIX, ITS OFFICERS, EMPLOYEES, AND AGENTS WILL
              NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
              INCLUDING LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT
              OF OR IN CONNECTION WITH THE SERVICE.
            </p>
            <p className="mt-3">
              OUR TOTAL LIABILITY FOR ANY CLAIM UNDER THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE
              FEES YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) USD $100.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">12. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless DigiPromix from any claims, damages, losses, or
              expenses arising out of (a) your use of the Service, (b) your violation of these Terms,
              (c) your violation of any third-party rights, or (d) your AI-generated or published content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">13. Governing Law and Disputes</h2>
            <p>
              These Terms are governed by the laws of India, without regard to conflict-of-law principles.
              Any dispute arising under these Terms will be resolved exclusively in the courts of
              Bangalore, Karnataka, India, unless mandatory consumer protection laws in your jurisdiction
              require otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">14. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. The "Last updated" date at the top reflects the
              latest revision. Material changes will be notified by email or in-app notice at least 14 days
              before they take effect. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">15. Miscellaneous</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Entire agreement:</strong> these Terms and our Privacy Policy form the entire agreement between you and DigiPromix.</li>
              <li><strong>Severability:</strong> if any provision is unenforceable, the remaining provisions remain in effect.</li>
              <li><strong>No waiver:</strong> our failure to enforce any right does not waive that right.</li>
              <li><strong>Assignment:</strong> you may not assign these Terms without our consent. We may assign them in connection with a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">16. Contact</h2>
            <p>For questions about these Terms:</p>
            <div className="mt-3 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              <p className="text-sm">
                <strong>DigiPromix AI</strong><br />
                Email: <a href="mailto:digipromix.ai@gmail.com" className="text-blue-600 hover:underline">digipromix.ai@gmail.com</a><br />
                Website: <a href="https://www.digipromix.com" className="text-blue-600 hover:underline">www.digipromix.com</a>
              </p>
            </div>
          </section>

        </div>

        {/* Footer link to privacy */}
        <div className="mt-12 pt-6 border-t border-gray-100 text-center">
          <Link to="/privacy" className="text-sm text-blue-600 hover:underline">
            View Privacy Policy →
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
