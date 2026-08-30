import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { formatTacticsBrief, tacticsBrief, tacticsBriefAsync } from './tactics'

function sans(fen: string): string[] {
  return new Chess(fen).moves()
}

function captureLine(fen: string, san: string) {
  const line = tacticsBrief(fen, sans(fen)).moves.find((m) => m.san === san)
  expect(line, `expected a tactics line for ${san}`).toBeDefined()
  return line!
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
/** 1.Nf3 e5 — e5 is a free pawn. */
const FREE_PAWN = 'rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2'
/** Qh5 vs ...e5 Nf6 — Qxh7 loses the queen for a pawn recaptured by the knight. */
const QUEEN_TAKES_DEFENDED_PAWN =
  'rnbqkb1r/pppp1ppp/5n2/4p2Q/8/8/PPPPPPPP/RNB1KBNR w KQkq - 2 3'
/** White Nf3 can take Black's knight on e5; Black recaptures with the other knight. */
const EVEN_KNIGHTS = 'r1bqkbnr/pppp1ppp/2n5/4n3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 4 4'
/** Qh8+ hangs the queen to the knight on f7. */
const HANGING_QUEEN_CHECK = '4k3/5n2/8/8/8/8/8/Q3K3 w - - 0 1'
/** After 1.f3 e5 2.g4, Black has Qh4#. */
const FOOLS_MATE = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2'
/** Unprotected white knight on b5, Black pawn on a6 can take next. */
const HANGING_KNIGHT = 'rnbqkbnr/1ppppppp/p7/1N6/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 3'
/** Rook on e1 is the only defender of e4 against dxe4. */
const LEAVES_DEFENDER = '4k3/8/8/3p4/4P3/8/8/4RK2 w - - 0 1'
/** Qb3 stalemates the king on a1. */
const STALEMATE_QB3 = '8/8/8/8/8/5Q2/8/k1K5 w - - 0 1'
/** White knight can take Black's last pawn, leaving K+N vs K. */
const KNIGHT_TAKES_LAST_PAWN = '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1'

describe('tacticsBrief', () => {
  it('reports even material and no captures or hangs at the start', () => {
    const brief = tacticsBrief(START, ['e4', 'd4', 'Nf3'])
    expect(brief.white).toBe(39)
    expect(brief.black).toBe(39)
    expect(brief.you).toBe(0)
    expect(brief.moves).toEqual([])
    expect(brief.hanging).toEqual([])
  })

  it('async brief matches the sync brief', async () => {
    const legal = sans(START)
    expect(await tacticsBriefAsync(START, legal)).toEqual(tacticsBrief(START, legal))
  })

  it('lists a free pawn capture with no recapture and net +1', () => {
    const line = captureLine(FREE_PAWN, 'Nxe5')
    expect(line.kind).toBe('capture')
    expect(line.takes).toBe('p')
    expect(line.recaptureSan).toBeUndefined()
    expect(line.net).toBe(1)
  })

  it('lists queen takes a defended pawn as net -8', () => {
    const line = captureLine(QUEEN_TAKES_DEFENDED_PAWN, 'Qxh7')
    expect(line.kind).toBe('capture')
    expect(line.takes).toBe('p')
    expect(line.recaptureSan).toBe('Nxh7')
    expect(line.net).toBe(-8)
  })

  it('lists an even knight recapture as net 0', () => {
    const line = captureLine(EVEN_KNIGHTS, 'Nxe5')
    expect(line.kind).toBe('capture')
    expect(line.takes).toBe('n')
    expect(line.recaptureSan).toBe('Nxe5')
    expect(line.net).toBe(0)
  })

  it('flags a checking queen move that hangs the queen', () => {
    const line = captureLine(HANGING_QUEEN_CHECK, 'Qh8+')
    expect(line.kind).toBe('hang')
    expect(line.hangs).toBe('q')
    expect(line.recaptureSan).toBe('Nxh8')
    expect(line.net).toBe(-9)
  })

  it('calls out mate regardless of material', () => {
    const line = captureLine(FOOLS_MATE, 'Qh4#')
    expect(line.kind).toBe('mate')
    expect(line.net).toBe(0)
  })

  it('lists a currently hanging knight the opponent can take next', () => {
    const brief = tacticsBrief(HANGING_KNIGHT, sans(HANGING_KNIGHT))
    const nb5 = brief.hanging.find((h) => h.square === 'b5')
    expect(nb5).toMatchObject({ piece: 'n', viaSan: 'axb5', net: -3 })
  })

  it('only annotates SANs from the offered list', () => {
    const brief = tacticsBrief(FREE_PAWN, ['Nf3', 'e3'])
    expect(brief.moves.find((m) => m.san === 'Nxe5')).toBeUndefined()
  })

  it('flags moving a defender so a pawn hangs after the move', () => {
    const line = captureLine(LEAVES_DEFENDER, 'Rd1')
    expect(line.kind).toBe('leaves')
    expect(line.leavesHanging).toEqual([
      expect.objectContaining({ square: 'e4', piece: 'p', viaSan: 'dxe4', net: -1 }),
    ])
  })

  it('flags a stalemate as a failing draw', () => {
    const line = captureLine(STALEMATE_QB3, 'Qb3')
    expect(line.kind).toBe('draw')
    expect(line.drawReason).toBe('stalemate')
  })

  it('flags capturing the last pawn into K+N vs K as insufficient material', () => {
    const line = captureLine(KNIGHT_TAKES_LAST_PAWN, 'Nxe5')
    expect(line.kind).toBe('draw')
    expect(line.drawReason).toBe('insufficient_material')
  })

  it('flags a quiet move that allows opponent mate in one', () => {
    const allowsFoolsMate = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'
    const line = captureLine(allowsFoolsMate, 'g4')
    expect(line.kind).toBe('threat')
    expect(line.threatSan).toBe('Qh4#')
  })
})

describe('formatTacticsBrief', () => {
  it('always includes material and omits empty capture/hang sections at the start', () => {
    const text = formatTacticsBrief(tacticsBrief(START, ['e4', 'd4', 'Nf3']), 'w')
    expect(text).toContain('Material: White 39 — Black 39 (you are White, 0). P=1 N=3 B=3 R=5 Q=9.')
    expect(text).toContain("Goal: checkmate the opponent's king. A draw is a failure, not a win.")
    expect(text).toContain('White: Ke1 Qd1 Ra1 Rh1 Bc1 Bf1 Nb1 Ng1 a2 b2 c2 d2 e2 f2 g2 h2')
    expect(text).not.toContain('After you play this SAN')
    expect(text).not.toContain('Hanging now')
    expect(text).not.toContain('insufficient material')
  })

  it('formats a losing queen capture with recapture and net', () => {
    const text = formatTacticsBrief(
      tacticsBrief(QUEEN_TAKES_DEFENDED_PAWN, sans(QUEEN_TAKES_DEFENDED_PAWN)),
      'w',
    )
    expect(text).toContain('AVOID Qxh7: takes P; recapture Nxh7; net -8')
  })

  it('formats a free take, a hanging check, and mate', () => {
    expect(
      formatTacticsBrief(tacticsBrief(FREE_PAWN, sans(FREE_PAWN)), 'w'),
    ).toContain('- Nxe5: takes P; no recapture; net 1')
    expect(
      formatTacticsBrief(tacticsBrief(HANGING_QUEEN_CHECK, sans(HANGING_QUEEN_CHECK)), 'w'),
    ).toContain('- AVOID Qh8+: after the move, Q hangs to Nxh8; net -9')
    expect(formatTacticsBrief(tacticsBrief(FOOLS_MATE, sans(FOOLS_MATE)), 'b')).toContain(
      '- Qh4#: mate',
    )
    expect(formatTacticsBrief(tacticsBrief(LEAVES_DEFENDER, ['Rd1']), 'w')).toContain(
      'AVOID Rd1: after the move, leaves Pe4 hanging to dxe4 (net -1)',
    )
    expect(formatTacticsBrief(tacticsBrief(STALEMATE_QB3, ['Qb3']), 'w')).toContain(
      'AVOID Qb3: FAILING — draw by stalemate',
    )
    expect(
      formatTacticsBrief(tacticsBrief(KNIGHT_TAKES_LAST_PAWN, ['Nxe5']), 'w'),
    ).toContain('AVOID Nxe5: FAILING — draw by insufficient material')
    expect(
      formatTacticsBrief(tacticsBrief(KNIGHT_TAKES_LAST_PAWN, ['Nxe5']), 'w'),
    ).toContain('Only one pawn, rook, or queen remains')
  })

  it('formats a quiet move that allows opponent mate in one', () => {
    const allowsFoolsMate = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'
    expect(formatTacticsBrief(tacticsBrief(allowsFoolsMate, ['g4']), 'w')).toContain(
      'AVOID g4: opponent mates with Qh4#',
    )
  })

  it('coaches conversion when few pieces remain and you are ahead', () => {
    const text = formatTacticsBrief(
      tacticsBrief('k7/8/8/8/8/8/8/Q3K3 w - - 0 1', ['Qd4', 'Ke2']),
      'w',
    )
    expect(text).toContain('Endgame: you are ahead')
    expect(text).toContain('promote a pawn')
  })
})
