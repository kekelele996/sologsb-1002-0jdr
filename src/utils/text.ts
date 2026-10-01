export const normText = (text: string): string => text.replace(/\s+/g, '')

export const levenshtein = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const prev = new Array<number>(n + 1)
  const cur = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1])
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]
  }
  return prev[n]
}

export const similarity = (a: string, b: string): number => {
  if (!a.length || !b.length) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

export const lcsLength = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  if (!m || !n) return 0
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  return dp[0][0]
}

export const lcsSimilarity = (a: string, b: string): number => {
  if (!a.length || !b.length) return 0
  const lcs = lcsLength(a, b)
  return (2 * lcs) / (a.length + b.length)
}

export const hashText = (text: string): string => {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return `proof-${h.toString(36)}`
}

export interface DiffSegment {
  text: string
  type: 'same' | 'add' | 'del'
}

export interface DiffResult {
  a: DiffSegment[]
  b: DiffSegment[]
}

export const diffChars = (a: string, b: string): DiffResult => {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const aSegs: DiffSegment[] = []
  const bSegs: DiffSegment[] = []
  const push = (segs: DiffSegment[], text: string, type: DiffSegment['type']) => {
    const last = segs[segs.length - 1]
    if (last && last.type === type) last.text += text
    else segs.push({ text, type })
  }
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push(aSegs, a[i], 'same')
      push(bSegs, b[j], 'same')
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(aSegs, a[i], 'del')
      i++
    } else {
      push(bSegs, b[j], 'add')
      j++
    }
  }
  while (i < m) {
    push(aSegs, a[i], 'del')
    i++
  }
  while (j < n) {
    push(bSegs, b[j], 'add')
    j++
  }
  return { a: aSegs, b: bSegs }
}
