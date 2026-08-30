import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { classifyImmediateDraws, resultLine, scoreLabel, winnerLabel } from './termination'

describe('result labels', () => {
  it('names the winner and PGN score', () => {
    expect(winnerLabel('w')).toBe('White wins')
    expect(winnerLabel('b')).toBe('Black wins')
    expect(winnerLabel('draw')).toBe('Draw')
    expect(scoreLabel('w')).toBe('1–0')
    expect(scoreLabel('b')).toBe('0–1')
    expect(scoreLabel('draw')).toBe('½–½')
  })

  it('joins termination and winner for HUD / notebook copy', () => {
    expect(resultLine('checkmate', 'b')).toBe('Checkmate · Black wins')
    expect(resultLine('stalemate', 'draw')).toBe('Stalemate · Draw')
    expect(resultLine('illegal_move', 'w')).toBe('Illegal move (forfeit) · White wins')
  })
})

/** White knight can take Black's last pawn, leaving K+N vs K. */
const KNIGHT_TAKES_LAST_PAWN = '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1'
/** Qb3 stalemates the king on a1. */
const STALEMATE_QB3 = '8/8/8/8/8/5Q2/8/k1K5 w - - 0 1'

describe('classifyImmediateDraws', () => {
  it('offers every opening move', () => {
    const chess = new Chess()
    const legal = chess.moves()
    const classified = classifyImmediateDraws(chess, legal)
    expect(classified.drawSans).toEqual([])
    expect(classified.offeredSans).toEqual(legal)
  })

  it('drops Nxe5 when that capture leaves insufficient material', () => {
    const chess = new Chess(KNIGHT_TAKES_LAST_PAWN)
    const legal = chess.moves()
    expect(legal).toContain('Nxe5')
    const classified = classifyImmediateDraws(chess, legal)
    expect(classified.drawSans).toContain('Nxe5')
    expect(classified.offeredSans).not.toContain('Nxe5')
    expect(classified.offeredSans.length).toBeGreaterThan(0)
  })

  it('drops a stalemating SAN when other moves exist', () => {
    const chess = new Chess(STALEMATE_QB3)
    const legal = chess.moves()
    expect(legal).toContain('Qb3')
    const classified = classifyImmediateDraws(chess, legal)
    expect(classified.drawSans).toContain('Qb3')
    expect(classified.offeredSans).not.toContain('Qb3')
    expect(classified.offeredSans.length).toBeGreaterThan(0)
  })

  it('keeps a drawing SAN when it is the only legal move', () => {
    const chess = new Chess(KNIGHT_TAKES_LAST_PAWN)
    const classified = classifyImmediateDraws(chess, ['Nxe5'])
    expect(classified.drawSans).toEqual(['Nxe5'])
    expect(classified.offeredSans).toEqual(['Nxe5'])
  })

  it('does not mutate the original game', () => {
    const chess = new Chess(KNIGHT_TAKES_LAST_PAWN)
    const fen = chess.fen()
    classifyImmediateDraws(chess, chess.moves())
    expect(chess.fen()).toBe(fen)
  })
})
