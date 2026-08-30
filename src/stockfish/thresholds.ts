/**
 * Centipawn-loss classification (simple, not Lichess winning-chance).
 * Chess.com-style buckets:
 *   inaccuracy  ≥ 50 cp
 *   mistake     ≥ 100 cp
 *   blunder     ≥ 300 cp
 */
export const INACCURACY_CP = 50
export const MISTAKE_CP = 100
export const BLUNDER_CP = 300

export const DEFAULT_ANNOTATE_DEPTH = 12
export const LIVE_EVAL_DEPTH = 10

export type Classified = 'inaccuracy' | 'mistake' | 'blunder' | null

export function classifyCpLoss(cpLoss: number): Classified {
  if (cpLoss >= BLUNDER_CP) return 'blunder'
  if (cpLoss >= MISTAKE_CP) return 'mistake'
  if (cpLoss >= INACCURACY_CP) return 'inaccuracy'
  return null
}

export function mateToCp(mate: number): number {
  if (mate > 0) return 10_000 - mate * 10
  return -10_000 - mate * 10
}
