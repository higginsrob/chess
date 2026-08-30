import { Chess, type PieceSymbol, type Square } from 'chess.js'
import type { Color } from '../types'
import { detectNaturalEnd } from './termination'
import { materialCount, pieceValue } from './material'
import {
  isAvoidLine,
  opponentMateInOneSan,
  tacticsBrief,
  tacticsBriefAsync,
} from './tactics'
import { yieldIfBusy } from './yieldToPaint'

/** Max endgame SANs to offer when look-ahead ranks many quiet moves. */
export const ENDGAME_SHORTLIST = 8

export interface TacticalOffers {
  offeredSans: string[]
  /** True when mate-in-1 exists and the list was reduced to those SANs. */
  forcedMate: boolean
  /** True when hanging / losing / mate-in-1-for-opponent SANs were dropped. */
  filteredDanger: boolean
  /** True when a sparse endgame list was ranked and trimmed. */
  filteredEndgameShortlist: boolean
  /** True when remaining endgame SANs were ordered by 1–2 ply progress. */
  rankedEndgame: boolean
}

function fileRank(square: Square): { file: number; rank: number } {
  return {
    file: square.charCodeAt(0) - 97,
    rank: Number(square[1]) - 1,
  }
}

function chebyshev(a: Square, b: Square): number {
  const A = fileRank(a)
  const B = fileRank(b)
  return Math.max(Math.abs(A.file - B.file), Math.abs(A.rank - B.rank))
}

function kingSquare(chess: Chess, color: Color): Square | undefined {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color && cell.type === 'k') return cell.square
    }
  }
  return undefined
}

function pawnProgress(chess: Chess, us: Color): number {
  let sum = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== us || cell.type !== 'p') continue
      const rank = Number(cell.square[1])
      sum += us === 'w' ? rank - 1 : 8 - rank
    }
  }
  return sum
}

function countNonKingsAndQueens(chess: Chess): { nonKings: number; queens: number } {
  let nonKings = 0
  let queens = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue
      nonKings++
      if (cell.type === 'q') queens++
    }
  }
  return { nonKings, queens }
}

/** Sparse enough that quiet shuffling is the main failure mode. */
export function isSparseEndgame(chess: Chess): boolean {
  const { nonKings, queens } = countNonKingsAndQueens(chess)
  if (nonKings <= 10) return true
  if (queens === 0 && nonKings <= 14) return true
  return false
}

/**
 * Material + king-net + pawn-advance score after `san`. Higher is better for the
 * side to move. Used only to rank remaining endgame candidates — not to play the
 * move for the model.
 */
export function scoreEndgameMove(chess: Chess, san: string, youMaterial: number): number {
  let played
  try {
    played = chess.move(san)
  } catch {
    return Number.NEGATIVE_INFINITY
  }
  try {
    if (chess.isCheckmate()) return 100_000
    const end = detectNaturalEnd(chess)
    if (end && end.winner === 'draw') return -50_000
    if (opponentMateInOneSan(chess)) return -100_000

    const us = played.color
    let score = 0
    if (played.promotion) {
      score += 800 + pieceValue(played.promotion as PieceSymbol) * 10
    }
    if (played.captured) score += pieceValue(played.captured) * 40
    if (chess.inCheck()) score += 25
    score += pawnProgress(chess, us) * 15

    const ourKing = kingSquare(chess, us)
    const theirKing = kingSquare(chess, us === 'w' ? 'b' : 'w')
    if (ourKing && theirKing) {
      const kd = chebyshev(ourKing, theirKing)
      if (youMaterial > 0) score += (7 - kd) * 8
      else if (youMaterial < 0) score += kd * 3
    }
    if (youMaterial > 0) {
      score += Math.max(0, 8 - chess.moves().length) * 12
    }
    return score
  } finally {
    chess.undo()
  }
}

function rankEndgame(fen: string, legalSans: string[]): {
  offeredSans: string[]
  trimmed: boolean
  ranked: boolean
} {
  if (legalSans.length <= 1) {
    return { offeredSans: legalSans, trimmed: false, ranked: false }
  }
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return { offeredSans: legalSans, trimmed: false, ranked: false }
  }
  if (!isSparseEndgame(chess)) {
    return { offeredSans: legalSans, trimmed: false, ranked: false }
  }

  const material = materialCount(chess)
  const you = chess.turn() === 'w' ? material.white - material.black : material.black - material.white
  const scores = new Map(
    legalSans.map((san) => [san, scoreEndgameMove(chess, san, you)] as const),
  )
  const ranked = [...legalSans].sort((a, b) => {
    const diff = (scores.get(b) ?? 0) - (scores.get(a) ?? 0)
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })
  const offeredSans =
    ranked.length > ENDGAME_SHORTLIST ? ranked.slice(0, ENDGAME_SHORTLIST) : ranked
  return {
    offeredSans,
    trimmed: offeredSans.length < legalSans.length,
    ranked: true,
  }
}

