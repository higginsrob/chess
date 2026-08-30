import { describe, expect, it } from 'vitest'
import { aggregateLogs } from './metrics'
import type { GameLog } from '../types'

function log(partial: Partial<GameLog> & Pick<GameLog, 'id' | 'termination' | 'winner'>): GameLog {
  return {
    harnessVersion: '0.1.0',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    white: { type: 'human' },
    black: { type: 'human' },
    plies: [],
    pgn: '',
    fenEnd: '',
    material: { white: 0, black: 0 },
    ...partial,
  }
}

describe('aggregateLogs', () => {
  it('treats illegal-move forfeit rate as games lost to illegal or unparseable moves', () => {
    const metrics = aggregateLogs([
      log({ id: '1', termination: 'illegal_move', winner: 'b' }),
      log({ id: '2', termination: 'unparseable_move', winner: 'w' }),
      log({ id: '3', termination: 'checkmate', winner: 'w' }),
      log({ id: '4', termination: 'stalemate', winner: 'draw' }),
    ])
    expect(metrics.games).toBe(4)
    expect(metrics.illegalForfeitRate).toBe(0.5)
    expect(metrics.whiteWins).toBe(2)
    expect(metrics.draws).toBe(1)
    expect(metrics.blackWins).toBe(1)
    expect(metrics.annotatedGames).toBe(0)
  })

  it('averages Stockfish ACPL only over annotated games', () => {
    const metrics = aggregateLogs([
      log({
        id: '1',
        termination: 'checkmate',
        winner: 'w',
        stockfish: {
          acplWhite: 20,
          acplBlack: 40,
          inaccuracies: 1,
          mistakes: 0,
          blunders: 1,
          depth: 12,
        },
      }),
      log({
        id: '2',
        termination: 'checkmate',
        winner: 'b',
        stockfish: {
          acplWhite: 40,
          acplBlack: 20,
          inaccuracies: 0,
          mistakes: 1,
          blunders: 0,
          depth: 12,
        },
      }),
      log({ id: '3', termination: 'illegal_move', winner: 'b' }),
    ])
    expect(metrics.annotatedGames).toBe(2)
    expect(metrics.acplWhite).toBe(30)
    expect(metrics.acplBlack).toBe(30)
    expect(metrics.inaccuracies).toBe(1)
    expect(metrics.mistakes).toBe(1)
    expect(metrics.blunders).toBe(1)
  })
})
