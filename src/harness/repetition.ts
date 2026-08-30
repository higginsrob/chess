import { Chess } from 'chess.js'

/** Placement, side to move, castling, and en passant — the threefold identity. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

function cloneWithHistory(chess: Chess): Chess {
  const history = chess.history({ verbose: true })
  if (history.length === 0) {
    return new Chess(chess.fen())
  }
  const copy = new Chess(history[0]!.before)
  for (const move of history) {
    copy.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    })
  }
  return copy
}

function positionCounts(chess: Chess): Map<string, number> {
  const history = chess.history({ verbose: true })
  const counts = new Map<string, number>()
  const inc = (fen: string) => {
    const key = positionKey(fen)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (history.length === 0) {
    inc(chess.fen())
    return counts
  }
  inc(history[0]!.before)
  for (const move of history) inc(move.after)
  return counts
}

export function positionOccurrenceCount(chess: Chess): number {
  const history = chess.history({ verbose: true })
  const current = positionKey(chess.fen())
  if (history.length === 0) return 1
  let n = 0
  if (positionKey(history[0]!.before) === current) n++
  for (const move of history) {
    if (positionKey(move.after) === current) n++
  }
  return n
}

export interface RepetitionClassified {
  positionOccurrences: number
  /** Resulting position has never occurred. */
  freshSans: string[]
  /** Resulting position would be a second visit (not yet a draw). */
  repeatSans: string[]
  /** Resulting position would immediately draw by threefold. */
  threefoldDrawSans: string[]
  /**
   * SAN list to send the model / JSON schema: prefer fresh positions, else
   * non-drawing repeats, else every legal move (never empty if `legalSans` isn't).
   */
  offeredSans: string[]
}

/**
 * Classify legal SANs by what they do to the position-key history, then pick
 * the list the model is allowed to copy from.
 */
export function classifyRepetition(chess: Chess, legalSans?: string[]): RepetitionClassified {
  const positionOccurrences = positionOccurrenceCount(chess)
  const counts = positionCounts(chess)
  const copy = cloneWithHistory(chess)
  const candidates = legalSans ?? copy.moves()
  const freshSans: string[] = []
  const repeatSans: string[] = []
  const threefoldDrawSans: string[] = []
  for (const san of candidates) {
    try {
      copy.move(san)
    } catch {
      continue
    }
    if (copy.isThreefoldRepetition()) {
      threefoldDrawSans.push(san)
    } else if ((counts.get(positionKey(copy.fen())) ?? 0) + 1 >= 2) {
      repeatSans.push(san)
    } else {
      freshSans.push(san)
    }
    copy.undo()
  }
  const offeredSans =
    freshSans.length > 0 ? freshSans : repeatSans.length > 0 ? repeatSans : candidates
  return { positionOccurrences, freshSans, repeatSans, threefoldDrawSans, offeredSans }
}

export function threefoldDrawSans(chess: Chess, legalSans?: string[]): string[] {
  return classifyRepetition(chess, legalSans).threefoldDrawSans
}
