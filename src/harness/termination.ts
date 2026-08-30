import { Chess } from 'chess.js'
import type { Color, TerminationReason, Winner } from '../types'

export interface NaturalEnd {
  reason: TerminationReason
  winner: Winner
}

export function opponent(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

/**
 * FIDE-lite natural endings after a legal move (or at position load).
 * Order matters: checkmate/stalemate before the draw detectors.
 */
export function detectNaturalEnd(chess: Chess): NaturalEnd | null {
  if (chess.isCheckmate()) {
    return { reason: 'checkmate', winner: opponent(chess.turn()) }
  }
  if (chess.isStalemate()) {
    return { reason: 'stalemate', winner: 'draw' }
  }
  if (chess.isInsufficientMaterial()) {
    return { reason: 'insufficient_material', winner: 'draw' }
  }
  if (chess.isThreefoldRepetition()) {
    return { reason: 'threefold_repetition', winner: 'draw' }
  }
  if (chess.isDrawByFiftyMoves()) {
    return { reason: 'fifty_move_rule', winner: 'draw' }
  }
  return null
}

export interface ImmediateDrawClassified {
  /** SANs that would end the game as a draw on this ply. */
  drawSans: string[]
  /**
   * SAN list to send the model: non-drawing moves when any exist, else the
   * original list (never empty if `legalSans` isn't).
   */
  offeredSans: string[]
}

/**
 * Drop SANs that immediately draw (stalemate, insufficient material, 50-move).
 * Threefold needs full history and is handled by `classifyRepetition`.
 * Uses the current FEN only, so it does not mutate `chess`.
 */
export function classifyImmediateDraws(chess: Chess, legalSans: string[]): ImmediateDrawClassified {
  let copy: Chess
  try {
    copy = new Chess(chess.fen())
  } catch {
    return { drawSans: [], offeredSans: legalSans }
  }
  const drawSans: string[] = []
  const playable: string[] = []
  for (const san of legalSans) {
    try {
      copy.move(san)
    } catch {
      continue
    }
    const end = detectNaturalEnd(copy)
    copy.undo()
    if (end && end.winner === 'draw') drawSans.push(san)
    else playable.push(san)
  }
  return {
    drawSans,
    offeredSans: playable.length > 0 ? playable : legalSans,
  }
}

export function forfeitWinner(failedColor: Color): Winner {
  return opponent(failedColor)
}

export function terminationLabel(reason: TerminationReason): string {
  switch (reason) {
    case 'checkmate':
      return 'Checkmate'
    case 'stalemate':
      return 'Stalemate'
    case 'threefold_repetition':
      return 'Threefold repetition'
    case 'fifty_move_rule':
      return 'Fifty-move rule'
    case 'insufficient_material':
      return 'Insufficient material'
    case 'illegal_move':
      return 'Illegal move (forfeit)'
    case 'unparseable_move':
      return 'Unparseable move (forfeit)'
    case 'http_error':
      return 'HTTP error (forfeit)'
    case 'timeout':
      return 'Timeout (forfeit)'
  }
}

export function winnerLabel(winner: Winner): string {
  if (winner === 'w') return 'White wins'
  if (winner === 'b') return 'Black wins'
  return 'Draw'
}

export function scoreLabel(winner: Winner): string {
  if (winner === 'w') return '1–0'
  if (winner === 'b') return '0–1'
  return '½–½'
}

export function resultLine(termination: TerminationReason, winner: Winner): string {
  return `${terminationLabel(termination)} · ${winnerLabel(winner)}`
}
