import { Link } from 'react-router-dom'
import {
  ArrowRight, CheckCircle2, Shield, Sparkles,
  Search, Target, Rocket, Users, Building2, Heart,
  ShoppingBag, GraduationCap, UtensilsCrossed,
  Bot, Megaphone, BellRing, BarChart3,
  TrendingUp, Layout, Activity, Play,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Industries',  href: '#industries'   },
  { label: 'Features',    href: '#features'     },
  { label: 'Docs',        href: '/docs'         },
]

// ─── How It Works (4 steps) ──────────────────────────────────────────────
const STEPS = [
  {
    icon:  Search,
    color: 'from-blue-500 to-indigo-500',
    title: 'Monitor Competitors',
    desc:  'Track competitor offers, campaigns, landing pages, pricing changes, and SEO activity in real time.',
  },
  {
    icon:  Bot,
    color: 'from-violet-500 to-purple-500',
    title: 'AI Detects Opportunities',
    desc:  'The platform identifies high-impact business opportunities and recommends the next best growth action.',
  },
  {
    icon:  Rocket,
    color: 'from-orange-500 to-rose-500',
    title: 'Launch Campaigns Instantly',
    desc:  'Generate AI-powered ads, landing pages, email campaigns, and social promotions in minutes.',
  },
  {
    icon:  Target,
    color: 'from-emerald-500 to-teal-500',
    title: 'Capture & Manage Leads',
    desc:  'Collect leads directly inside DigiPromix AI and track campaign performance from one dashboard.',
  },
]

