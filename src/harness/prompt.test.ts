import { describe, expect, it } from 'vitest'
import { buildChatMessages, buildHarnessPrompt, headerlessMoveText } from './prompt'

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const afterE4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

describe('headerlessMoveText', () => {
  it('strips PGN tags and a trailing asterisk', () => {
    expect(
      headerlessMoveText(
        '[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *',
      ),
    ).toBe('1. e4 e5 2. Nf3')
  })

  it('uses (none) at game start', () => {
    expect(headerlessMoveText('')).toBe('(none)')
    expect(headerlessMoveText('[Event "?"]\n *')).toBe('(none)')
  })
})

describe('buildHarnessPrompt', () => {
  it('is the system contract and appends extra system prompt', () => {
    const prompt = buildHarnessPrompt({
      color: 'w',
      fen: startFen,
      pgn: '',
      legalSans: ['e4', 'd4', 'Nf3'],
      extraSystemPrompt: 'Prefer developing pieces.',
    })
    expect(prompt).toContain('playing chess as White')
    expect(prompt).toContain('{"move": "<SAN>"}')
    expect(prompt).toContain('Piece values: P=1, N=3, B=3, R=5, Q=9.')
    expect(prompt).toContain('tactics briefing')
    expect(prompt).toContain('A draw')
    expect(prompt).toContain('Insufficient material cannot mate')
    expect(prompt).toContain('AFTER you play that SAN')
    expect(prompt).toContain('AVOID')
    expect(prompt).toContain('mate in one')
    expect(prompt).toContain('endgame')
    expect(prompt).not.toContain('"reason"')
    expect(prompt).not.toContain('[Event')
    expect(prompt.endsWith('Prefer developing pieces.')).toBe(true)
  })
})

