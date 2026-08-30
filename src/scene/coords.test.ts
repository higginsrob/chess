import { describe, expect, it } from 'vitest'
import { PH_BOARD_TOP, PH_SQUARE, squareToLocal } from './coords'

/** Original Poly Haven `piece_rook_white_01` / `piece_pawn_white_01` translations. */
const A1 = [0.20260828733444214, PH_BOARD_TOP, -0.20260828733444214] as const
const A2 = [0.20260828733444214, PH_BOARD_TOP, -0.144720196723938] as const
const E2 = [-0.028944039717316628, PH_BOARD_TOP, -0.144720196723938] as const

describe('squareToLocal', () => {
  it('places a1 / a2 / e2 on the glTF piece translations', () => {
    expect(squareToLocal('a1')[0]).toBeCloseTo(A1[0], 6)
    expect(squareToLocal('a1')[2]).toBeCloseTo(A1[2], 6)
    expect(squareToLocal('a2')[2]).toBeCloseTo(A2[2], 6)
    expect(squareToLocal('e2')[0]).toBeCloseTo(E2[0], 6)
    expect(squareToLocal('e2')[2]).toBeCloseTo(E2[2], 6)
  })

  it('steps exactly one square between adjacent files and ranks', () => {
    const a1 = squareToLocal('a1')
    const b1 = squareToLocal('b1')
    const a2 = squareToLocal('a2')
    expect(a1[0] - b1[0]).toBeCloseTo(PH_SQUARE, 10)
    expect(a2[2] - a1[2]).toBeCloseTo(PH_SQUARE, 10)
  })

  it('keeps rank 8 opposite rank 1 by seven squares', () => {
    const a1 = squareToLocal('a1')
    const a8 = squareToLocal('a8')
    expect(a8[2] - a1[2]).toBeCloseTo(7 * PH_SQUARE, 10)
    expect(a8[0]).toBeCloseTo(a1[0], 10)
  })
})
