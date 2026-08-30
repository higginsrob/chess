import { describe, expect, it, vi } from 'vitest'
import type { GameLog, PlyLog } from '../types'
import { annotateGame, ensureAnnotated, isAnnotatablePly } from './annotate'

const init = vi.fn(async () => true)
const evaluate = vi.fn()

vi.mock('./engine', () => ({
  getStockfish: () => ({ init, evaluate }),
}))

function ply(partial: Partial<PlyLog> & Pick<PlyLog, 'parseResult'>): PlyLog {
  return {
    ply: 1,
    color: 'w',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    ...partial,
  }
}

function log(plies: PlyLog[]): GameLog {
  return {
    id: 'g1',
    harnessVersion: '0.1.0',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    white: { type: 'model' },
    black: { type: 'human' },
    plies,
    pgn: '',
    fenEnd: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    termination: 'illegal_move',
    winner: 'b',
    material: { white: 39, black: 39 },
  }
}

describe('isAnnotatablePly', () => {
  it('skips illegal and unparseable plies', () => {
    expect(isAnnotatablePly(ply({ parseResult: 'illegal', san: 'Nf4' }))).toBe(false)
    expect(isAnnotatablePly(ply({ parseResult: 'unparseable' }))).toBe(false)
    expect(isAnnotatablePly(ply({ parseResult: 'ok', san: 'e4' }))).toBe(true)
  })
})

describe('annotateGame', () => {
  it('does not boot Stockfish for a pure illegal-move forfeit', async () => {
    init.mockClear()
    evaluate.mockClear()
    const result = await annotateGame(
      log([ply({ parseResult: 'illegal', san: 'Nf4' })]),
    )
    expect(init).not.toHaveBeenCalled()
    expect(evaluate).not.toHaveBeenCalled()
    expect(result.stockfish).toBeUndefined()
  })
})

describe('ensureAnnotated', () => {
  it('skips the engine when a summary is already present', async () => {
    init.mockClear()
    evaluate.mockClear()
    const already = log([ply({ parseResult: 'ok', san: 'e4' })])
    already.stockfish = {
      acplWhite: 12,
      acplBlack: 40,
      inaccuracies: 1,
      mistakes: 0,
      blunders: 0,
      depth: 12,
    }
    const result = await ensureAnnotated(already)
    expect(init).not.toHaveBeenCalled()
    expect(result.stockfish?.acplWhite).toBe(12)
  })
})
