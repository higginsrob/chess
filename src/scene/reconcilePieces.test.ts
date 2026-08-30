import { describe, expect, it } from 'vitest'
import { reconcilePieces, type VisualPiece } from './reconcilePieces'
import type { LastMove, PieceOnBoard } from '../types'

function vp(id: string, square: VisualPiece['square'], type: VisualPiece['type'], color: VisualPiece['color']): VisualPiece {
  return { id, square, type, color }
}

function p(square: PieceOnBoard['square'], type: PieceOnBoard['type'], color: PieceOnBoard['color']): PieceOnBoard {
  return { square, type, color }
}

describe('reconcilePieces', () => {
  it('slides the capturing pawn diagonally, not a neighbor of the same type', () => {
    const prev = [
      vp('d', 'd4', 'p', 'w'),
      vp('e', 'e4', 'p', 'w'),
      vp('victim', 'e5', 'p', 'b'),
    ]
    const next = [p('e5', 'p', 'w'), p('e4', 'p', 'w')]
    const lastMove: LastMove = { from: 'd4', to: 'e5', san: 'dxe5', capturedSquare: 'e5' }
    const { visual, captured } = reconcilePieces(prev, next, lastMove)
    expect(visual.find((x) => x.id === 'd')?.square).toBe('e5')
    expect(visual.find((x) => x.id === 'e')?.square).toBe('e4')
    expect(captured.map((x) => x.id)).toEqual(['victim'])
  })

  it('removes an en passant victim on its own square, one rank behind the landing square', () => {
    const prev = [
      vp('w', 'e5', 'p', 'w'),
      vp('b', 'd5', 'p', 'b'),
      vp('other', 'a2', 'p', 'w'),
    ]
    const next = [p('d6', 'p', 'w'), p('a2', 'p', 'w')]
    const lastMove: LastMove = { from: 'e5', to: 'd6', san: 'exd6', capturedSquare: 'd5' }
    const { visual, captured } = reconcilePieces(prev, next, lastMove)
    expect(visual.find((x) => x.id === 'w')?.square).toBe('d6')
    expect(captured).toEqual([expect.objectContaining({ id: 'b', square: 'd5' })])
  })

  it('does not steal a same-file pawn when two white pawns both advanced in one snapshot', () => {
    const prev = [vp('d', 'd2', 'p', 'w'), vp('e', 'e2', 'p', 'w')]
    const next = [p('e4', 'p', 'w'), p('d3', 'p', 'w')]
    const { visual } = reconcilePieces(prev, next, null)
    expect(visual.find((x) => x.id === 'e')?.square).toBe('e4')
    expect(visual.find((x) => x.id === 'd')?.square).toBe('d3')
  })

  it('promotes by keeping the pawn id and changing type', () => {
    const prev = [vp('p', 'e7', 'p', 'w'), vp('q', 'd1', 'q', 'w')]
    const next = [p('e8', 'q', 'w'), p('d1', 'q', 'w')]
    const lastMove: LastMove = { from: 'e7', to: 'e8', san: 'e8=Q' }
    const { visual, captured } = reconcilePieces(prev, next, lastMove)
    expect(visual.find((x) => x.id === 'p')).toEqual({ id: 'p', square: 'e8', type: 'q', color: 'w' })
    expect(visual.find((x) => x.id === 'q')?.square).toBe('d1')
    expect(captured).toEqual([])
  })

  it('moves both king and rook on a castle', () => {
    const prev = [vp('k', 'e1', 'k', 'w'), vp('h', 'h1', 'r', 'w'), vp('a', 'a1', 'r', 'w')]
    const next = [p('g1', 'k', 'w'), p('f1', 'r', 'w'), p('a1', 'r', 'w')]
    const lastMove: LastMove = { from: 'e1', to: 'g1', san: 'O-O' }
    const { visual } = reconcilePieces(prev, next, lastMove)
    expect(visual.find((x) => x.id === 'k')?.square).toBe('g1')
    expect(visual.find((x) => x.id === 'h')?.square).toBe('f1')
    expect(visual.find((x) => x.id === 'a')?.square).toBe('a1')
  })
})
