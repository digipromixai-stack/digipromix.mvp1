import { useState, useId } from 'react'
import { Info } from 'lucide-react'
import { cn } from '../../lib/utils'

// ── Data source tag (Priority 1) ─────────────────────────────────────────────
// Every KPI must show where its value comes from so customers can trust it.

export type DataSource =
  | 'live'        // real platform data (Google Ads, Meta Ads)
  | 'ai'          // AI calculated
  | 'estimated'   // projection / forecast
  | 'benchmark'   // industry benchmark
  | 'config'      // user configured
  | 'trends'      // Google Trends

const sourceConfig: Record<DataSource, { label: string; classes: string }> = {
  live:      { label: 'Live Data',          classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  ai:        { label: 'AI Calculated',      classes: 'bg-indigo-tint text-primary ring-primary/20' },
  estimated: { label: 'Estimated',          classes: 'bg-orange-tint text-warning ring-warning/20' },
  benchmark: { label: 'Industry Benchmark', classes: 'bg-surface-container text-on-surface-variant ring-border-subtle' },
  config:    { label: 'Your Setting',       classes: 'bg-purple-50 text-purple-700 ring-purple-200' },
  trends:    { label: 'Google Trends',      classes: 'bg-blue-50 text-blue-700 ring-blue-200' },
}

export function SourceTag({ source, label, className }: { source: DataSource; label?: string; className?: string }) {
  const config = sourceConfig[source]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold ring-1 ring-inset px-1.5 py-0.5 text-[9px] uppercase tracking-wide',
        config.classes,
        className,
      )}
    >
      Source: {label ?? config.label}
    </span>
  )
}

// ── Confidence level (Priority 6) ────────────────────────────────────────────
// Until we have enough historical customer data to justify precise percentages,
// confidence is shown as High / Medium / Low.

export type ConfidenceLevel = 'High' | 'Medium' | 'Low'

export function confidenceLevel(confidence: number | null | undefined): ConfidenceLevel | null {
  if (confidence == null) return null
  const c = confidence > 1 ? confidence / 100 : confidence
  if (c >= 0.75) return 'High'
  if (c >= 0.5) return 'Medium'
  return 'Low'
}

const confidenceClasses: Record<ConfidenceLevel, string> = {
  High:   'text-success',
  Medium: 'text-warning',
  Low:    'text-on-surface-variant',
}

export function confidenceTone(level: ConfidenceLevel): string {
  return confidenceClasses[level]
}

// ── "How this was calculated" tooltip (Priority 3) ───────────────────────────
// An (i) icon that reveals a plain-language explanation of the number.

export function InfoTooltip({ title, children, className }: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label="How this was calculated"
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-on-surface-variant/60 hover:text-primary transition-colors"
      >
        <Info size={13} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute z-30 left-1/2 -translate-x-1/2 top-6 w-60 bg-primary text-white text-[11px] leading-relaxed rounded-lg p-3 shadow-lg text-left font-normal normal-case tracking-normal"
        >
          {title && <span className="block font-bold mb-1">{title}</span>}
          {children}
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rotate-45" />
        </span>
      )}
    </span>
  )
}
