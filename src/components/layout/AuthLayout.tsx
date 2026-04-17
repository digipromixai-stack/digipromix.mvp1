import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* Layered gradient + mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-white" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-mesh opacity-90" aria-hidden="true" />
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 mb-5 group"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand shadow-soft-md group-hover:shadow-soft-lg transition-shadow">
              <TrendingUp size={20} className="text-white" strokeWidth={2.25} />
            </span>
            <span className="text-2xl font-bold tracking-tight text-gray-900">Digipromix</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="text-gray-500 text-sm sm:text-base mt-2 text-pretty">{subtitle}</p>
          )}
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-soft-xl ring-1 ring-gray-200/70 p-6 sm:p-8">
          {children}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Competitive intelligence, simplified.
        </p>
      </div>
    </div>
  )
}
