import { describe, expect, it } from 'vitest'
import { ChessLabGame } from './game'
import { finishGameLog, newPlyLog, snapshotSeat } from './log'
import { blankModelConfig, defaultSettings } from '../settings/defaults'

describe('finishGameLog', () => {
  it('records an illegal-move forfeit with the attempted SAN', () => {
    const game = new ChessLabGame()
    game.start()
    const fenBefore = game.getSnapshot().fen
    game.applySan('Nf4')
    const snap = game.getSnapshot()
    expect(snap.termination).toBe('illegal_move')
    expect(snap.winner).toBe('b')

    const log = finishGameLog({
      id: 'g1',
      startedAt: '2026-01-01T00:00:00.000Z',
      white: { type: 'model' },
      black: { type: 'human' },
      plies: [
        newPlyLog({
          ply: 1,
          color: 'w',
          fenBefore,
          san: 'Nf4',
          parseResult: 'illegal',
        }),
      ],
      snapshot: snap,
      termination: snap.termination!,
      winner: snap.winner!,
    })

    expect(log.termination).toBe('illegal_move')
    expect(log.winner).toBe('b')
    expect(log.plies).toHaveLength(1)
    expect(log.plies[0]?.parseResult).toBe('illegal')
    expect(log.material.white).toBe(39)
    expect(log.material.black).toBe(39)
  })
})

describe('snapshotSeat', () => {
  it('records legalMoveSchema on the model snapshot', () => {
    const settings = defaultSettings()
    const config = blankModelConfig(settings.providers[0]!.id)
    config.legalMoveSchema = true
    settings.modelConfigs = [config]
    const snap = snapshotSeat({ type: 'model', modelConfigId: config.id }, settings)
    expect(snap.modelConfig?.legalMoveSchema).toBe(true)
    expect(snap.modelConfig?.jsonMode).toBe(true)
  })

  it('records num_ctx on local model snapshots', () => {
    const settings = defaultSettings()
    const config = blankModelConfig(settings.providers[0]!.id)
    config.numCtx = { enabled: true, value: 4096 }
    settings.modelConfigs = [config]
    const snap = snapshotSeat({ type: 'model', modelConfigId: config.id }, settings)
    expect(snap.modelConfig?.num_ctx).toBe(4096)
  })
})
