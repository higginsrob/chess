import { describe, expect, it } from 'vitest'
import type { GameLog } from '../types'
import { zipLogFiles } from './exportZip'

function log(partial: Partial<GameLog> & Pick<GameLog, 'id'>): GameLog {
  return {
    harnessVersion: '0.1.0',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    white: { type: 'model', modelConfig: { name: 'A', model: 'a', timeoutMs: 1, jsonMode: true } },
    black: { type: 'human' },
    plies: [
      {
        ply: 1,
        color: 'w',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        san: 'e4',
        parseResult: 'ok',
        evalCp: 30,
        cpLoss: 12,
        classification: null,
      },
    ],
    pgn: '1. e4',
    fenEnd: '',
    termination: 'checkmate',
    winner: 'w',
    material: { white: 39, black: 39 },
    stockfish: {
      acplWhite: 12,
      acplBlack: 40,
      inaccuracies: 0,
      mistakes: 0,
      blunders: 0,
      depth: 12,
    },
    ...partial,
  }
}

describe('zipLogFiles', () => {
  it('embeds Stockfish summaries in each game file and in summary.json', () => {
    const files = zipLogFiles([log({ id: 'aaaaaaaa-1111-2222-3333-444444444444' })])
    expect(files['summary.json']).toBeDefined()
    const summary = JSON.parse(files['summary.json']!) as {
      annotatedGames: number
      acplWhite: number
      acplBlack: number
    }
    expect(summary.annotatedGames).toBe(1)
    expect(summary.acplWhite).toBe(12)
    expect(summary.acplBlack).toBe(40)

    const gameName = Object.keys(files).find((name) => name.endsWith('aaaaaaaa.json'))
    expect(gameName).toBeTruthy()
    const game = JSON.parse(files[gameName!]!) as GameLog
    expect(game.stockfish?.acplWhite).toBe(12)
    expect(game.plies[0]?.cpLoss).toBe(12)
  })
})
