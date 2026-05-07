import { Link } from 'react-router-dom'
import {
  Eye, Zap, Rocket, BarChart2, Bell, Globe, ArrowRight,
  CheckCircle2, Shield, Star, ChevronRight,
  Play, Target, Search, MousePointerClick,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
]

const FEATURES = [
  {
    icon: Eye,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    title: 'Real-Time Competitor Monitoring',
    desc: 'Track every change on your competitor\'s website — promotions, price drops, new landing pages, banner swaps — the moment they happen.',
  },
  {
    icon: Zap,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    title: 'AI-Powered Counter-Campaigns',
    desc: 'Gemini AI instantly generates tailored ad copy, headlines, keywords, and offers designed to outperform whatever your competitor just launched.',
  },
  {
    icon: Rocket,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    title: 'One-Click Ad Launch',
    desc: 'Push counter-campaigns directly to Google Ads and Meta Ads without leaving the dashboard. Budget, targeting, and creatives — all pre-filled.',
  },
  {
    icon: Bell,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    title: 'Smart Alerts',
    desc: 'Get notified instantly for high-severity moves — flash sales, coordinated campaign launches, competitor promo codes — so you never miss a beat.',
  },
  {
    icon: BarChart2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    title: 'Analytics & Insights',
    desc: 'Visualise competitor activity trends, score competitive pressure over time, and measure how quickly your team responds.',
  },
  {
    icon: Globe,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    title: 'Multi-Competitor Coverage',
    desc: 'Monitor unlimited competitors across any industry. Add any URL, set crawl frequency, and let Digipromix do the watching 24/7.',
  },
]

const STEPS = [
  {
    number: '01',
    icon: Search,
    title: 'Add Your Competitors',
    desc: 'Paste a competitor URL and choose which pages to monitor — homepage, pricing, promotions. We crawl them on your schedule.',
  },
  {
    number: '02',
    icon: Target,
    title: 'Get Instant Alerts',
    desc: 'The moment a change is detected, AI classifies it (promotion, price change, campaign launch) and scores its competitive severity.',
  },
  {
    number: '03',
    icon: MousePointerClick,
    title: 'Launch Your Counter-Ad',
    desc: 'Review the AI-generated campaign, set your budget, and hit Launch. Your ad is live in Google Ads or Meta Ads within seconds.',
  },
]

const STATS = [
  { value: '< 5 min', label: 'Average response time to competitor move' },
  { value: '10×', label: 'Faster campaign creation vs manual process' },
  { value: '2 clicks', label: 'From competitor change to live ad' },
]

const PRICING = [
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    desc: 'Perfect for small businesses monitoring 1-3 competitors.',
    features: [
      '3 competitors monitored',
      '10 pages per competitor',
      'Daily crawls',
      'AI campaign generation',
      'Google Ads integration',
      'Email alerts',
    ],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$79',
    period: '/mo',
    desc: 'For growing teams who need real-time competitive intelligence.',
    features: [
      '15 competitors monitored',
      'Unlimited pages',
      'Hourly crawls',
      'AI campaign generation',
      'Google Ads + Meta Ads',
      'Instant push alerts',
      'Analytics dashboard',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Agency',
    price: '$199',
    period: '/mo',
    desc: 'Built for agencies managing multiple client accounts.',
    features: [
      'Unlimited competitors',
      'Unlimited pages',
      'Real-time crawls',
      'White-label reports',
      'Multi-account support',
      'API access',
      'Dedicated support',
    ],
    cta: 'Contact sales',
    highlight: false,
  },
]

const TESTIMONIALS = [
  {
    quote: 'We caught a competitor\'s flash sale within minutes and launched a counter-promotion the same day. We\'ve never moved that fast before.',
    author: 'Sarah K.',
    role: 'Head of Marketing, eCommerce Brand',
    stars: 5,
  },
  {
    quote: 'The AI campaign generator is scary good. It reads the competitor\'s move and writes better ad copy than our own team could in 20 minutes.',
    author: 'Marcus T.',
    role: 'PPC Manager, Digital Agency',
    stars: 5,
  },
  {
    quote: 'Finally a tool that connects the dots — from detecting the threat to launching the response. Everything else just sends you an email.',
    author: 'Priya M.',
    role: 'Growth Lead, SaaS Startup',
    stars: 5,
  },
]

