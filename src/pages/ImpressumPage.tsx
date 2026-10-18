import { Link } from 'react-router-dom'
import { Building2, ArrowLeft } from 'lucide-react'

export function ImpressumPage() {
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
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <Building2 size={13} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Legal Notice</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2">Impressum</h1>
          <p className="text-sm text-gray-500">Legal notice (provider identification) for DigiPromix AI</p>
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-6">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Service provider</h2>
            <p>
              DigiPromix AI is operated by:<br />
              <strong>Glyco IT UG (haftungsbeschränkt)</strong><br />
              Kolonnenstraße 8<br />
              10827 Berlin<br />
              Germany
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Contact</h2>
            <p>
              Telephone: <a href="tel:+4915775525103" className="text-blue-600 hover:underline">+49 (0)1577 5525103</a><br />
              E-mail: <a href="mailto:info@glycoit.com" className="text-blue-600 hover:underline">info@glycoit.com</a><br />
              Website: <a href="https://www.glycoit.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.glycoit.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Represented by</h2>
            <p>Managing Director (Geschäftsführer): Mehmooda Jasmine</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Commercial register</h2>
            <p>
              Registry court: Amtsgericht Charlottenburg (Berlin)<br />
              Registration number: HRB 278607 B
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Tax information</h2>
            <p>
              Tax number (Steuernummer): 29/309/31552<br />
              VAT ID (USt-IdNr.): DE459216785
            </p>
          </section>
        </div>

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
            <Link to="/impressum" className="hover:text-gray-700">Impressum</Link>
            <Link to="/docs" className="hover:text-gray-700">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
