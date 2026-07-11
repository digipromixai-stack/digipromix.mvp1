import { Link } from 'react-router-dom'
import {
  Zap, ArrowRight, CheckCircle2, Shield, Star, ChevronRight,
  Target, TrendingUp, Megaphone, Users, BarChart2, Bell,
  Globe, Rocket, Eye, Building2, Heart, Home, GraduationCap,
  ShoppingCart, UtensilsCrossed, MousePointerClick, Search,
  Play, Lock, Clock,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Industries', href: '#industries' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
]

const HOW_IT_WORKS = [
  {
    number: '01',
    icon: Search,
    title: 'Monitor Competitors',
    desc: 'Track competitor offers, campaigns, landing pages, pricing changes, and SEO activity in real time — automatically, 24/7.',
  },
  {
    number: '02',
    icon: Target,
    title: 'AI Detects Opportunities',
    desc: 'The platform identifies high-impact business opportunities and recommends the next best growth action before your competitors gain ground.',
  },
  {
    number: '03',
    icon: Megaphone,
    title: 'Launch Campaigns Instantly',
    desc: 'Generate AI-powered ads, landing pages, email campaigns, and social promotions in minutes — push directly to Google Ads and Meta.',
  },
  {
    number: '04',
    icon: Users,
    title: 'Capture & Manage Leads',
    desc: 'Collect leads directly inside DigiPromix AI and track campaign performance from one unified dashboard.',
  },
]

const INDUSTRIES = [
  {
    icon: Home,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    title: 'Real Estate',
    desc: 'Monitor competitor property launches and generate counter campaigns instantly. Win more listings before rivals even respond.',
  },
  {
    icon: Heart,
    color: 'text-primary',
    bg: 'bg-indigo-tint',
    border: 'border-primary/20',
    title: 'Healthcare',
    desc: 'Promote medical services, campaigns, and appointment-focused lead funnels that convert patients faster.',
  },
  {
    icon: ShoppingCart,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    title: 'Retail & Supermarkets',
    desc: 'Track pricing changes, seasonal offers, and competitor promotions automatically. React in minutes, not days.',
  },
  {
    icon: GraduationCap,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
    title: 'Education',
    desc: 'Launch enrollment campaigns and capture student inquiries faster with AI-generated admissions funnels.',
  },
  {
    icon: UtensilsCrossed,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    title: 'Restaurants & Local',
    desc: 'Promote offers, events, and customer campaigns with AI-generated marketing assets that fill tables and boost foot traffic.',
  },
  {
    icon: Building2,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
    title: 'Modern Enterprises',
    desc: 'Unified competitor intelligence and growth automation at scale — multi-market, multi-team, one platform.',
  },
]

const FEATURES = [
  { icon: Eye,            label: 'Competitor Intelligence Dashboard' },
  { icon: Zap,            label: 'AI Campaign Generator' },
  { icon: Globe,          label: 'Landing Page Builder' },
  { icon: Megaphone,      label: 'Google & Meta Ads Automation' },
  { icon: Users,          label: 'AI Lead Capture System' },
  { icon: Search,         label: 'SEO & Website Audit' },
  { icon: TrendingUp,     label: 'Revenue Opportunity Engine' },
  { icon: Bell,           label: 'Real-Time Alerts & Insights' },
  { icon: BarChart2,      label: 'Performance Analytics' },
  { icon: MousePointerClick, label: 'Multi-Channel Campaign Launching' },
]

