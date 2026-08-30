import { Chess } from 'chess.js'
import type { ChatMessage, Color } from '../types'
import { tacticsBriefingText } from './tactics'

export interface PromptInput {
  color: Color
  fen: string
  pgn: string
  legalSans: string[]
  lastSan?: string
  extraSystemPrompt?: string
  /** How many times the current position has already occurred (including now). */
  positionOccurrences?: number
  /** True when repeating / threefold SANs were dropped from `legalSans`. */
  filteredRepetition?: boolean
  /** True when immediate-draw SANs (insufficient material, stalemate, 50-move) were dropped. */
  filteredImmediateDraw?: boolean
  /** True when mate-in-1 exists and `legalSans` contains only those mates. */
  forcedMate?: boolean
  /** True when hanging / losing / opponent-mate-in-1 SANs were dropped. */
  filteredDanger?: boolean
  /** True when a sparse endgame list was ranked 1–2 ply and trimmed. */
  filteredEndgameShortlist?: boolean
  /** True when remaining endgame SANs were ordered strongest-first. */
  rankedEndgame?: boolean
  /** Skip the 1–2 ply tactics brief (token estimates; never for a real model turn). */
  skipTacticsBrief?: boolean
  /** Precomputed tactics briefing; skips a second look-ahead pass. */
  tacticsBriefing?: string
}

export function headerlessMoveText(pgn: string): string {
  const stripped = pgn
    .replace(/\[[^\]]*\]\s*/g, '')
    .replace(/\s*\*\s*$/, '')
    .trim()
  return stripped || '(none)'
}

function asciiBoard(fen: string): string {
  try {
    return new Chess(fen).ascii()
  } catch {
    return '(invalid FEN)'
  }
}

function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black'
}

const TACTICAL_COACHING = [
  "Your only win is checkmate of the opponent's king. A draw (stalemate, repetition, fifty-move rule, or insufficient material) is a failure, not a success. Do not stalemate.",
  'Insufficient material cannot mate: king vs king, king+knight vs king, king+bishop vs king, or bishops all on the same color. Do not capture the last pawn, rook, or queen — or a second minor piece — if that leaves one of those dead positions.',
  'The tactics briefing describes the board AFTER you play that SAN, not the current board. The piece you move leaves its old square; judge opponent replies in that resulting position, including whether they can mate in one.',
  'Piece values: P=1, N=3, B=3, R=5, Q=9.',
  'Do not play a move marked AVOID unless every legal move is marked AVOID. AVOID means you hang a piece, leave a piece hanging, lose material, allow mate in one, or draw.',
  'Prefer mate, then captures with positive net, then quiet moves with no AVOID line. In an endgame, make progress every move: promote, advance a pawn, or drive the enemy king to the edge. Do not shuffle.',
].join(' ')

export function buildHarnessPrompt(input: PromptInput): string {
  const extra = input.extraSystemPrompt?.trim()
  const harness = [
    `You are playing chess as ${colorName(input.color)}.`,
    'Reply with JSON only, and no other text: {"move": "<SAN>"}',
    'The move value must be copied exactly from the legal SAN list in the user message. Do not add other keys.',
    TACTICAL_COACHING,
  ].join('\n\n')
  return extra ? `${harness}\n\n${extra}` : harness
}

export function buildUserPrompt(input: PromptInput): string {
  const name = colorName(input.color)
  const status = input.lastSan
    ? `You are ${name} to move. Opponent just played ${input.lastSan}.`
    : `You are ${name} to move.`
  const legal = JSON.stringify(input.legalSans)
  const lines = [
    status,
    `Board:\n${asciiBoard(input.fen)}`,
    `FEN: ${input.fen}`,
    `Moves: ${headerlessMoveText(input.pgn)}`,
    `Legal SAN (copy one exactly): ${legal}`,
  ]
  if ((input.positionOccurrences ?? 0) >= 2) {
    lines.push(`This position has occurred ${input.positionOccurrences} times.`)
  }
  if (input.filteredRepetition) {
    lines.push(
      'Moves that repeat a previous position or draw by threefold were omitted from the legal SAN list. A draw is a failure. Pick a new position.',
    )
  }
  if (input.filteredImmediateDraw) {
    lines.push(
      'Moves that immediately draw (insufficient material, stalemate, or fifty-move rule) were omitted from the legal SAN list. A draw is a failure. Keep mating material: a pawn, rook, queen, or two pieces that can still mate.',
    )
  }
  if (input.forcedMate) {
    lines.push(
      'Checkmate is available. The legal SAN list contains only mating moves. Play one of them.',
    )
  }
  if (input.filteredDanger) {
    lines.push(
      'Moves that hang material, leave a piece hanging, lose a capture, or allow the opponent to mate in one were omitted from the legal SAN list.',
    )
  }
  if (input.filteredEndgameShortlist) {
    lines.push(
      'The legal SAN list was narrowed to the strongest endgame continuations after looking one to two ply ahead (mate, promotion, pawn advance, tightening the net). Copy one of those. The list is ordered strongest-first.',
    )
  } else if (input.rankedEndgame) {
    lines.push(
      'The legal SAN list is ordered strongest-first after looking one to two ply ahead (mate, promotion, pawn advance, tightening the net). Prefer the first SAN unless a later one is clearly better.',
    )
  }
  if (input.tacticsBriefing) {
    lines.push(input.tacticsBriefing)
  } else if (!input.skipTacticsBrief) {
    lines.push(tacticsBriefingText(input.fen, input.color, input.legalSans))
  }
  lines.push('Reply {"move":"<SAN>"} using one string from that list.')
  return lines.join('\n\n')
}

export function buildChatMessages(input: PromptInput): ChatMessage[] {
  return [
    { role: 'system', content: buildHarnessPrompt(input) },
    { role: 'user', content: buildUserPrompt(input) },
  ]
}