// ─── Industries (5 cards) ────────────────────────────────────────────────
const INDUSTRIES = [
  { icon: Building2,        color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-100',  title: 'Real Estate',                desc: 'Monitor competitor property launches and generate counter campaigns instantly.' },
  { icon: Heart,            color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-100',   title: 'Healthcare',                 desc: 'Promote medical services, campaigns, and appointment-focused lead funnels.' },
  { icon: ShoppingBag,      color: 'text-rose-600',   bg: 'bg-rose-50',   ring: 'ring-rose-100',   title: 'Retail & Supermarkets',      desc: 'Track pricing changes, seasonal offers, and competitor promotions automatically.' },
  { icon: GraduationCap,    color: 'text-violet-600', bg: 'bg-violet-50', ring: 'ring-violet-100', title: 'Education',                  desc: 'Launch enrollment campaigns and capture student inquiries faster.' },
  { icon: UtensilsCrossed,  color: 'text-orange-600', bg: 'bg-orange-50', ring: 'ring-orange-100', title: 'Restaurants & Local',        desc: 'Promote offers, events, and customer campaigns with AI-generated marketing assets.' },
]

// ─── Features (10) ───────────────────────────────────────────────────────
const FEATURES = [
  { icon: Activity,     title: 'Competitor Intelligence Dashboard' },
  { icon: Sparkles,     title: 'AI Campaign Generator'             },
  { icon: Layout,       title: 'Landing Page Builder'              },
  { icon: Megaphone,    title: 'Google & Meta Ads Automation'      },
  { icon: Users,        title: 'AI Lead Capture System'            },
  { icon: Search,       title: 'SEO & Website Audit'               },
  { icon: TrendingUp,   title: 'Revenue Opportunity Engine'        },
  { icon: BellRing,     title: 'Real-Time Alerts & Insights'       },
  { icon: BarChart3,    title: 'Performance Analytics'             },
  { icon: Rocket,       title: 'Multi-Channel Campaign Launching'  },
]

// ─── Tagline (repeated) ─────────────────────────────────────────────────
const TAGLINE = 'Detect competitor moves. Launch AI-powered campaigns. Capture more leads.'

// ───────────────────────────────────────────────────────────────────────
export function MarketingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">

      {/* ─── Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="DigiPromix AI" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg tracking-tight">DigiPromix <span className="text-blue-600">AI</span></span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm text-gray-600">
            {NAV_LINKS.map(l =>
              l.href.startsWith('/')
                ? <Link key={l.label} to={l.href} className="hover:text-gray-900 transition-colors">{l.label}</Link>
                : <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">Sign in</Link>
            <Link to="/register" className="text-sm font-semibold bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── 1. HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* decorative glow */}
        <div className="absolute -top-40 -right-40 w-[700px] h-[700px] bg-blue-200/40 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-purple-200/30 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 lg:pt-28 lg:pb-32 text-center">

          {/* badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs font-semibold tracking-wide text-blue-700">AI Growth & Competitor Intelligence Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            AI-Powered <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Growth Engine</span> for Modern Businesses
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Track competitors, detect market opportunities, launch AI-generated campaigns,
            and capture high-intent leads automatically — all from one platform.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Link to="/register"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 py-3.5 rounded-xl shadow-xl shadow-blue-500/30 transition-all active:scale-[0.98]">
              Start Free Trial
              <ArrowRight size={16} />
            </Link>
            <a href="mailto:digipromix.ai@gmail.com?subject=DigiPromix%20AI%20Demo%20Request"
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 font-bold px-6 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
              <Play size={14} />
              Book Live Demo
            </a>
          </div>

          {/* trust line */}
          <p className="text-xs sm:text-sm text-gray-500 max-w-2xl mx-auto">
            Built for <span className="font-semibold text-gray-700">Real Estate · Healthcare · Retail · Education · Automotive · Restaurants</span> & Modern Enterprises
          </p>

          {/* tagline ribbon */}
          <div className="mt-14 inline-block px-6 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold tracking-wide">
            {TAGLINE}
          </div>
        </div>
      </section>

      {/* ─── 2. WHAT MAKES YOU UNIQUE ────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-3">Why DigiPromix</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-6">
                Turn Competitor Activity Into <span className="text-blue-600">Revenue Opportunities</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                DigiPromix AI continuously monitors competitor campaigns, pricing changes,
                landing pages, promotions, and digital activity in real time. When market
                opportunities are detected, the platform helps businesses instantly generate:
              </p>
              <ul className="space-y-3">
                {[
                  'AI-powered counter campaigns',
                  'High-converting landing pages',
                  'Google & Meta ad creatives',
                  'Lead capture funnels',
                  'Revenue-focused growth recommendations',
                ].map(item => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-gray-800 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-base text-gray-600">
                Instead of manually watching the market, businesses can now react faster
                with AI-driven growth automation.
              </p>
            </div>

            {/* Visual mockup */}
            <div className="relative">
              <div className="rounded-3xl bg-white border border-gray-200 shadow-2xl p-6 space-y-3">
                {/* Mock alert card */}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Competitor detected — 2 min ago
                </div>
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                  <p className="text-sm font-bold text-red-900">Competitor launched 20% off promo</p>
                  <p className="text-xs text-red-700 mt-1">/pricing page · severity HIGH</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 pt-2">
                  <Sparkles size={12} className="text-blue-500" />
                  AI counter-campaign generated
                </div>
                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                  <p className="text-sm font-bold text-blue-900">"Save 25% — Limited Time"</p>
                  <p className="text-xs text-blue-700 mt-1">Google Ads · 5 keywords · ₹1,000 budget</p>
                </div>
                <button className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold shadow-lg">
                  Launch Campaign →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. HOW IT WORKS ─────────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-gray-100 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              How <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">DigiPromix AI</span> Works
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={s.title} className="relative p-6 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="text-xs font-bold text-gray-400 mb-1">STEP {i + 1}</div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── 4. INDUSTRIES ───────────────────────────────────────────── */}
      <section id="industries" className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-3">Industries</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              Built for Growth-Focused Industries
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {INDUSTRIES.map(ind => {
              const Icon = ind.icon
              return (
                <div key={ind.title} className={`p-6 rounded-2xl ${ind.bg} ring-1 ${ind.ring} hover:shadow-lg transition-shadow`}>
                  <div className={`inline-flex w-12 h-12 rounded-xl bg-white ${ind.color} items-center justify-center mb-4 shadow-sm`}>
                    <Icon size={22} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5">{ind.title}</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{ind.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── 5. FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="border-t border-gray-100 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              Everything You Need to <span className="text-blue-600">Grow Digitally</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="p-5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <Icon size={20} className="text-blue-600 mb-3" />
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{f.title}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── 6. POSITIONING ──────────────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-gradient-to-br from-gray-900 to-slate-900 text-white py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-white/5 border border-white/10">
            <Shield size={13} className="text-blue-400" />
            <span className="text-xs font-semibold text-blue-300">Unified Growth Platform</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-6 leading-tight">
            More Than Analytics. <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">More Than Marketing.</span>
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed mb-2">
            Most tools only show reports. <span className="font-bold text-white">DigiPromix AI helps businesses take action.</span>
          </p>
          <p className="text-base text-gray-400 leading-relaxed max-w-2xl mx-auto">
            From detecting competitor campaigns to launching AI-generated growth campaigns,
            DigiPromix AI combines competitor intelligence, campaign automation, and lead
            generation into one unified platform.
          </p>

          <div className="mt-10 inline-block px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold tracking-wide">
            {TAGLINE}
          </div>
        </div>
      </section>

      {/* ─── 7. FINAL CTA ────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-6">
            Ready to Grow Faster With AI?
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-2xl mx-auto">
            Launch smarter campaigns, respond to competitors faster, and generate more
            qualified leads using AI-powered business growth automation.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 py-3.5 rounded-xl shadow-xl shadow-blue-500/30 transition-all active:scale-[0.98]">
              Start Free Trial
              <ArrowRight size={16} />
            </Link>
            <a href="mailto:digipromix.ai@gmail.com?subject=DigiPromix%20AI%20Demo%20Request"
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 font-bold px-6 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
              Schedule Demo
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-gray-50 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo.svg" alt="DigiPromix AI" className="w-7 h-7 rounded-lg" />
                <span className="font-bold text-base">DigiPromix <span className="text-blue-600">AI</span></span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                AI-powered competitor intelligence and growth automation for modern businesses.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Product</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#features"     className="hover:text-gray-900">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-gray-900">How it works</a></li>
                <li><a href="#industries"   className="hover:text-gray-900">Industries</a></li>
                <li><Link to="/docs"        className="hover:text-gray-900">Documentation</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Company</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link to="/privacy" className="hover:text-gray-900">Privacy Policy</Link></li>
                <li><Link to="/terms"   className="hover:text-gray-900">Terms of Service</Link></li>
                <li><Link to="/login"   className="hover:text-gray-900">Sign in</Link></li>
                <li><Link to="/register" className="hover:text-gray-900">Sign up</Link></li>
              </ul>
            </div>
          </div>

          {/* Glyco IT attribution */}
          <div className="border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-600 leading-relaxed max-w-4xl">
              <strong>DigiPromix AI</strong> is an AI-powered competitor intelligence and growth
              automation platform developed by{' '}
              <a href="https://glycoit.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-semibold">
                Glyco IT Solutions
              </a>. The platform helps businesses monitor competitors, launch AI-generated
              campaigns, automate lead generation, and accelerate digital growth through
              real-time market intelligence and campaign automation.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-400">
                © {new Date().getFullYear()} DigiPromix AI · A product from{' '}
                <a href="https://glycoit.com" target="_blank" rel="noreferrer" className="hover:text-gray-600">Glyco IT</a>. All rights reserved.
              </p>
              <p className="text-xs text-gray-400">
                Detect competitor moves · Launch AI campaigns · Capture more leads
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
