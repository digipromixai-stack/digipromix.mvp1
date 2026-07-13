// Single source of truth for the "value per lead" default used across
// Dashboard / Opportunities / Interception ROI & revenue estimates.
// A single lead is worth wildly different amounts across industries (a plumber's
// lead vs. a B2B SaaS lead), so this is only a fallback — profiles.value_per_lead
// (set in Settings) always takes precedence when available.
export const DEFAULT_VALUE_PER_LEAD = 100