describe('buildChatMessages', () => {
  it('puts ASCII, headerless moves, and the legal SAN array in the user message', () => {
    const messages = buildChatMessages({
      color: 'b',
      fen: afterE4Fen,
      pgn: '[Event "?"]\n[Site "?"]\n\n1. e4 *',
      lastSan: 'e4',
      legalSans: ['e5', 'c5', 'Nf6'],
      extraSystemPrompt: 'Prefer developing pieces.',
    })
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content.endsWith('Prefer developing pieces.')).toBe(true)
    expect(messages[1]?.role).toBe('user')
    const user = messages[1]!.content
    expect(user).toContain('You are Black to move. Opponent just played e4.')
    expect(user).toContain('8 | r  n  b  q  k  b  n  r |')
    expect(user).toContain(`FEN: ${afterE4Fen}`)
    expect(user).toContain('Moves: 1. e4')
    expect(user).not.toContain('[Event')
    const legalLine = 'Legal SAN (copy one exactly): ["e5","c5","Nf6"]'
    expect(user).toContain(legalLine)
    expect(user).toContain('Material: White 39 — Black 39 (you are Black, 0). P=1 N=3 B=3 R=5 Q=9.')
    expect(user).toContain("Goal: checkmate the opponent's king. A draw is a failure, not a win.")
    expect(user).toContain('White: Ke1 Qd1 Ra1 Rh1 Bc1 Bf1 Nb1 Ng1 a2 b2 c2 d2 e4 f2 g2 h2')
    expect(user).not.toContain('After you play this SAN')
    expect(user).not.toContain('Hanging now')
    expect(user.trim().endsWith('Reply {"move":"<SAN>"} using one string from that list.')).toBe(
      true,
    )
    expect(user.indexOf(legalLine)).toBeGreaterThan(user.indexOf('Moves:'))
  })

  it('does not mention an opponent move at game start', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: startFen,
      pgn: '',
      legalSans: ['e4', 'd4', 'Nf3'],
    })[1]!.content
    expect(user).toContain('You are White to move.')
    expect(user).not.toContain('Opponent just played')
    expect(user).toContain('Moves: (none)')
  })

  it('omits repetition hints when the position is unique', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: startFen,
      pgn: '',
      legalSans: ['e4', 'd4', 'Nf3'],
      positionOccurrences: 1,
    })[1]!.content
    expect(user).not.toContain('This position has occurred')
    expect(user).not.toContain('omitted from the legal SAN list')
  })

  it('notes when repeating SANs were dropped from the legal list', () => {
    const user = buildChatMessages({
      color: 'b',
      fen: startFen,
      pgn: '1. Nf3 Nc6 2. Ng1 Nb8 3. Nf3 Nc6 4. Ng1',
      lastSan: 'Ng1',
      legalSans: ['Na5', 'e5'],
      positionOccurrences: 2,
      filteredRepetition: true,
    })[1]!.content
    expect(user).toContain('This position has occurred 2 times.')
    expect(user).toContain('omitted from the legal SAN list')
    expect(user).toContain('Legal SAN (copy one exactly): ["Na5","e5"]')
    expect(user).not.toContain('"Nb8"')
  })

  it('notes when immediate-draw SANs were dropped from the legal list', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1',
      pgn: '',
      legalSans: ['Nf7', 'Nd4'],
      filteredImmediateDraw: true,
    })[1]!.content
    expect(user).toContain('immediately draw')
    expect(user).toContain('insufficient material')
    expect(user).toContain('Legal SAN (copy one exactly): ["Nf7","Nd4"]')
    expect(user).not.toContain('"Nxe5"')
  })

  it('notes when only mating SANs remain', () => {
    const user = buildChatMessages({
      color: 'b',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
      pgn: '1. f3 e5 2. g4',
      lastSan: 'g4',
      legalSans: ['Qh4#'],
      forcedMate: true,
    })[1]!.content
    expect(user).toContain('Checkmate is available')
    expect(user).toContain('Legal SAN (copy one exactly): ["Qh4#"]')
  })

  it('notes when hanging and mate-in-one SANs were dropped', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: startFen,
      pgn: '',
      legalSans: ['e4', 'd4', 'Nf3'],
      filteredDanger: true,
    })[1]!.content
    expect(user).toContain('hang material')
    expect(user).toContain('mate in one')
  })

  it('notes when the endgame list was narrowed by look-ahead', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: 'k7/8/8/8/8/8/8/Q3K3 w - - 0 1',
      pgn: '',
      legalSans: ['Qd4', 'Qa8', 'Ke2'],
      filteredEndgameShortlist: true,
    })[1]!.content
    expect(user).toContain('strongest endgame continuations')
    expect(user).toContain('one to two ply')
    expect(user).toContain('strongest-first')
  })

  it('notes when endgame SANs are ordered by look-ahead without trimming', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: 'k7/8/8/8/8/8/8/Q3K3 w - - 0 1',
      pgn: '',
      legalSans: ['Qd4', 'Qa8', 'Ke2'],
      rankedEndgame: true,
    })[1]!.content
    expect(user).toContain('ordered strongest-first')
    expect(user).not.toContain('narrowed to the strongest')
  })

  it('includes a tactics briefing for a losing queen capture', () => {
    const queenTakesDefendedPawn =
      'rnbqkb1r/pppp1ppp/5n2/4p2Q/8/8/PPPPPPPP/RNB1KBNR w KQkq - 2 3'
    const user = buildChatMessages({
      color: 'w',
      fen: queenTakesDefendedPawn,
      pgn: '1. e4 Nf6 2. Qh5',
      lastSan: 'Nf6',
      legalSans: ['Qxh7', 'Nf3', 'd3'],
    })[1]!.content
    expect(user).toContain('Material: White 39 — Black 39 (you are White, 0).')
    expect(user).toContain('AVOID Qxh7: takes P; recapture Nxh7; net -8')
    expect(user).toContain('After you play this SAN')
    expect(user).toContain('Hanging now')
    expect(user.trim().endsWith('Reply {"move":"<SAN>"} using one string from that list.')).toBe(
      true,
    )
  })

  it('omits the tactics brief when skipTacticsBrief is set', () => {
    const queenTakesDefendedPawn =
      'rnbqkb1r/pppp1ppp/5n2/4p2Q/8/8/PPPPPPPP/RNB1KBNR w KQkq - 2 3'
    const user = buildChatMessages({
      color: 'w',
      fen: queenTakesDefendedPawn,
      pgn: '1. e4 Nf6 2. Qh5',
      lastSan: 'Nf6',
      legalSans: ['Qxh7', 'Nf3', 'd3'],
      skipTacticsBrief: true,
    })[1]!.content
    expect(user).not.toContain('AVOID Qxh7')
    expect(user).not.toContain("Goal: checkmate the opponent's king")
    expect(user).toContain('Legal SAN (copy one exactly): ["Qxh7","Nf3","d3"]')
  })

  it('uses a precomputed tactics briefing without a second look-ahead', () => {
    const user = buildChatMessages({
      color: 'w',
      fen: startFen,
      pgn: '',
      legalSans: ['e4'],
      tacticsBriefing: 'PRECOMPUTED BRIEF',
    })[1]!.content
    expect(user).toContain('PRECOMPUTED BRIEF')
    expect(user).not.toContain('AVOID')
  })
})