const PRICING = [
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    desc: 'Perfect for small businesses monitoring 1–3 competitors.',
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
    desc: 'For growth-focused teams who need real-time competitive intelligence.',
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

const TAGLINE = 'Detect competitor moves. Launch AI-powered campaigns. Capture more leads.'

export function MarketingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/digipromix-logo.png" alt="DigiPromix AI" className="h-9 w-auto object-contain" />
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} className="text-sm text-on-surface-variant hover:text-on-surface transition-colors font-medium">
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link
              to="/register"
              className="text-sm font-medium text-white bg-gradient-brand px-4 py-2 rounded-lg hover:brightness-105 transition-all shadow-soft"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-indigo-tint0/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-indigo-tint border border-primary/20 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-6 animate-fade-in">
            <span className="w-1.5 h-1.5 bg-indigo-tint0 rounded-full animate-pulse" />
            AI Growth & Competitor Intelligence Platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-on-surface leading-tight tracking-tight animate-fade-in-up">
            AI-Powered Growth Engine{' '}
            <span className="bg-gradient-brand bg-clip-text text-transparent">
              for Modern Businesses
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed animate-fade-in-up">
            Track competitors, detect market opportunities, launch AI-generated campaigns, and
            capture high-intent leads automatically — all from one platform.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white bg-gradient-brand px-6 py-3 rounded-xl font-semibold text-base hover:brightness-105 hover:shadow-soft-md transition-all shadow-soft"
            >
              Start Free Trial
              <ArrowRight size={16} />
            </Link>
            <a
              href="mailto:digipromix.ai@gmail.com?subject=Book%20a%20Live%20Demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-on-surface bg-white border border-border-subtle px-6 py-3 rounded-xl font-semibold text-base hover:bg-surface-container-low transition-all shadow-soft"
            >
              <Play size={14} className="text-on-surface-variant" />
              Book Live Demo
            </a>
          </div>

          <p className="mt-4 text-xs text-on-surface-variant">No credit card required · 14-day free trial</p>

          <p className="mt-6 text-sm font-semibold text-primary bg-indigo-tint border border-primary/20 inline-block px-4 py-2 rounded-full animate-fade-in-up">
            Built for Real Estate · Healthcare · Retail · Education · Restaurants & Modern Enterprises
          </p>
        </div>

        {/* Hero UI mockup */}
        <div className="max-w-5xl mx-auto mt-16 relative animate-fade-in-up">
          <div className="rounded-2xl border border-border-subtle bg-white shadow-soft-xl overflow-hidden">
            <div className="h-10 bg-surface-container-low border-b border-border-subtle flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-surface-container-low rounded-md h-5 w-48 text-xs text-on-surface-variant flex items-center px-2">app.digipromix.com</div>
              </div>
            </div>
            <div className="bg-surface-container-low p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 bg-white rounded-xl border border-orange-200 border-l-4 border-l-orange-400 p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Opportunity Detected</span>
                      <span className="text-xs text-on-surface-variant">2 min ago</span>
                    </div>
                    <p className="text-sm font-semibold text-on-surface">Competitor launched "Summer Sale 40% Off" campaign</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">acme-competitor.com — Revenue Opportunity Score: 92 · Promo: SUMMER40</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-white bg-gradient-brand px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Rocket size={10} />
                    Counter
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="bg-white rounded-xl border border-border-subtle p-3 shadow-soft text-center">
                  <p className="text-2xl font-bold text-on-surface">12</p>
                  <p className="text-xs text-on-surface-variant">Opportunities today</p>
                </div>
                <div className="bg-white rounded-xl border border-border-subtle p-3 shadow-soft text-center">
                  <p className="text-2xl font-bold text-emerald-600">3</p>
                  <p className="text-xs text-on-surface-variant">Campaigns launched</p>
                </div>
              </div>
              <div className="sm:col-span-3 bg-white rounded-xl border border-border-subtle p-4 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-gradient-brand flex items-center justify-center">
                    <Zap size={12} className="text-white" />
                  </div>
                  <p className="text-sm font-semibold text-on-surface">AI-Generated Counter Campaign</p>
                  <span className="ml-auto text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    Ready to launch
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-surface-container-low rounded-lg p-2">
                    <p className="text-on-surface-variant mb-1">Headline</p>
                    <p className="font-semibold text-on-surface">Beat Their Summer Deal</p>
                  </div>
                  <div className="bg-surface-container-low rounded-lg p-2">
                    <p className="text-on-surface-variant mb-1">Offer</p>
                    <p className="font-semibold text-on-surface">45% Off + Free Shipping</p>
                  </div>
                  <div className="bg-surface-container-low rounded-lg p-2">
                    <p className="text-on-surface-variant mb-1">Budget</p>
                    <p className="font-semibold text-on-surface">$15/day · Google Ads</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Turn Competitor Activity Into Revenue ─────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-surface-container-low/60">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Competitive Edge</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-6">
                Turn Competitor Activity Into Revenue Opportunities
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-6">
                DigiPromix AI continuously monitors competitor campaigns, pricing changes, landing pages,
                promotions, and digital activity in real time. When market opportunities are detected,
                the platform helps businesses instantly generate:
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'AI-powered counter campaigns',
                  'High-converting landing pages',
                  'Google & Meta ad creatives',
                  'Lead capture funnels',
                  'Revenue-focused growth recommendations',
                ].map(item => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-gradient-brand flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-sm font-medium text-on-surface">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-semibold text-primary italic">
                "{TAGLINE}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { value: '< 5 min', label: 'Response time to competitor move', color: 'text-primary' },
                { value: '10×', label: 'Faster campaign creation vs manual', color: 'text-indigo-600' },
                { value: '2 clicks', label: 'From competitor change to live ad', color: 'text-violet-600' },
                { value: '24/7', label: 'Continuous market intelligence', color: 'text-emerald-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-border-subtle p-6 shadow-soft text-center">
                  <p className={`text-3xl font-bold ${s.color} mb-2`}>{s.value}</p>
                  <p className="text-xs text-on-surface-variant leading-snug">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              How DigiPromix AI Works
            </h2>
            <p className="mt-4 text-on-surface-variant max-w-xl mx-auto">
              {TAGLINE}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.number} className="relative bg-white rounded-2xl border border-border-subtle p-6 shadow-soft hover:shadow-soft-md transition-shadow group text-center">
                <div className="relative inline-flex mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-tint flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                    <s.icon size={24} className="text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-brand text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-bold text-on-surface text-base mb-2">{s.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Industries ───────────────────────────────────────────────── */}
      <section id="industries" className="py-24 px-4 sm:px-6 bg-surface-container-low/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Industries</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              Built for Growth-Focused Industries
            </h2>
            <p className="mt-4 text-on-surface-variant max-w-xl mx-auto">
              From real estate to retail, DigiPromix AI helps every business detect competitor moves, launch smarter campaigns, and capture more leads.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {INDUSTRIES.map(ind => (
              <div key={ind.title} className={`bg-white rounded-2xl border ${ind.border} p-6 shadow-soft hover:shadow-soft-md transition-shadow group`}>
                <div className={`w-10 h-10 rounded-xl ${ind.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <ind.icon size={20} className={ind.color} />
                </div>
                <h3 className="font-semibold text-on-surface mb-2">{ind.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{ind.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              Everything You Need to Grow Digitally
            </h2>
            <p className="mt-4 text-on-surface-variant max-w-xl mx-auto">
              One unified platform — competitor intelligence, campaign automation, and lead generation working together.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {FEATURES.map(f => (
              <div key={f.label} className="bg-white rounded-2xl border border-border-subtle p-5 shadow-soft hover:shadow-soft-md transition-shadow group flex flex-col items-center text-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-tint flex items-center justify-center group-hover:scale-110 transition-transform">
                  <f.icon size={18} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-on-surface leading-snug">{f.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-base font-semibold text-primary italic">"{TAGLINE}"</p>
          </div>
        </div>
      </section>

      {/* ── More Than Analytics ───────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-surface-container-low/60">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">The Difference</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-6">
            More Than Analytics. More Than Marketing.
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed mb-10">
            Most tools only show reports.<br />
            <strong className="text-on-surface">DigiPromix AI helps businesses take action.</strong>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              {
                title: 'Competitor Intelligence',
                desc: 'Real-time monitoring of competitor campaigns, offers, pricing, and landing pages — scored by revenue impact.',
                icon: Eye,
                color: 'text-primary',
                bg: 'bg-indigo-tint',
              },
              {
                title: 'Campaign Automation',
                desc: 'AI-generated ads, landing pages, and social content ready to launch to Google Ads and Meta in minutes.',
                icon: Zap,
                color: 'text-indigo-600',
                bg: 'bg-indigo-50',
              },
              {
                title: 'Lead Generation',
                desc: 'Built-in lead capture funnels that collect, track, and qualify high-intent leads from every campaign.',
                icon: TrendingUp,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
              },
            ].map(item => (
              <div key={item.title} className="bg-white rounded-2xl border border-border-subtle p-6 shadow-soft">
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                  <item.icon size={20} className={item.color} />
                </div>
                <h3 className="font-semibold text-on-surface mb-2">{item.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-on-surface-variant max-w-xl mx-auto">
            From detecting competitor campaigns to launching AI-generated growth campaigns,
            DigiPromix AI combines competitor intelligence, campaign automation, and lead generation
            into one unified platform.
          </p>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Results</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              Businesses Growing Faster With DigiPromix AI
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.author} className="bg-white rounded-2xl border border-border-subtle p-6 shadow-soft hover:shadow-soft-md transition-shadow">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-on-surface leading-relaxed mb-5">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{t.author}</p>
                  <p className="text-xs text-on-surface-variant">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-surface-container-low/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-on-surface-variant">Start free. Upgrade when you're ready. No hidden fees.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {PRICING.map(p => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 transition-shadow ${
                  p.highlight
                    ? 'border-primary/30 bg-gradient-to-b from-indigo-tint to-white shadow-soft-lg ring-1 ring-primary/20 relative'
                    : 'border-border-subtle bg-white shadow-soft hover:shadow-soft-md'
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-brand text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <p className="font-bold text-on-surface text-lg">{p.name}</p>
                <p className="text-xs text-on-surface-variant mt-1 mb-5">{p.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-on-surface">{p.price}</span>
                  <span className="text-on-surface-variant text-sm">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-on-surface-variant">
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
                      : 'bg-white border border-border-subtle text-on-surface hover:bg-surface-container-low'
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
          <div className="relative rounded-3xl bg-gradient-brand p-10 sm:p-16 text-center overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <Shield size={12} />
                14-day free trial · No credit card required
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
                Ready to Grow Faster With AI?
              </h2>
              <p className="text-white/80 text-lg max-w-xl mx-auto mb-3">
                Launch smarter campaigns, respond to competitors faster, and generate more qualified
                leads using AI-powered business growth automation.
              </p>
              <p className="text-white/70 text-sm font-medium italic mb-8">"{TAGLINE}"</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-primary font-semibold px-6 py-3 rounded-xl hover:bg-indigo-tint transition-colors shadow-soft-md"
                >
                  Start Free Trial
                  <ChevronRight size={16} />
                </Link>
                <a
                  href="mailto:digipromix.ai@gmail.com?subject=Schedule%20Demo"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors"
                >
                  Schedule Demo
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border-subtle py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div className="flex items-center">
              <img src="/digipromix-logo.png" alt="DigiPromix AI" className="h-8 w-auto object-contain" />
            </div>

            <div className="flex items-center gap-6 text-sm text-on-surface-variant flex-wrap justify-center">
              <a href="#how-it-works" className="hover:text-on-surface-variant transition-colors">How It Works</a>
              <a href="#industries" className="hover:text-on-surface-variant transition-colors">Industries</a>
              <a href="#features" className="hover:text-on-surface-variant transition-colors">Features</a>
              <a href="#pricing" className="hover:text-on-surface-variant transition-colors">Pricing</a>
              <Link to="/docs" className="hover:text-on-surface-variant transition-colors">Docs</Link>
              <Link to="/privacy" className="hover:text-on-surface-variant transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-on-surface-variant transition-colors">Terms of Service</Link>
              <Link to="/login" className="hover:text-on-surface-variant transition-colors">Sign in</Link>
              <Link to="/register" className="hover:text-on-surface-variant transition-colors">Sign up</Link>
            </div>

            <p className="text-xs text-on-surface-variant">© {new Date().getFullYear()} DigiPromix AI</p>
          </div>

          <div className="border-t border-border-subtle pt-6 text-center space-y-2">
            <p className="text-xs text-on-surface-variant max-w-2xl mx-auto">
              DigiPromix AI is an AI-powered competitor intelligence and growth automation platform.
              The platform helps businesses monitor competitors, launch AI-generated campaigns,
              automate lead generation, and accelerate digital growth through real-time market
              intelligence and campaign automation.
            </p>
            <p className="text-xs text-on-surface-variant">
              DigiPromix AI — a product by{' '}
              <a
                href="https://glycoit.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Glyco IT Solutions
              </a>
            </p>
            <div className="flex items-center justify-center gap-4 pt-2 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1"><Lock size={10} /> Secure & Private</span>
              <span className="flex items-center gap-1"><Shield size={10} /> No Spam</span>
              <span className="flex items-center gap-1"><Clock size={10} /> 24h Support</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
