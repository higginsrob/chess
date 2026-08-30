import { describe, expect, it } from 'vitest'
import type { Square } from '../types'
import { ChessLabGame } from './game'

function occupancyViaGet(game: ChessLabGame): string[] {
  const chess = game.chessInstance()
  const out: string[] = []
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank++) {
      const square = `${file}${rank}` as Square
      const piece = chess.get(square)
      if (piece) out.push(`${piece.color}${piece.type}@${square}`)
    }
  }
  return out.sort()
}

function occupancyViaSnapshot(game: ChessLabGame): string[] {
  return game
    .getSnapshot()
    .pieces.map((p) => `${p.color}${p.type}@${p.square}`)
    .sort()
}

describe('ChessLabGame', () => {
  it('plays click-click e2-e4', () => {
    const game = new ChessLabGame()
    game.start()
    expect(game.clickSquare('e2')).toEqual({ moved: false })
    expect(game.getSnapshot().selectedSquare).toBe('e2')
    expect(game.getSnapshot().legalTargets).toContain('e4')
    expect(game.clickSquare('e4')).toEqual({ moved: true, san: 'e4' })
    expect(game.getSnapshot().turn).toBe('b')
    expect(game.getSnapshot().lastMove?.san).toBe('e4')
  })

  it('exposes UCI alongside legal SAN', () => {
    const game = new ChessLabGame()
    game.start()
    expect(game.getSnapshot().legalMoves).toContainEqual({ san: 'e4', uci: 'e2e4' })
    game.applySan('e4')
    expect(game.getSnapshot().legalMoves).toContainEqual({ san: 'e5', uci: 'e7e5' })
  })

  it('deselects when clicking an empty non-target square', () => {
    const game = new ChessLabGame()
    game.start()
    game.clickSquare('e2')
    game.clickSquare('e5')
    expect(game.getSnapshot().selectedSquare).toBeNull()
    expect(game.getSnapshot().plyCount).toBe(0)
  })

  it('does not move when idle', () => {
    const game = new ChessLabGame()
    expect(game.clickSquare('e2').moved).toBe(false)
    expect(game.applySan('e4').ok).toBe(false)
  })

  it('applies legal SAN', () => {
    const game = new ChessLabGame()
    game.start()
    const result = game.applySan('Nf3')
    expect(result.ok).toBe(true)
    expect(game.getSnapshot().lastMove?.san).toBe('Nf3')
  })

  it('forfeits immediately on illegal SAN', () => {
    const game = new ChessLabGame()
    game.start()
    const result = game.applySan('Nf4')
    expect(result.ok).toBe(false)
    const snap = game.getSnapshot()
    expect(snap.status).toBe('ended')
    expect(snap.termination).toBe('illegal_move')
    expect(snap.winner).toBe('b')
    expect(snap.plyCount).toBe(0)
  })

  it('forfeits unparseable via explicit forfeit', () => {
    const game = new ChessLabGame()
    game.start()
    game.forfeit('unparseable_move', 'w')
    const snap = game.getSnapshot()
    expect(snap.termination).toBe('unparseable_move')
    expect(snap.winner).toBe('b')
  })

  it('detects fool\'s mate', () => {
    const game = new ChessLabGame()
    game.start()
    game.applySan('f3')
    game.applySan('e5')
    game.applySan('g4')
    const result = game.applySan('Qh4#')
    expect(result.ok).toBe(true)
    const snap = game.getSnapshot()
    expect(snap.status).toBe('ended')
    expect(snap.termination).toBe('checkmate')
    expect(snap.winner).toBe('b')
  })

  it('detects stalemate', () => {
    const game = new ChessLabGame()
    // King vs queen stalemate: black to move, no legal moves, not in check.
    game.start('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    const snap = game.getSnapshot()
    expect(snap.status).toBe('ended')
    expect(snap.termination).toBe('stalemate')
    expect(snap.winner).toBe('draw')
  })

  it('detects insufficient material', () => {
    const game = new ChessLabGame()
    game.start('k7/8/8/8/8/8/8/K7 w - - 0 1')
    const snap = game.getSnapshot()
    expect(snap.termination).toBe('insufficient_material')
    expect(snap.winner).toBe('draw')
  })

  it('detects threefold repetition', () => {
    const game = new ChessLabGame()
    game.start()
    const cycle = ['Nf3', 'Nc6', 'Ng1', 'Nb8'] as const
    game.applySan(cycle[0])
    game.applySan(cycle[1])
    game.applySan(cycle[2])
    game.applySan(cycle[3])
    game.applySan(cycle[0])
    game.applySan(cycle[1])
    game.applySan(cycle[2])
    game.applySan(cycle[3])
    const snap = game.getSnapshot()
    expect(snap.termination).toBe('threefold_repetition')
    expect(snap.winner).toBe('draw')
  })

  it('detects the fifty-move rule', () => {
    const game = new ChessLabGame()
    // Halfmove clock 99; a non-pawn, non-capture pushes it to 100.
    game.start('k7/8/8/8/8/8/8/K6R w - - 99 50')
    const result = game.applySan('Rg1')
    expect(result.ok).toBe(true)
    const snap = game.getSnapshot()
    expect(snap.termination).toBe('fifty_move_rule')
    expect(snap.winner).toBe('draw')
  })

  it('timeout forfeit awards the opponent', () => {
    const game = new ChessLabGame()
    game.start()
    game.forfeit('timeout', 'b')
    expect(game.getSnapshot().winner).toBe('w')
    expect(game.getSnapshot().termination).toBe('timeout')
  })

  it('rejects a pawn capturing the piece directly in front of it', () => {
    const game = new ChessLabGame()
    game.start('4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1')
    expect(game.applySan('e5').ok).toBe(false)
    expect(game.getSnapshot().termination).toBe('illegal_move')
    expect(occupancyViaSnapshot(game)).toEqual(occupancyViaGet(game))
  })

  it('a pawn captures diagonally onto the victim square', () => {
    const game = new ChessLabGame()
    game.start('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1')
    const result = game.applySan('exd5')
    expect(result.ok).toBe(true)
    const snap = game.getSnapshot()
    expect(snap.lastMove).toMatchObject({
      from: 'e4',
      to: 'd5',
      san: 'exd5',
      capturedSquare: 'd5',
    })
    expect(snap.pieces.find((p) => p.square === 'd5')).toEqual({
      square: 'd5',
      type: 'p',
      color: 'w',
    })
    expect(snap.pieces.find((p) => p.square === 'e4')).toBeUndefined()
    expect(occupancyViaSnapshot(game)).toEqual(occupancyViaGet(game))
  })

  it('en passant removes the pawn that skipped a square, not a piece on the landing square', () => {
    const game = new ChessLabGame()
    game.start()
    for (const san of ['e4', 'a6', 'e5', 'd5']) {
      expect(game.applySan(san).ok).toBe(true)
    }
    const result = game.applySan('exd6')
    expect(result.ok).toBe(true)
    const snap = game.getSnapshot()
    expect(snap.lastMove).toMatchObject({
      from: 'e5',
      to: 'd6',
      san: 'exd6',
      capturedSquare: 'd5',
    })
    expect(snap.pieces.find((p) => p.square === 'd5')).toBeUndefined()
    expect(snap.pieces.find((p) => p.square === 'd6')).toEqual({
      square: 'd6',
      type: 'p',
      color: 'w',
    })
    expect(game.chessInstance().get('d5')).toBeUndefined()
    expect(occupancyViaSnapshot(game)).toEqual(occupancyViaGet(game))
  })

  it('keeps snapshot occupancy in sync with chess.js after mixed captures', () => {
    const game = new ChessLabGame()
    game.start()
    for (const san of ['e4', 'd5', 'exd5', 'Nf6', 'c4', 'c6', 'dxc6', 'Nxc6']) {
      expect(game.applySan(san).ok).toBe(true)
      expect(occupancyViaSnapshot(game)).toEqual(occupancyViaGet(game))
    }
  })
})
