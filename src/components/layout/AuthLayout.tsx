import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const FEATURES = [
  'Real-time competitor change detection',
  'AI-generated counter-campaigns',
  'Revenue opportunity scoring',
]

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen flex bg-surface-card">
      {/* LEFT — Branding panel */}
      <div className="hidden lg:flex w-1/2 bg-gradient-brand flex-col justify-between p-16 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[26px] filled">insights</span>
            </div>
            <span className="text-xl font-extrabold tracking-tight">DigiPromix AI</span>
          </div>

          <div className="max-w-lg">
            <h1 className="text-white text-5xl font-black leading-tight tracking-tight mb-6">
              Stay one step ahead of every competitor.
            </h1>
            <p className="text-indigo-100 text-lg mb-10 leading-relaxed">
              Track competitor changes in real time, score revenue opportunities with AI, and launch counter-campaigns before they capture the market.
            </p>
            <div className="flex flex-col gap-4">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <div className="bg-white/20 p-1 rounded-full">
                    <span className="material-symbols-outlined text-white text-sm">check</span>
                  </div>
                  <p className="text-white text-base font-medium">{f}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/10 max-w-xl">
          <div className="flex gap-0.5 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="material-symbols-outlined text-indigo-200 text-[18px] filled">star</span>
            ))}
          </div>
          <p className="text-white text-lg leading-relaxed italic">
            "DigiPromix caught a competitor's price drop within the hour and had a counter-campaign live before lunch."
          </p>
        </div>
      </div>

      {/* RIGHT — Form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-16">
        <div className="w-full max-w-[440px] flex flex-col gap-8">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px] filled">insights</span>
            </div>
            <span className="text-lg font-extrabold tracking-tight text-on-surface">DigiPromix AI</span>
          </Link>

          <div>
            <h2 className="text-3xl font-bold text-on-surface mb-2 text-balance">{title}</h2>
            {subtitle && <p className="text-on-surface-variant text-base text-pretty">{subtitle}</p>}
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
