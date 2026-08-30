import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { classifyRepetition, positionOccurrenceCount, threefoldDrawSans } from './repetition'

const KNIGHT_SHUFFLE = ['Nf3', 'Nc6', 'Ng1', 'Nb8'] as const

function play(sans: string[]): Chess {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess
}

describe('positionOccurrenceCount', () => {
  it('is 1 at the start', () => {
    expect(positionOccurrenceCount(new Chess())).toBe(1)
  })

  it('is 2 after one knight-shuffle cycle back to the start', () => {
    const chess = play([...KNIGHT_SHUFFLE])
    expect(positionOccurrenceCount(chess)).toBe(2)
  })
})

describe('threefoldDrawSans', () => {
  it('is empty at the start', () => {
    expect(threefoldDrawSans(new Chess())).toEqual([])
  })

  it('is empty after one cycle (second visit, not yet a draw)', () => {
    const chess = play([...KNIGHT_SHUFFLE])
    expect(threefoldDrawSans(chess)).toEqual([])
  })

  it('lists Nb8 when that move would be the third visit to the start', () => {
    const chess = play([...KNIGHT_SHUFFLE, 'Nf3', 'Nc6', 'Ng1'])
    expect(threefoldDrawSans(chess)).toContain('Nb8')
  })

  it('does not mutate the original game', () => {
    const chess = play([...KNIGHT_SHUFFLE, 'Nf3', 'Nc6', 'Ng1'])
    const fen = chess.fen()
    threefoldDrawSans(chess)
    expect(chess.fen()).toBe(fen)
    expect(chess.history()).toHaveLength(7)
  })
})

describe('classifyRepetition', () => {
  it('offers every opening move (all fresh)', () => {
    const chess = new Chess()
    const classified = classifyRepetition(chess)
    expect(classified.repeatSans).toEqual([])
    expect(classified.threefoldDrawSans).toEqual([])
    expect(classified.offeredSans).toEqual(chess.moves())
    expect(classified.offeredSans).toContain('e4')
    expect(classified.offeredSans).toContain('Nf3')
  })

  it('drops Nf3 after one knight-shuffle cycle because it repeats', () => {
    const chess = play([...KNIGHT_SHUFFLE])
    const classified = classifyRepetition(chess)
    expect(classified.positionOccurrences).toBe(2)
    expect(classified.repeatSans).toContain('Nf3')
    expect(classified.offeredSans).not.toContain('Nf3')
    expect(classified.offeredSans.length).toBeGreaterThan(0)
    expect(classified.offeredSans).toContain('e4')
  })

  it('drops the threefold SAN when other moves exist', () => {
    const chess = play([...KNIGHT_SHUFFLE, 'Nf3', 'Nc6', 'Ng1'])
    const classified = classifyRepetition(chess)
    expect(classified.threefoldDrawSans).toContain('Nb8')
    expect(classified.offeredSans).not.toContain('Nb8')
    expect(classified.offeredSans.length).toBeGreaterThan(0)
  })

  it('keeps the order of the provided legal SAN list', () => {
    const chess = play([...KNIGHT_SHUFFLE])
    const legal = chess.moves()
    const offered = classifyRepetition(chess, legal).offeredSans
    const indexes = offered.map((san) => legal.indexOf(san))
    expect(indexes.every((i) => i >= 0)).toBe(true)
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)
  })
})
