import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  classifyTacticalOffers,
  classifyTacticalOffersAsync,
  ENDGAME_SHORTLIST,
  isSparseEndgame,
  scoreEndgameMove,
} from './lookAhead'
import { tacticsBrief } from './tactics'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
/** After 1.f3 e5 — g4 allows Qh4#. */
const ALLOWS_FOOLS_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'
const FOOLS_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2'
const HANGING_QUEEN_CHECK = '4k3/5n2/8/8/8/8/8/Q3K3 w - - 0 1'
const KQ_VS_K = 'k7/8/8/8/8/8/8/Q3K3 w - - 0 1'
const PAWN_ON_SEVENTH = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'
const KNIGHT_TAKES_LAST_PAWN = '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1'

function sans(fen: string): string[] {
  return new Chess(fen).moves()
}

describe('tacticsBrief opponent mate-in-1', () => {
  it('flags g4 as a threat because Black mates with Qh4', () => {
    const line = tacticsBrief(ALLOWS_FOOLS_MATE, sans(ALLOWS_FOOLS_MATE)).moves.find(
      (m) => m.san === 'g4',
    )
    expect(line).toMatchObject({ kind: 'threat', threatSan: 'Qh4#' })
  })
})

describe('classifyTacticalOffers', () => {
  it('leaves the opening list intact', () => {
    const legal = sans(START)
    const classified = classifyTacticalOffers(START, legal)
    expect(classified.offeredSans).toEqual(legal)
    expect(classified.forcedMate).toBe(false)
    expect(classified.filteredDanger).toBe(false)
    expect(classified.filteredEndgameShortlist).toBe(false)
    expect(classified.rankedEndgame).toBe(false)
  })

  it('async classify matches the sync classify', async () => {
    const legal = sans(START)
    expect(await classifyTacticalOffersAsync(START, legal)).toEqual(
      classifyTacticalOffers(START, legal),
    )
  })

  it('offers only mating SANs when mate in one exists', () => {
    const legal = sans(FOOLS_MATE)
    expect(legal.length).toBeGreaterThan(1)
    expect(legal).toContain('Qh4#')
    const classified = classifyTacticalOffers(FOOLS_MATE, legal)
    expect(classified.forcedMate).toBe(true)
    expect(classified.offeredSans).toEqual(['Qh4#'])
  })

  it('drops a hanging queen check when safer moves exist', () => {
    const legal = sans(HANGING_QUEEN_CHECK)
    expect(legal).toContain('Qh8+')
    const classified = classifyTacticalOffers(HANGING_QUEEN_CHECK, legal)
    expect(classified.filteredDanger).toBe(true)
    expect(classified.offeredSans).not.toContain('Qh8+')
    expect(classified.offeredSans.length).toBeGreaterThan(0)
  })

  it('drops a move that allows opponent mate in one', () => {
    const legal = sans(ALLOWS_FOOLS_MATE)
    expect(legal).toContain('g4')
    const classified = classifyTacticalOffers(ALLOWS_FOOLS_MATE, legal)
    expect(classified.filteredDanger).toBe(true)
    expect(classified.offeredSans).not.toContain('g4')
  })

  it('keeps an AVOID move when it is the only offered SAN', () => {
    const classified = classifyTacticalOffers(HANGING_QUEEN_CHECK, ['Qh8+'])
    expect(classified.offeredSans).toEqual(['Qh8+'])
    expect(classified.filteredDanger).toBe(false)
  })

  it('drops capturing the last pawn into K+N vs K when alternatives exist', () => {
    const legal = sans(KNIGHT_TAKES_LAST_PAWN)
    expect(legal).toContain('Nxe5')
    const classified = classifyTacticalOffers(KNIGHT_TAKES_LAST_PAWN, legal)
    expect(classified.offeredSans).not.toContain('Nxe5')
    expect(classified.filteredDanger).toBe(true)
  })

  it('shortlists a queen endgame instead of offering every queen tour', () => {
    const legal = sans(KQ_VS_K)
    expect(legal.length).toBeGreaterThan(ENDGAME_SHORTLIST)
    const classified = classifyTacticalOffers(KQ_VS_K, legal)
    expect(classified.filteredEndgameShortlist).toBe(true)
    expect(classified.rankedEndgame).toBe(true)
    expect(classified.offeredSans.length).toBe(ENDGAME_SHORTLIST)
    expect(classified.offeredSans.every((san) => legal.includes(san))).toBe(true)
    expect(classified.offeredSans[0]?.startsWith('Q')).toBe(true)
  })

  it('keeps promoting a seventh-rank pawn in the endgame shortlist', () => {
    const legal = sans(PAWN_ON_SEVENTH)
    const classified = classifyTacticalOffers(PAWN_ON_SEVENTH, legal)
    expect(classified.offeredSans[0]?.startsWith('a8=Q')).toBe(true)
    expect(classified.rankedEndgame).toBe(true)
  })
})

describe('isSparseEndgame', () => {
  it('is false at the start and true for KQ vs K', () => {
    expect(isSparseEndgame(new Chess(START))).toBe(false)
    expect(isSparseEndgame(new Chess(KQ_VS_K))).toBe(true)
    expect(isSparseEndgame(new Chess(PAWN_ON_SEVENTH))).toBe(true)
  })
})

describe('scoreEndgameMove', () => {
  it('scores mate above a quiet king walk', () => {
    const mateFen = 'k7/7Q/8/8/8/8/8/4K3 w - - 0 1'
    const chess = new Chess(mateFen)
    expect(scoreEndgameMove(chess, 'Qg8#', 9)).toBeGreaterThan(
      scoreEndgameMove(chess, 'Ke2', 9),
    )
  })
})
