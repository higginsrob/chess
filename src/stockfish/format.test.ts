import { describe, expect, it } from 'vitest'
import {
  evalAdvantage,
  evalBarPercent,
  formatEval,
  formatPlyEval,
  whitePerspectiveCp,
} from './format'

describe('formatEval', () => {
  it('prints White-positive pawns from the side to move', () => {
    expect(formatEval({ cp: 32, sideToMove: 'w' })).toBe('+0.32')
    expect(formatEval({ cp: 32, sideToMove: 'b' })).toBe('-0.32')
    expect(formatEval({ cp: 0, sideToMove: 'w' })).toBe('0.00')
  })

  it('prints mate from White’s view', () => {
    expect(formatEval({ mate: 3, sideToMove: 'w' })).toBe('M3')
    expect(formatEval({ mate: 3, sideToMove: 'b' })).toBe('-M3')
    expect(formatEval({ mate: -2, sideToMove: 'w' })).toBe('-M2')
  })

  it('formats a ply using the position after the move', () => {
    expect(formatPlyEval({ color: 'w', evalCp: 40 })).toBe('-0.40')
    expect(formatPlyEval({ color: 'b', evalCp: 40 })).toBe('+0.40')
    expect(formatPlyEval({ color: 'w' })).toBeNull()
  })
})

describe('evalBarPercent', () => {
  it('fills toward White as the score rises', () => {
    expect(evalBarPercent({ cp: 0, sideToMove: 'w' })).toBe(50)
    expect(evalBarPercent({ cp: 800, sideToMove: 'w' })).toBe(100)
    expect(evalBarPercent({ mate: 1, sideToMove: 'b' })).toBe(0)
  })
})

describe('evalAdvantage', () => {
  it('classifies the formatted label', () => {
    expect(evalAdvantage('+0.32')).toBe('white')
    expect(evalAdvantage('-M2')).toBe('black')
    expect(evalAdvantage('0.00')).toBe('even')
  })
})

describe('whitePerspectiveCp', () => {
  it('flips when Black is to move', () => {
    expect(whitePerspectiveCp(100, 'w')).toBe(100)
    expect(whitePerspectiveCp(100, 'b')).toBe(-100)
  })
})
