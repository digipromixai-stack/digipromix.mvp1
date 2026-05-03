import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Zap, Eye, Rocket, Bell, BarChart2, Globe, ArrowRight,
  CheckCircle2, ChevronRight, Copy, Check, Menu, X,
  Search, BookOpen, AlertTriangle,
  Key, HelpCircle,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Section {
  id: string
  label: string
  icon: React.ElementType
  items: { id: string; label: string }[]
}

// ── Sidebar nav ────────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: BookOpen,
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'quickstart', label: 'Quick Start' },
      { id: 'concepts', label: 'Core Concepts' },
    ],
  },
  {
    id: 'competitors',
    label: 'Competitors',
    icon: Globe,
    items: [
      { id: 'add-competitor', label: 'Adding a Competitor' },
      { id: 'monitored-pages', label: 'Monitored Pages' },
      { id: 'crawl-frequency', label: 'Crawl Frequency' },
    ],
  },
  {
    id: 'changes',
    label: 'Change Detection',
    icon: Eye,
    items: [
      { id: 'change-types', label: 'Change Types' },
      { id: 'severity', label: 'Severity Scoring' },
      { id: 'campaign-launch', label: 'Campaign Launch Detection' },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: Rocket,
    items: [
      { id: 'generating', label: 'Generating a Campaign' },
      { id: 'google-ads', label: 'Google Ads Launch' },
      { id: 'meta-ads', label: 'Meta Ads Launch' },
      { id: 'landing-pages', label: 'Landing Pages' },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: Bell,
    items: [
      { id: 'alert-preferences', label: 'Alert Preferences' },
      { id: 'webhooks', label: 'Webhooks' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Key,
    items: [
      { id: 'google-ads-setup', label: 'Google Ads Setup' },
      { id: 'meta-setup', label: 'Meta Ads Setup' },
      { id: 'gemini-setup', label: 'Gemini AI Setup' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart2,
    items: [{ id: 'analytics-overview', label: 'Analytics Overview' }],
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: HelpCircle,
    items: [{ id: 'faq-items', label: 'Frequently Asked Questions' }],
  },
]

// ── Code block ─────────────────────────────────────────────────────────────────
function CodeBlock({ code, lang = 'json' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative my-4 rounded-xl bg-gray-900 text-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60">
        <span className="text-xs text-gray-400 font-mono">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ── Callout ────────────────────────────────────────────────────────────────────
function Callout({ type = 'info', children }: { type?: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info:    { bg: 'bg-blue-50',   border: 'border-blue-200',  icon: 'text-blue-600',   label: 'Info',    Icon: CheckCircle2 },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200',icon: 'text-yellow-600', label: 'Warning', Icon: AlertTriangle },
    tip:     { bg: 'bg-emerald-50',border: 'border-emerald-200',icon: 'text-emerald-600',label: 'Tip',    Icon: Zap },
  }
  const s = styles[type]
  return (
    <div className={`my-5 rounded-xl border ${s.bg} ${s.border} p-4 flex gap-3`}>
      <s.Icon size={16} className={`${s.icon} shrink-0 mt-0.5`} />
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  )
}

// ── Step ───────────────────────────────────────────────────────────────────────
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 my-6">
      <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900 mb-1">{title}</p>
        <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────────
function Tag({ label, color = 'blue' }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-emerald-100 text-emerald-700',
    orange: 'bg-orange-100 text-orange-700',
    red:    'bg-red-100 text-red-700',
    purple: 'bg-violet-100 text-violet-700',
    gray:   'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${colors[color] ?? colors.blue}`}>
      {label}
    </span>
  )
}

// ── Change type table row ──────────────────────────────────────────────────────
function ChangeTypeRow({ badge, color, desc, trigger }: {
  badge: string; color: string; desc: string; trigger: string
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4"><Tag label={badge} color={color} /></td>
      <td className="py-3 pr-4 text-sm text-gray-700">{desc}</td>
      <td className="py-3 text-sm text-gray-500">{trigger}</td>
    </tr>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function DocsPage() {
  const [active, setActive] = useState('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    document.querySelectorAll('[data-doc-section]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
    setMobileOpen(false)
  }

  const filteredSections = SECTIONS.map(s => ({
    ...s,
    items: s.items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())),
  })).filter(s => s.items.length > 0)

  const Sidebar = () => (
    <aside className="w-64 shrink-0 flex flex-col gap-1">
      {/* Search */}
      <div className="relative mb-4">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search docs…"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filteredSections.map(s => (
        <div key={s.id} className="mb-2">
          <div className="flex items-center gap-2 px-2 py-1 mb-1">
            <s.icon size={13} className="text-gray-400" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{s.label}</span>
          </div>
          {s.items.map(i => (
            <button
              key={i.id}
              onClick={() => scrollTo(i.id)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-all ${
                active === i.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      ))}
    </aside>
  )

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">Digipromix</span>
          </Link>
          <span className="text-gray-300 hidden sm:block">/</span>
          <span className="text-sm text-gray-600 hidden sm:block font-medium">Documentation</span>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/login" className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              to="/register"
              className="text-sm font-medium text-white bg-gradient-brand px-3 py-1.5 rounded-lg hover:brightness-105 transition-all shadow-soft"
            >
              Get started
            </Link>
            <button
              className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile sidebar overlay ──────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-14 bottom-0 w-72 bg-white border-r border-gray-100 overflow-y-auto p-4">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-10 py-8">

        {/* ── Desktop sidebar ─────────────────────────────────────────── */}
        <div className="hidden lg:block sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto pb-8">
          <Sidebar />
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <main ref={contentRef} className="flex-1 min-w-0 max-w-3xl">

          {/* ═══ OVERVIEW ══════════════════════════════════════════════ */}
          <section id="overview" data-doc-section className="mb-16 scroll-mt-20">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <BookOpen size={11} />
              Getting Started
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              Digipromix Documentation
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-6">
              Digipromix is a real-time competitor monitoring and counter-campaign platform. It watches your competitors' websites around the clock, classifies every meaningful change using AI, and lets you launch counter-ads to Google Ads and Meta — all from a single dashboard.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: Eye, label: 'Competitor Monitoring', desc: 'Track changes 24/7' },
                { icon: Rocket, label: 'AI Campaigns', desc: 'Counter-ads in seconds' },
                { icon: BarChart2, label: 'Analytics', desc: 'Measure your response' },
              ].map(f => (
                <div key={f.label} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <f.icon size={18} className="text-blue-600 mb-2" />
                  <p className="font-semibold text-gray-900 text-sm">{f.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ QUICKSTART ════════════════════════════════════════════ */}
          <section id="quickstart" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Quick Start</h2>
            <p className="text-gray-500 mb-6">Be up and running in under 5 minutes.</p>
            <Step number={1} title="Create your account">
              Go to <Link to="/register" className="text-blue-600 hover:underline">app.digipromix.com/register</Link> and sign up with your email. No credit card required.
            </Step>
            <Step number={2} title="Add your first competitor">
              Navigate to <strong>Competitors → Add Competitor</strong>. Enter the competitor's name, website URL, and industry. Choose which pages to monitor (homepage, pricing, promotions).
            </Step>
            <Step number={3} title="Connect Google Ads (optional)">
              Go to <strong>Settings → Google Ads</strong> and click <em>Connect</em>. Follow the OAuth flow. This enables one-click campaign launching.
            </Step>
            <Step number={4} title="Wait for your first change alert">
              Digipromix will crawl your competitor's pages on the schedule you set. When a change is detected, you'll see it on the Dashboard and receive an alert.
            </Step>
            <Step number={5} title="Generate and launch a counter-campaign">
              Click <strong>Generate Campaign</strong> on any change card. Review the AI output, set your budget, and click <strong>Launch on Google Ads</strong>.
            </Step>
            <Callout type="tip">
              The first crawl happens within minutes of adding a competitor. Check the Dashboard after a few minutes to see your first baseline snapshot.
            </Callout>
          </section>

          {/* ═══ CONCEPTS ══════════════════════════════════════════════ */}
          <section id="concepts" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Core Concepts</h2>
            <p className="text-gray-500 mb-6">Understanding the key entities in Digipromix.</p>
            <div className="space-y-4">
              {[
                { term: 'Competitor', def: 'A business you want to watch. Each competitor has one or more Monitored Pages.' },
                { term: 'Monitored Page', def: 'A specific URL on a competitor\'s site that is regularly crawled and compared to its previous snapshot.' },
                { term: 'Snapshot', def: 'A saved copy of a page\'s HTML content at a point in time. Changes are computed by diffing two snapshots.' },
                { term: 'Detected Change', def: 'When two snapshots differ significantly, a change is recorded with a type (e.g. promotion) and severity (low / medium / high).' },
                { term: 'Campaign', def: 'An AI-generated counter-campaign linked to a detected change. Can be launched to Google Ads or Meta.' },
                { term: 'Campaign Score', def: 'A 0–150 numeric score measuring how intense a competitor\'s campaign launch signals are (promo codes, countdown timers, tracking pixels, etc.).' },
              ].map(c => (
                <div key={c.term} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="shrink-0">
                    <ChevronRight size={14} className="text-blue-500 mt-0.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 text-sm">{c.term} — </span>
                    <span className="text-sm text-gray-600">{c.def}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ ADD COMPETITOR ════════════════════════════════════════ */}
          <section id="add-competitor" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Adding a Competitor</h2>
            <p className="text-gray-500 mb-6">Competitors are the businesses you want to watch.</p>
            <Step number={1} title='Go to Competitors → "Add Competitor"'>
              Click the <strong>+ Add Competitor</strong> button in the top right of the Competitors page.
            </Step>
            <Step number={2} title="Fill in the details">
              Provide the competitor's <strong>name</strong>, <strong>website URL</strong> (e.g. <code className="bg-gray-100 px-1 rounded text-xs">https://acme.com</code>), and <strong>industry</strong>. Industry is used to tailor AI-generated counter-campaigns to your sector.
            </Step>
            <Step number={3} title="Add monitored pages">
              After saving, add the specific pages you want tracked — homepage, pricing page, promotions page, etc. At least one page is required for crawling to begin.
            </Step>
            <Callout type="info">
              You can monitor up to 10 pages per competitor on the Starter plan, unlimited on Growth and Agency.
            </Callout>
          </section>

          {/* ═══ MONITORED PAGES ═══════════════════════════════════════ */}
          <section id="monitored-pages" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Monitored Pages</h2>
            <p className="text-gray-500 mb-4">Each monitored page has a <strong>type</strong> that helps classify what kind of changes to expect.</p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    ['home', 'Homepage — catches banner changes and brand messaging shifts'],
                    ['pricing', 'Pricing page — detects price changes and plan restructures'],
                    ['promotions', 'Promotions page — highest signal for campaign launches'],
                    ['blog', 'Blog — tracks new posts and content campaigns'],
                    ['landing_page', 'Specific landing pages — useful for tracking active campaigns'],
                    ['custom', 'Any other URL you want to monitor'],
                  ].map(([type, desc]) => (
                    <tr key={type}>
                      <td className="py-3 px-4 font-mono text-xs text-gray-700">{type}</td>
                      <td className="py-3 px-4 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ═══ CRAWL FREQUENCY ═══════════════════════════════════════ */}
          <section id="crawl-frequency" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Crawl Frequency</h2>
            <p className="text-gray-500 mb-4">Control how often Digipromix checks each competitor.</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { freq: 'Daily', plan: 'Starter', desc: 'Pages are crawled once every 24 hours. Suitable for competitors who rarely change.' },
                { freq: 'Hourly', plan: 'Growth+', desc: 'Pages are crawled every hour. Recommended for active competitors and flash sale detection.' },
              ].map(f => (
                <div key={f.freq} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">{f.freq}</span>
                    <Tag label={f.plan} color={f.plan === 'Starter' ? 'gray' : 'blue'} />
                  </div>
                  <p className="text-sm text-gray-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ CHANGE TYPES ══════════════════════════════════════════ */}
          <section id="change-types" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Change Types</h2>
            <p className="text-gray-500 mb-4">Every detected change is classified into one of these types by the AI classifier.</p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Common trigger</th>
                  </tr>
                </thead>
                <tbody>
                  <ChangeTypeRow badge="Campaign Launch" color="orange" desc="Coordinated high-intensity promotional push detected" trigger="Promo code + countdown timer + tracking pixel added" />
                  <ChangeTypeRow badge="Promotion" color="purple" desc="Promotional content or offer added" trigger="Discount % keywords, sale language, offer banners" />
                  <ChangeTypeRow badge="Price Change" color="red" desc="Numeric price values changed on page" trigger="$ or pricing number diff between snapshots" />
                  <ChangeTypeRow badge="New Landing Page" color="blue" desc="A new campaign landing page detected" trigger="New /lp/ URL or UTM-linked page" />
                  <ChangeTypeRow badge="Banner Change" color="gray" desc="Hero banner or primary visual changed" trigger="Image src change, headline text diff" />
                  <ChangeTypeRow badge="New Blog Post" color="green" desc="New blog content published" trigger="New /blog/ URL or article link appeared" />
                  <ChangeTypeRow badge="Content Change" color="gray" desc="General text or content modification" trigger="Significant text diff below other thresholds" />
                </tbody>
              </table>
            </div>
          </section>

          {/* ═══ SEVERITY ══════════════════════════════════════════════ */}
          <section id="severity" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Severity Scoring</h2>
            <p className="text-gray-500 mb-4">Each change is rated <strong>low</strong>, <strong>medium</strong>, or <strong>high</strong> based on competitive impact.</p>
            <div className="space-y-3">
              {[
                { level: 'High', color: 'red', desc: 'Immediate competitive threat — flash sale, campaign launch, significant price drop. Triggers instant push alert.' },
                { level: 'Medium', color: 'orange', desc: 'Notable change that warrants attention — new promotion, banner swap, blog post about a key topic.' },
                { level: 'Low', color: 'gray', desc: 'Minor content tweak or small update. Logged for trend analysis but no immediate action required.' },
              ].map(s => (
                <div key={s.level} className="flex gap-3 items-start p-4 rounded-xl border border-gray-100 bg-gray-50">
                  <Tag label={s.level} color={s.color} />
                  <p className="text-sm text-gray-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ CAMPAIGN LAUNCH DETECTION ═════════════════════════════ */}
          <section id="campaign-launch" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Campaign Launch Detection</h2>
            <p className="text-gray-500 mb-4">
              The <Tag label="Campaign Launch" color="orange" /> type is Digipromix's most advanced signal. It uses a 12-factor scoring engine to detect when a competitor is running a coordinated promotional campaign.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {[
                { signal: 'Promo codes', points: '+20 pts' },
                { signal: 'Offer schema', points: '+18 pts' },
                { signal: 'Tracking pixels', points: '+15 pts' },
                { signal: 'Countdown timers', points: '+15 pts' },
                { signal: 'Lead capture forms', points: '+12 pts' },
                { signal: 'Urgency language', points: '+12 pts' },
                { signal: 'Promo keywords', points: '+12 pts' },
                { signal: 'UTM links', points: '+9 pts' },
                { signal: 'CTA buttons', points: '+8 pts' },
                { signal: 'Promo structure', points: '+8 pts' },
                { signal: 'Videos added', points: '+9 pts' },
                { signal: 'Coordinated launch', points: 'escalate' },
              ].map(s => (
                <div key={s.signal} className="bg-white rounded-lg border border-gray-100 p-3">
                  <p className="text-xs font-semibold text-gray-800">{s.signal}</p>
                  <p className="text-xs text-blue-600 font-mono mt-0.5">{s.points}</p>
                </div>
              ))}
            </div>
            <Callout type="info">
              A score ≥ 60 (or any promo code detected) triggers a <strong>Campaign Launch</strong> classification. A score ≥ 35 triggers a <strong>Promotion</strong>. If ≥ 2 pages of the same competitor change within 15 minutes, the change is escalated to a coordinated campaign launch.
            </Callout>
          </section>

          {/* ═══ GENERATING ════════════════════════════════════════════ */}
          <section id="generating" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Generating a Campaign</h2>
            <p className="text-gray-500 mb-6">Digipromix uses Google Gemini AI to generate a complete counter-campaign from a detected change.</p>
            <Step number={1} title="Open a change card">
              On the Dashboard or Changes page, find a change with severity <Tag label="High" color="red" /> or <Tag label="Medium" color="orange" />. Click <strong>Generate Campaign</strong>.
            </Step>
            <Step number={2} title="Wait for AI generation (~5 seconds)">
              Gemini analyses the competitor's move and generates: campaign name, headline, ad copy, social copy, offer, keywords, landing page title, CTA, and body copy.
            </Step>
            <Step number={3} title="Review the output">
              The campaign opens in a modal. Edit any field before launching. All fields are pre-filled but fully editable.
            </Step>
            <p className="text-sm font-semibold text-gray-700 mt-4 mb-2">Generated fields:</p>
            <CodeBlock lang="json" code={`{
  "campaign_name": "Beat Acme Summer Sale",
  "headline": "45% Off — Better Than Acme",
  "ad_copy": "Don't settle for less. Get 45% off all plans this week only.",
  "social_copy": "🔥 Acme just dropped a sale — but we matched it AND added free onboarding...",
  "offer": "45% off + free setup",
  "keywords": ["acme alternative", "better than acme", "acme competitor", ...],
  "landing_page_title": "A Better Deal Than Acme's Summer Sale",
  "landing_page_cta": "Claim Your Discount",
  "landing_page_body": "While Acme offers 40% off, we're giving you 45% plus..."
}`} />
          </section>

          {/* ═══ GOOGLE ADS ════════════════════════════════════════════ */}
          <section id="google-ads" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Google Ads Launch</h2>
            <p className="text-gray-500 mb-4">
              Once a campaign is generated, launch it directly to Google Ads with one click. Digipromix creates the full campaign structure via the Google Ads REST API v20.
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-3">What gets created in Google Ads:</p>
            <div className="space-y-2 mb-5">
              {[
                ['Campaign Budget', 'Daily budget you set (default $10/day)'],
                ['Search Campaign', 'PAUSED, manual CPC, Search network only'],
                ['Ad Group', 'PAUSED, $1 default CPC bid'],
                ['Responsive Search Ad', '3 headlines (≤30 chars), 2 descriptions (≤90 chars)'],
                ['Keywords', 'Up to 20 broad-match keywords from AI output'],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-800">{name}</span>
                    <span className="text-gray-500"> — {desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <Callout type="warning">
              Campaigns are created as <strong>PAUSED</strong> for safety. You must manually enable them in the Google Ads UI before they serve. This prevents accidental spend.
            </Callout>
            <Callout type="info">
              A <strong>Basic Access</strong> developer token is required for ads to actually serve. TEST ACCESS tokens can create campaign objects but ads won't be shown to real users. Apply at Google Ads → Tools → API Center.
            </Callout>
          </section>

          {/* ═══ META ADS ══════════════════════════════════════════════ */}
          <section id="meta-ads" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Meta Ads Launch</h2>
            <p className="text-gray-500 mb-4">
              Connect your Facebook/Meta ad account to launch counter-campaigns on Instagram and Facebook.
            </p>
            <Step number={1} title="Connect Meta in Settings">
              Go to <strong>Settings → Meta Ads</strong> → click <em>Connect Meta</em>. You'll be redirected to Facebook OAuth.
            </Step>
            <Step number={2} title="Select your ad account">
              After OAuth, choose which Meta Ad Account to use for campaign launches.
            </Step>
            <Step number={3} title="Launch from a campaign">
              Open any generated campaign → click <strong>Launch on Meta</strong>. Digipromix creates a Campaign, Ad Set, and Ad via the Meta Marketing API.
            </Step>
            <Callout type="warning">
              Meta requires app review before live ads can serve. During review, you can test with your own Facebook account only.
            </Callout>
          </section>

          {/* ═══ LANDING PAGES ═════════════════════════════════════════ */}
          <section id="landing-pages" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Landing Pages</h2>
            <p className="text-gray-500 mb-4">
              Every campaign gets a hosted landing page at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/lp/:slug</code>. No separate page builder needed.
            </p>
            <p className="text-sm text-gray-600 mb-3">Available templates (auto-selected by industry):</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {['default', 'healthcare', 'real-estate', 'education', 'local-services'].map(t => (
                <div key={t} className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
                  <p className="text-xs font-mono font-semibold text-gray-700">{t}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500">
              Each page includes the AI-generated headline, body copy, CTA button, and a lead capture form. Submissions are saved to the <strong>Leads</strong> section of your dashboard.
            </p>
          </section>

          {/* ═══ ALERT PREFERENCES ═════════════════════════════════════ */}
          <section id="alert-preferences" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Alert Preferences</h2>
            <p className="text-gray-500 mb-4">Control which events trigger notifications and how you receive them.</p>
            <p className="text-sm font-semibold text-gray-700 mb-2">Configure in <strong>Settings → Alerts</strong>:</p>
            <div className="space-y-2">
              {[
                ['Change types', 'Choose which change types trigger an alert (e.g. only Campaign Launch and Promotion)'],
                ['Email alerts', 'Receive an email for each matching change'],
                ['Dashboard alerts', 'Bell icon in the top nav shows unread alerts'],
                ['WhatsApp', 'Enter your WhatsApp number to receive instant messages'],
              ].map(([label, desc]) => (
                <div key={label} className="flex gap-3 text-sm p-3 rounded-lg border border-gray-100 bg-gray-50">
                  <Bell size={13} className="text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-800">{label}: </span>
                    <span className="text-gray-500">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ WEBHOOKS ══════════════════════════════════════════════ */}
          <section id="webhooks" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Webhooks</h2>
            <p className="text-gray-500 mb-4">
              Receive a POST request to your endpoint every time a change is detected. Useful for Slack, Zapier, custom CRMs, or any automation.
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-2">Payload example:</p>
            <CodeBlock lang="json" code={`{
  "event": "change.detected",
  "change_type": "campaign_launch",
  "severity": "high",
  "competitor": "Acme Corp",
  "title": "Acme launched Summer Sale 40% Off campaign",
  "campaign_score": 92,
  "promo_codes": ["SUMMER40"],
  "detected_at": "2026-04-30T14:22:00Z",
  "dashboard_url": "https://app.digipromix.com/dashboard"
}`} />
            <Callout type="tip">
              Connect your webhook URL to <strong>Zapier</strong> to automatically post alerts to Slack, send emails, or create tasks in your project management tool.
            </Callout>
          </section>

          {/* ═══ GOOGLE ADS SETUP ══════════════════════════════════════ */}
          <section id="google-ads-setup" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Google Ads Integration Setup</h2>
            <p className="text-gray-500 mb-6">One-time setup to enable campaign launching to Google Ads.</p>
            <Step number={1} title="Create a Google Cloud project">
              Visit Google Cloud Console. Create a new project, enable the <strong>Google Ads API</strong>.
            </Step>
            <Step number={2} title="Create OAuth 2.0 credentials">
              Under APIs & Services → Credentials → Create OAuth Client ID. Choose <em>Web application</em>. Add your callback URL as an authorized redirect URI:
              <CodeBlock lang="text" code="https://app.digipromix.com/auth/google-ads/callback" />
            </Step>
            <Step number={3} title="Get a developer token">
              Log in to Google Ads → Tools → API Center. Copy your developer token. Apply for <strong>Basic Access</strong> to run live ads.
            </Step>
            <Step number={4} title="Add to Digipromix">
              Go to <strong>Settings → Google Ads</strong>. Paste your Client ID and click <em>Connect</em>. Secrets are stored encrypted in Supabase Vault.
            </Step>
            <Callout type="warning">
              With a <strong>TEST ACCESS</strong> token, campaign objects are created in Google Ads but ads do not serve to real users. Upgrade to Basic Access after your developer token application is approved (1–3 business days).
            </Callout>
          </section>

          {/* ═══ META SETUP ════════════════════════════════════════════ */}
          <section id="meta-setup" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Meta Ads Integration Setup</h2>
            <Step number={1} title="Create a Meta App">
              Go to <strong>developers.facebook.com</strong> → My Apps → Create App. Choose <em>Business</em> type.
            </Step>
            <Step number={2} title="Add Marketing API product">
              Inside your app, click <em>Add Product</em> → select <strong>Marketing API</strong>.
            </Step>
            <Step number={3} title="Set OAuth redirect URI">
              Under Facebook Login → Settings, add:
              <CodeBlock lang="text" code="https://app.digipromix.com/auth/meta/callback" />
            </Step>
            <Step number={4} title="Submit for App Review">
              Request the <code className="bg-gray-100 px-1 rounded text-xs">ads_management</code> permission. Meta reviews take 1–5 business days.
            </Step>
            <Step number={5} title="Connect in Digipromix">
              Go to <strong>Settings → Meta Ads</strong> → click <em>Connect Meta</em>.
            </Step>
          </section>

          {/* ═══ GEMINI SETUP ══════════════════════════════════════════ */}
          <section id="gemini-setup" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Gemini AI Setup</h2>
            <p className="text-gray-500 mb-4">Digipromix uses Google Gemini to generate counter-campaigns. A free API key is sufficient for most usage.</p>
            <Step number={1} title="Get a Gemini API key">
              Go to <strong>Google AI Studio</strong> (aistudio.google.com) → Get API Key → Create API Key in new project.
            </Step>
            <Step number={2} title="Add to Supabase Vault">
              In your Supabase dashboard → Database → Vault → add a secret named <code className="bg-gray-100 px-1 rounded text-xs">gemini_api_key</code>.
            </Step>
            <p className="text-sm text-gray-600 mt-4 mb-2">Model fallback order (automatic):</p>
            <CodeBlock lang="text" code={`1. gemini-flash-latest   (primary — fastest)
2. gemini-2.0-flash-lite (fallback on 429)
3. gemini-1.5-flash-latest (final fallback)`} />
            <Callout type="info">
              If all models return quota errors, wait a few minutes and retry. Free-tier quota resets daily. Add billing to your Google AI project for higher limits.
            </Callout>
          </section>

          {/* ═══ ANALYTICS ═════════════════════════════════════════════ */}
          <section id="analytics-overview" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Analytics Overview</h2>
            <p className="text-gray-500 mb-4">The Analytics page gives you a competitive intelligence snapshot over any time period.</p>
            <div className="space-y-3">
              {[
                { metric: 'Changes over time', desc: 'Bar chart of how many changes were detected per day / week.' },
                { metric: 'Change type breakdown', desc: 'Donut chart showing what proportion of changes were promotions, price changes, campaign launches, etc.' },
                { metric: 'Competitor activity ranking', desc: 'Which competitor is most active — ranked by number of changes.' },
                { metric: 'Campaign launch rate', desc: 'How many detected changes resulted in a campaign being generated and launched.' },
                { metric: 'Response time', desc: 'Average time from change detected to campaign launched.' },
              ].map(m => (
                <div key={m.metric} className="flex gap-3 text-sm p-3 rounded-lg border border-gray-100">
                  <BarChart2 size={13} className="text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-800">{m.metric}: </span>
                    <span className="text-gray-500">{m.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ FAQ ═══════════════════════════════════════════════════ */}
          <section id="faq-items" data-doc-section className="mb-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {[
                {
                  q: 'Does Digipromix charge me for running ads?',
                  a: 'No. Digipromix only charges for the platform subscription. Ad spend goes directly to Google or Meta — Digipromix never touches your ad budget.',
                },
                {
                  q: 'What happens if the crawler gets blocked by a competitor?',
                  a: 'The crawler uses standard HTTP requests. Most public pages are accessible. If a page returns 403 or a CAPTCHA, the crawl is marked as failed and retried next cycle. Digipromix does not use proxy rotation or any technique that violates a site\'s terms of service.',
                },
                {
                  q: 'How accurate is the AI campaign generator?',
                  a: 'Gemini generates highly relevant output in most cases. You should always review generated campaigns before launching — especially headlines (≤30 chars) and descriptions (≤90 chars) for Google Ads compliance.',
                },
                {
                  q: 'Can I use Digipromix for multiple clients?',
                  a: 'Yes. The Agency plan supports multi-account management. Each client can have their own competitors, campaigns, and ad accounts.',
                },
                {
                  q: 'Is my Google Ads data secure?',
                  a: 'Yes. OAuth tokens are stored encrypted in Supabase Vault. Digipromix never stores your Google Ads payment information — it only creates campaign objects via the API.',
                },
                {
                  q: 'What Google Ads API version does Digipromix use?',
                  a: 'Digipromix uses Google Ads REST API v20, the latest stable version as of April 2026. Earlier versions (v17–v19) are sunset and will return 404 errors.',
                },
              ].map((item, i) => (
                <details key={i} className="group border border-gray-100 rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between p-4 cursor-pointer list-none hover:bg-gray-50 transition-colors">
                    <span className="font-semibold text-gray-900 text-sm pr-4">{item.q}</span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>

          {/* ═══ Footer CTA ════════════════════════════════════════════ */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center mb-8">
            <p className="text-white font-bold text-xl mb-2">Ready to start?</p>
            <p className="text-blue-100 text-sm mb-5">Set up takes under 5 minutes. No credit card required.</p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-colors shadow-soft-md text-sm"
            >
              Create free account
              <ArrowRight size={14} />
            </Link>
          </div>

        </main>
      </div>
    </div>
  )
}