async function rankEndgameAsync(
  fen: string,
  legalSans: string[],
): Promise<{ offeredSans: string[]; trimmed: boolean; ranked: boolean }> {
  if (legalSans.length <= 1) {
    return { offeredSans: legalSans, trimmed: false, ranked: false }
  }
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return { offeredSans: legalSans, trimmed: false, ranked: false }
  }
  if (!isSparseEndgame(chess)) {
    return { offeredSans: legalSans, trimmed: false, ranked: false }
  }

  const material = materialCount(chess)
  const you = chess.turn() === 'w' ? material.white - material.black : material.black - material.white
  const clock = { now: performance.now() }
  const scores = new Map<string, number>()
  for (const san of legalSans) {
    scores.set(san, scoreEndgameMove(chess, san, you))
    await yieldIfBusy(clock)
  }
  const ranked = [...legalSans].sort((a, b) => {
    const diff = (scores.get(b) ?? 0) - (scores.get(a) ?? 0)
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })
  const offeredSans =
    ranked.length > ENDGAME_SHORTLIST ? ranked.slice(0, ENDGAME_SHORTLIST) : ranked
  return {
    offeredSans,
    trimmed: offeredSans.length < legalSans.length,
    ranked: true,
  }
}

function emptyOffers(legalSans: string[]): TacticalOffers {
  return {
    offeredSans: legalSans,
    forcedMate: false,
    filteredDanger: false,
    filteredEndgameShortlist: false,
    rankedEndgame: false,
  }
}

/**
 * Deterministic 1–2 ply filter (no extra LLM call):
 * 1. If mate-in-1 exists, offer only those SANs.
 * 2. Drop hanging / losing / opponent-mate-in-1 moves when a safer one exists.
 * 3. In a sparse endgame with many leftovers, keep the top progress scores.
 */
export function classifyTacticalOffers(fen: string, legalSans: string[]): TacticalOffers {
  if (legalSans.length <= 1) return emptyOffers(legalSans)

  const brief = tacticsBrief(fen, legalSans)
  const mates = brief.moves.filter((line) => line.kind === 'mate').map((line) => line.san)
  if (mates.length > 0) {
    const offeredSans = legalSans.filter((san) => mates.includes(san))
    return {
      offeredSans: offeredSans.length > 0 ? offeredSans : legalSans,
      forcedMate: offeredSans.length > 0 && offeredSans.length < legalSans.length,
      filteredDanger: false,
      filteredEndgameShortlist: false,
      rankedEndgame: false,
    }
  }

  const avoid = new Set(
    brief.moves.filter((line) => isAvoidLine(line)).map((line) => line.san),
  )
  const safe = legalSans.filter((san) => !avoid.has(san))
  const afterDanger = safe.length > 0 ? safe : legalSans
  const filteredDanger = afterDanger.length < legalSans.length

  const endgame = rankEndgame(fen, afterDanger)
  return {
    offeredSans: endgame.offeredSans,
    forcedMate: false,
    filteredDanger,
    filteredEndgameShortlist: endgame.trimmed,
    rankedEndgame: endgame.ranked,
  }
}

export async function classifyTacticalOffersAsync(
  fen: string,
  legalSans: string[],
): Promise<TacticalOffers> {
  if (legalSans.length <= 1) return emptyOffers(legalSans)

  const brief = await tacticsBriefAsync(fen, legalSans)
  const mates = brief.moves.filter((line) => line.kind === 'mate').map((line) => line.san)
  if (mates.length > 0) {
    const offeredSans = legalSans.filter((san) => mates.includes(san))
    return {
      offeredSans: offeredSans.length > 0 ? offeredSans : legalSans,
      forcedMate: offeredSans.length > 0 && offeredSans.length < legalSans.length,
      filteredDanger: false,
      filteredEndgameShortlist: false,
      rankedEndgame: false,
    }
  }

  const avoid = new Set(
    brief.moves.filter((line) => isAvoidLine(line)).map((line) => line.san),
  )
  const safe = legalSans.filter((san) => !avoid.has(san))
  const afterDanger = safe.length > 0 ? safe : legalSans
  const filteredDanger = afterDanger.length < legalSans.length

  const endgame = await rankEndgameAsync(fen, afterDanger)
  return {
    offeredSans: endgame.offeredSans,
    forcedMate: false,
    filteredDanger,
    filteredEndgameShortlist: endgame.trimmed,
    rankedEndgame: endgame.ranked,
  }
}