export function MarketingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">Digipromix</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium">
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link
              to="/register"
              className="text-sm font-medium text-white bg-gradient-brand px-4 py-2 rounded-lg hover:brightness-105 transition-all shadow-soft"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden">
        {/* background mesh */}
        <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          {/* badge */}
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 animate-fade-in">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            AI-powered competitive response platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 leading-tight tracking-tight animate-fade-in-up">
            Beat competitors to market{' '}
            <span className="bg-gradient-brand bg-clip-text text-transparent">
              every single time
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed animate-fade-in-up">
            Digipromix monitors your competitors 24/7, detects promotions and price changes in real time,
            and uses AI to generate and launch counter-campaigns to Google Ads and Meta — in minutes, not days.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white bg-gradient-brand px-6 py-3 rounded-xl font-semibold text-base hover:brightness-105 hover:shadow-soft-md transition-all shadow-soft"
            >
              Start monitoring free
              <ArrowRight size={16} />
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-700 bg-white border border-gray-200 px-6 py-3 rounded-xl font-semibold text-base hover:bg-gray-50 transition-all shadow-soft"
            >
              <Play size={14} className="text-gray-500" />
              See how it works
            </a>
          </div>

          <p className="mt-4 text-xs text-gray-400">No credit card required · 14-day free trial</p>
        </div>

        {/* Hero UI mockup */}
        <div className="max-w-5xl mx-auto mt-16 relative animate-fade-in-up">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-soft-xl overflow-hidden">
            {/* fake browser bar */}
            <div className="h-10 bg-gray-50 border-b border-gray-100 flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-gray-100 rounded-md h-5 w-48 text-xs text-gray-400 flex items-center px-2">app.digipromix.com</div>
              </div>
            </div>

            {/* fake dashboard */}
            <div className="bg-gray-50 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* alert card */}
              <div className="sm:col-span-2 bg-white rounded-xl border border-orange-200 border-l-4 border-l-orange-400 p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Campaign Launch</span>
                      <span className="text-xs text-gray-400">2 min ago</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">Competitor launched "Summer Sale 40% Off" campaign</p>
                    <p className="text-xs text-gray-500 mt-0.5">acme-competitor.com — Score 92/150 · Promo code: SUMMER40</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-white bg-gradient-brand px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Rocket size={10} />
                    Counter
                  </span>
                </div>
              </div>

              {/* stats */}
              <div className="flex flex-col gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-soft text-center">
                  <p className="text-2xl font-bold text-gray-900">12</p>
                  <p className="text-xs text-gray-500">Changes today</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-soft text-center">
                  <p className="text-2xl font-bold text-emerald-600">3</p>
                  <p className="text-xs text-gray-500">Ads launched</p>
                </div>
              </div>

              {/* AI campaign preview */}
              <div className="sm:col-span-3 bg-white rounded-xl border border-gray-100 p-4 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-gradient-brand flex items-center justify-center">
                    <Zap size={12} className="text-white" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">AI-Generated Counter Campaign</p>
                  <span className="ml-auto text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    Ready to launch
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 mb-1">Headline</p>
                    <p className="font-semibold text-gray-800">Beat Their Summer Deal</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 mb-1">Offer</p>
                    <p className="font-semibold text-gray-800">45% Off + Free Shipping</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-400 mb-1">Budget</p>
                    <p className="font-semibold text-gray-800">$15/day · Google Ads</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <p className="text-4xl font-bold bg-gradient-brand bg-clip-text text-transparent">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Everything you need to stay ahead
            </h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              From detection to response — Digipromix is the only platform that closes the loop between competitive intelligence and ad execution.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft hover:shadow-soft-md transition-shadow group">
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon size={20} className={f.color} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-gray-50/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              From threat to live ad in 3 steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* connector line */}
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-blue-200 via-indigo-200 to-violet-200" />

            {STEPS.map((s, i) => (
              <div key={s.number} className="relative text-center">
                <div className="relative inline-flex">
                  <div className="w-20 h-20 rounded-2xl bg-white border border-gray-100 shadow-soft-md flex items-center justify-center mx-auto mb-5">
                    <s.icon size={28} className="text-blue-600" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-brand text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Marketers love Digipromix
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.author} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft hover:shadow-soft-md transition-shadow">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-5">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.author}</p>
                  <p className="text-xs text-gray-400">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-gray-50/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-gray-500">Start free. Upgrade when you're ready. No hidden fees.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {PRICING.map(p => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 transition-shadow ${
                  p.highlight
                    ? 'border-blue-200 bg-gradient-to-b from-blue-50 to-white shadow-soft-lg ring-1 ring-blue-100 relative'
                    : 'border-gray-100 bg-white shadow-soft hover:shadow-soft-md'
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-brand text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <p className="font-bold text-gray-900 text-lg">{p.name}</p>
                <p className="text-xs text-gray-500 mt-1 mb-5">{p.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-gray-900">{p.price}</span>
                  <span className="text-gray-400 text-sm">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`block text-center text-sm font-semibold py-2.5 rounded-xl transition-all ${
                    p.highlight
                      ? 'bg-gradient-brand text-white hover:brightness-105 shadow-soft'
                      : 'bg-white border border-gray-200 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 p-10 sm:p-16 text-center overflow-hidden">
            {/* decorative blobs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <Shield size={12} />
                14-day free trial · No credit card required
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
                Start outpacing your competitors today
              </h2>
              <p className="text-blue-100 text-lg max-w-xl mx-auto mb-8">
                Join hundreds of marketers who react to competitive threats in minutes instead of days.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors shadow-soft-md"
                >
                  Get started for free
                  <ChevronRight size={16} />
                </Link>
                <Link
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">Digipromix</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-400 flex-wrap justify-center">
            <a href="#features" className="hover:text-gray-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-600 transition-colors">Pricing</a>
            <Link to="/docs" className="hover:text-gray-600 transition-colors">Docs</Link>
            <Link to="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-gray-600 transition-colors">Terms of Service</Link>
            <Link to="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link to="/register" className="hover:text-gray-600 transition-colors">Sign up</Link>
          </div>

          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Digipromix. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
