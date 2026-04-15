export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  text: string
}

// Simple Myers-style line diff
export function generateLineDiff(before: string[], after: string[]): DiffLine[] {
  const n = before.length
  const m = after.length
  const max = n + m

  if (max === 0) return []

  const trace: Map<number, number>[] = []
  const v = new Map<number, number>()
  v.set(1, 0)

  outer: for (let d = 0; d <= max; d++) {
    const current = new Map(v)
    trace.push(current)
    for (let k = -d; k <= d; k += 2) {
      let x: number
      const down = v.get(k - 1) ?? -1
      const right = v.get(k + 1) ?? -1
      if (k === -d || (k !== d && down < right)) {
        x = right
      } else {
        x = down + 1
      }
      let y = x - k
      while (x < n && y < m && before[x] === after[y]) {
        x++
        y++
      }
      v.set(k, x)
      if (x >= n && y >= m) break outer
    }
  }

  // Backtrack to find the diff
  const result: DiffLine[] = []
  let x = n
  let y = m

  for (let d = trace.length - 1; d >= 0; d--) {
    const current = trace[d]
    const k = x - y
    const down = current.get(k - 1) ?? -1
    const right = current.get(k + 1) ?? -1

    let prevK: number
    if (k === -d || (k !== d && down < right)) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }

    const prevX = current.get(prevK) ?? 0
    const prevY = prevX - prevK

    // Walk back along the diagonal (unchanged lines) until we reach the move point
    while (x > prevX && y > prevY) {
      result.unshift({ type: 'unchanged', text: before[x - 1] })
      x--
      y--
    }

    if (d > 0) {
      if (prevK === k - 1) {
        result.unshift({ type: 'added', text: after[y - 1] })
        y--
      } else {
        result.unshift({ type: 'removed', text: before[x - 1] })
        x--
      }
    }
  }

  return result
}

// Use Myers diff for small pages (preserves context), fall back to simpleDiff for large pages
export function bestDiff(before: string[], after: string[]): DiffLine[] {
  if (before.length + after.length < 2000) {
    return generateLineDiff(before, after)
  }
  return simpleDiff(before, after)
}

// Simplified but reliable diff for production use
export function simpleDiff(before: string[], after: string[]): DiffLine[] {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)

  const result: DiffLine[] = []

  const removed = before.filter((l) => !afterSet.has(l))
  const added = after.filter((l) => !beforeSet.has(l))
  const unchanged = before.filter((l) => afterSet.has(l))

  for (const line of removed) result.push({ type: 'removed', text: line })
  for (const line of added) result.push({ type: 'added', text: line })
  for (const line of unchanged.slice(0, 5)) result.push({ type: 'unchanged', text: line })

  return result
}

export function formatDiffAsText(diff: DiffLine[]): string {
  return diff
    .map((line) => {
      if (line.type === 'added') return `+ ${line.text}`
      if (line.type === 'removed') return `- ${line.text}`
      return `  ${line.text}`
    })
    .join('\n')
}
