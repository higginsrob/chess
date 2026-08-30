import { Chess, type Move, type Square } from 'chess.js'
import type {
  Color,
  GameSnapshot,
  GameStatus,
  LastMove,
  LegalMove,
  PieceOnBoard,
  TerminationReason,
  Winner,
} from '../types'
import { detectNaturalEnd, forfeitWinner } from './termination'

function piecesFrom(chess: Chess): PieceOnBoard[] {
  const pieces: PieceOnBoard[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) pieces.push({ square: cell.square, type: cell.type, color: cell.color })
    }
  }
  return pieces
}

export function capturedSquareOf(move: Move): Square | undefined {
  if (!move.captured) return undefined
  if (move.isEnPassant()) {
    return `${move.to[0]}${move.from[1]}` as Square
  }
  return move.to
}

function lastMoveFrom(chess: Chess): LastMove | null {
  const history = chess.history({ verbose: true })
  const last = history[history.length - 1]
  if (!last) return null
  return {
    from: last.from,
    to: last.to,
    san: last.san,
    capturedSquare: capturedSquareOf(last),
  }
}

function legalMovesFrom(chess: Chess): LegalMove[] {
  return chess.moves({ verbose: true }).map((m) => ({
    san: m.san,
    uci: `${m.from}${m.to}${m.promotion ?? ''}`,
  }))
}

export class ChessLabGame {
  private chess = new Chess()
  private selectedSquare: Square | null = null
  private legalTargets: Square[] = []
  private status: GameStatus = 'idle'
  private termination: TerminationReason | null = null
  private winner: Winner | null = null
  private snapshot: GameSnapshot
  private readonly listeners = new Set<() => void>()

  constructor() {
    this.snapshot = this.buildSnapshot()
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): GameSnapshot => this.snapshot

  start(fen?: string): void {
    this.chess = new Chess()
    if (fen) {
      this.chess.load(fen)
    }
    this.selectedSquare = null
    this.legalTargets = []
    this.termination = null
    this.winner = null
    this.status = 'in_progress'
    const natural = detectNaturalEnd(this.chess)
    if (natural) {
      this.status = 'ended'
      this.termination = natural.reason
      this.winner = natural.winner
    }
    this.publish()
  }

  reset(): void {
    this.chess = new Chess()
    this.selectedSquare = null
    this.legalTargets = []
    this.status = 'idle'
    this.termination = null
    this.winner = null
    this.publish()
  }

  /**
   * Click-click human input. Select a piece, then a legal target.
   * Promotions auto-queen (no promotion picker in v1).
   */
  clickSquare(square: Square): { moved: boolean; san?: string } {
    if (this.status !== 'in_progress') return { moved: false }

    if (this.selectedSquare && this.legalTargets.includes(square)) {
      const candidates = this.chess.moves({
        verbose: true,
        square: this.selectedSquare,
      })
      const chosen =
        candidates.find((m) => m.to === square && m.promotion === 'q') ??
        candidates.find((m) => m.to === square)
      if (!chosen) return { moved: false }
      const move = this.chess.move(chosen.san, { strict: true })
      this.clearSelection()
      this.afterLegalMove()
      this.publish()
      return { moved: true, san: move.san }
    }

    const piece = this.chess.get(square)
    if (piece && piece.color === this.chess.turn()) {
      this.selectedSquare = square
      this.legalTargets = this.chess
        .moves({ verbose: true, square })
        .map((m) => m.to)
      this.publish()
      return { moved: false }
    }

    this.clearSelection()
    this.publish()
    return { moved: false }
  }

  /**
   * Apply a SAN string (from a model, or tests). Illegal SAN forfeits immediately.
   */
  applySan(san: string): { ok: true; move: Move } | { ok: false; reason: 'illegal_move' } {
    if (this.status !== 'in_progress') {
      return { ok: false, reason: 'illegal_move' }
    }
    try {
      const move = this.chess.move(san, { strict: true })
      this.clearSelection()
      this.afterLegalMove()
      this.publish()
      return { ok: true, move }
    } catch {
      this.forfeit('illegal_move', this.chess.turn())
      return { ok: false, reason: 'illegal_move' }
    }
  }

  forfeit(reason: TerminationReason, failedColor: Color): void {
    if (this.status === 'ended') return
    this.status = 'ended'
    this.termination = reason
    this.winner = forfeitWinner(failedColor)
    this.clearSelection()
    this.publish()
  }

  private afterLegalMove(): void {
    const natural = detectNaturalEnd(this.chess)
    if (natural) {
      this.status = 'ended'
      this.termination = natural.reason
      this.winner = natural.winner
    }
  }

  private clearSelection(): void {
    this.selectedSquare = null
    this.legalTargets = []
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private buildSnapshot(): GameSnapshot {
    const legal = this.status === 'in_progress' ? legalMovesFrom(this.chess) : []
    return {
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      turn: this.chess.turn(),
      selectedSquare: this.selectedSquare,
      legalTargets: [...this.legalTargets],
      lastMove: lastMoveFrom(this.chess),
      status: this.status,
      termination: this.termination,
      winner: this.winner,
      inCheck: this.chess.isCheck(),
      pieces: piecesFrom(this.chess),
      plyCount: this.chess.history().length,
      legalSans: legal.map((m) => m.san),
      legalMoves: legal,
    }
  }

  /** Exposed for log builders and tests. */
  chessInstance(): Chess {
    return this.chess
  }
}
