/**
 * Text similarity utilities — used for:
 *   1. Real ConcurrentCISC agreement (n=3 pairwise similarity)
 *   2. Cache hint detection (cosine-like overlap)
 *   3. Self-verify answer matching
 *
 * We use normalized Levenshtein + token Jaccard as a hybrid. Not as
 * good as sentence-embedding cosine, but zero-dependency and fast.
 */

/**
 * Normalized Levenshtein distance → similarity in [0, 1].
 * O(m*n) DP. Fine for short answers (< 2000 chars).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const m = a.length
  const n = b.length
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(
        dp[j] + 1, // deletion
        dp[j - 1] + 1, // insertion
        prev + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      )
      prev = tmp
    }
  }
  const dist = dp[n]
  return 1 - dist / Math.max(m, n)
}

/**
 * Token-set Jaccard similarity. Robust to word reordering.
 */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

/**
 * Hybrid similarity — max of Levenshtein and Jaccard.
 * Captures both character-level and word-level overlap.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const lev = levenshteinSimilarity(a, b)
  const jac = tokenJaccard(a, b)
  return Math.max(lev, jac)
}

/**
 * Average pairwise similarity across n samples.
 * Used for ConcurrentCISC agreement signal.
 */
export function pairwiseAgreement(samples: string[]): number {
  if (samples.length < 2) return 1
  let total = 0
  let count = 0
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      total += similarity(samples[i], samples[j])
      count++
    }
  }
  return count > 0 ? total / count : 1
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
}
