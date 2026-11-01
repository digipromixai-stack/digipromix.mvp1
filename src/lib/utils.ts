import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

// German date format: 18.10.2026 14:30
export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd.MM.yyyy HH:mm')
}

/** German number format with fixed decimals: 1234.5 → "1.234,50" */
export function formatDecimal(n: number, decimals = 2) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatUrl(url: string) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}
