import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { Color, TerminationReason } from '../types'
import {
  materialCount,
  pieceLetter,
  pieceValue,
  PIECE_VALUES_LEGEND,
} from './material'
import { detectNaturalEnd } from './termination'
import { yieldIfBusy } from './yieldToPaint'

const TYPE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

const DRAW_LABEL: Partial<Record<TerminationReason, string>> = {
  stalemate: 'stalemate',
  insufficient_material: 'insufficient material',
  fifty_move_rule: 'fifty-move rule',
  threefold_repetition: 'threefold repetition',
}

export interface CaptureOrHangLine {
  san: string
  kind: 'mate' | 'draw' | 'threat' | 'capture' | 'hang' | 'leaves'
  /** Captured piece, when the move is a capture. */
  takes?: PieceSymbol
  recaptureSan?: string
  /** Piece that would hang on the destination, when `kind` is hang. */
  hangs?: PieceSymbol
  net: number
  drawReason?: TerminationReason
  /** Opponent SAN that checkmates after this move, when `kind` is threat. */
  threatSan?: string
  /** Own pieces that become hanging only after this move (defender left). */
  leavesHanging: HangingPieceLine[]
}

export interface HangingPieceLine {
  square: Square
  piece: PieceSymbol
  viaSan: string
  net: number
}

export interface TacticsBrief {
  white: number
  black: number
  you: number
  inCheck: boolean
  whitePieces: string
  blackPieces: string
  /** Pawns, rooks, and queens still on the board (either side). */
  heavyOrPawnCount: number
  /** Knights and bishops still on the board (either side). */
  minorCount: number
  moves: CaptureOrHangLine[]
  hanging: HangingPieceLine[]
}

let briefMemo: { key: string; brief: TacticsBrief } | null = null

function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black'
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function captureGain(move: Move): number {
  let gain = move.captured ? pieceValue(move.captured) : 0
  if (move.promotion) {
    gain += pieceValue(move.promotion) - pieceValue('p')
  }
  return gain
}

function cheapestCaptureOn(chess: Chess, square: Square): Move | undefined {
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured)
  if (captures.length === 0) return undefined
  captures.sort((a, b) => {
    const diff = pieceValue(a.piece) - pieceValue(b.piece)
    if (diff !== 0) return diff
    return a.san.localeCompare(b.san)
  })
  return captures[0]
}

/** Material the side to move can force from capturing on `square`, or 0 if they should decline. */
function seeCaptureOn(chess: Chess, square: Square, depth = 0): number {
  if (depth > 16) return 0
  const recap = cheapestCaptureOn(chess, square)
  if (!recap) return 0
  const gain = captureGain(recap)
  chess.move(recap)
  const reply = seeCaptureOn(chess, square, depth + 1)
  chess.undo()
  return Math.max(0, gain - reply)
}

function opponentToMove(chess: Chess): Chess | null {
  const parts = chess.fen().split(' ')
  if (parts.length < 2) return null
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  try {
    return new Chess(parts.join(' '), { skipValidation: true })
  } catch {
    return null
  }
}

/** Pieces of `victim` that the side to move can take with SEE > 0. */
function hangingVictims(attackerToMove: Chess, victim: Color): HangingPieceLine[] {
  const hanging: HangingPieceLine[] = []
  for (const row of attackerToMove.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== victim || cell.type === 'k') continue
      const recap = cheapestCaptureOn(attackerToMove, cell.square)
      if (!recap) continue
      const theirSee = seeCaptureOn(attackerToMove, cell.square)
      const net = -theirSee
      if (net >= 0) continue
      hanging.push({
        square: cell.square,
        piece: cell.type,
        viaSan: recap.san,
        net,
      })
    }
  }
  return hanging
}

function currentlyHanging(chess: Chess): HangingPieceLine[] {
  const us = chess.turn()
  const opp = opponentToMove(chess)
  if (!opp) return []
  return hangingVictims(opp, us)
}

function occupancy(chess: Chess, color: Color): string {
  const pieces: { type: PieceSymbol; square: Square }[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) pieces.push({ type: cell.type, square: cell.square })
    }
  }
  pieces.sort((a, b) => {
    const td = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
    if (td !== 0) return td
    return a.square.localeCompare(b.square)
  })
  return pieces
    .map((p) => (p.type === 'p' ? p.square : `${pieceLetter(p.type)}${p.square}`))
    .join(' ')
}

/** Opponent SAN that checkmates on this ply, if any. */
export function opponentMateInOneSan(chess: Chess): string | undefined {
  for (const reply of chess.moves({ verbose: true })) {
    chess.move(reply)
    const mate = chess.isCheckmate()
    chess.undo()
    if (mate) return reply.san
  }
  return undefined
}

function inspectMove(
  chess: Chess,
  move: Move,
  us: Color,
  hangingNow: Set<Square>,
): {
  net: number
  recaptureSan?: string
  mate: boolean
  drawReason?: TerminationReason
  opponentMateSan?: string
  leavesHanging: HangingPieceLine[]
} {
  const gain = captureGain(move)
  chess.move(move)
  const mate = chess.isCheckmate()
  let drawReason: TerminationReason | undefined
  if (!mate) {
    const end = detectNaturalEnd(chess)
    if (end && end.winner === 'draw') drawReason = end.reason
  }
  const recaptureSan = cheapestCaptureOn(chess, move.to)?.san
  const opponentGain = seeCaptureOn(chess, move.to)
  const afterHangs = hangingVictims(chess, us)
  const leavesHanging = afterHangs.filter(
    (h) => h.square !== move.to && !hangingNow.has(h.square),
  )
  const opponentMateSan = !mate && !drawReason ? opponentMateInOneSan(chess) : undefined
  chess.undo()
  return {
    net: gain - opponentGain,
    recaptureSan,
    mate,
    drawReason,
    opponentMateSan,
    leavesHanging,
  }
}

function classifyMove(
  chess: Chess,
  move: Move,
  us: Color,
  hangingNow: Set<Square>,
): CaptureOrHangLine | null {
  const inspected = inspectMove(chess, move, us, hangingNow)
  if (inspected.mate) {
    return { san: move.san, kind: 'mate', net: 0, leavesHanging: [] }
  }
  if (inspected.drawReason) {
    return {
      san: move.san,
      kind: 'draw',
      net: inspected.net,
      drawReason: inspected.drawReason,
      leavesHanging: inspected.leavesHanging,
    }
  }
  if (inspected.opponentMateSan) {
    return {
      san: move.san,
      kind: 'threat',
      threatSan: inspected.opponentMateSan,
      net: inspected.net,
      leavesHanging: inspected.leavesHanging,
    }
  }
  const moverHangs =
    Boolean(inspected.recaptureSan) &&
    (inspected.net < 0 || (move.piece !== 'p' && !move.captured))
  if (move.captured) {
    return {
      san: move.san,
      kind: 'capture',
      takes: move.captured,
      recaptureSan: inspected.recaptureSan,
      net: inspected.net,
      leavesHanging: inspected.leavesHanging,
    }
  }
  if (moverHangs) {
    return {
      san: move.san,
      kind: 'hang',
      recaptureSan: inspected.recaptureSan,
      hangs: move.piece,
      net: inspected.net,
      leavesHanging: inspected.leavesHanging,
    }
  }
  if (inspected.leavesHanging.length > 0) {
    return {
      san: move.san,
      kind: 'leaves',
      net: inspected.leavesHanging[0]!.net,
      leavesHanging: inspected.leavesHanging,
    }
  }
  return null
}

function emptyBrief(): TacticsBrief {
  return {
    white: 0,
    black: 0,
    you: 0,
    inCheck: false,
    whitePieces: '',
    blackPieces: '',
    heavyOrPawnCount: 0,
    minorCount: 0,
    moves: [],
    hanging: [],
  }
}

function countMatingShape(chess: Chess): { heavyOrPawnCount: number; minorCount: number } {
  let heavyOrPawnCount = 0
  let minorCount = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue
      if (cell.type === 'p' || cell.type === 'r' || cell.type === 'q') heavyOrPawnCount++
      else if (cell.type === 'n' || cell.type === 'b') minorCount++
    }
  }
  return { heavyOrPawnCount, minorCount }
}

export function tacticsBrief(fen: string, legalSans: string[]): TacticsBrief {
  const key = `${fen}\0${legalSans.join(',')}`
  if (briefMemo?.key === key) return briefMemo.brief
  const brief = computeTacticsBrief(fen, legalSans)
  briefMemo = { key, brief }
  return brief
}

export async function tacticsBriefAsync(fen: string, legalSans: string[]): Promise<TacticsBrief> {
  const key = `${fen}\0${legalSans.join(',')}`
  if (briefMemo?.key === key) return briefMemo.brief
  const brief = await computeTacticsBriefAsync(fen, legalSans)
  briefMemo = { key, brief }
  return brief
}

function computeTacticsBrief(fen: string, legalSans: string[]): TacticsBrief {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return emptyBrief()
  }
  const material = materialCount(chess)
  const you = chess.turn() === 'w' ? material.white - material.black : material.black - material.white
  const hanging = currentlyHanging(chess)
  const hangingNow = new Set(hanging.map((h) => h.square))
  const us = chess.turn()
  const bySan = new Map(chess.moves({ verbose: true }).map((m) => [m.san, m]))
  const moves: CaptureOrHangLine[] = []
  for (const san of legalSans) {
    const move = bySan.get(san)
    if (!move) continue
    const line = classifyMove(chess, move, us, hangingNow)
    if (line) moves.push(line)
  }
  return {
    white: material.white,
    black: material.black,
    you,
    inCheck: chess.inCheck(),
    whitePieces: occupancy(chess, 'w'),
    blackPieces: occupancy(chess, 'b'),
    ...countMatingShape(chess),
    moves,
    hanging,
  }
}

async function computeTacticsBriefAsync(fen: string, legalSans: string[]): Promise<TacticsBrief> {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return emptyBrief()
  }
  const clock = { now: performance.now() }
  const material = materialCount(chess)
  const you = chess.turn() === 'w' ? material.white - material.black : material.black - material.white
  const hanging = currentlyHanging(chess)
  await yieldIfBusy(clock)
  const hangingNow = new Set(hanging.map((h) => h.square))
  const us = chess.turn()
  const bySan = new Map(chess.moves({ verbose: true }).map((m) => [m.san, m]))
  const moves: CaptureOrHangLine[] = []
  for (const san of legalSans) {
    const move = bySan.get(san)
    if (!move) continue
    const line = classifyMove(chess, move, us, hangingNow)
    if (line) moves.push(line)
    await yieldIfBusy(clock)
  }
  return {
    white: material.white,
    black: material.black,
    you,
    inCheck: chess.inCheck(),
    whitePieces: occupancy(chess, 'w'),
    blackPieces: occupancy(chess, 'b'),
    ...countMatingShape(chess),
    moves,
    hanging,
  }
}

export function isAvoidLine(line: CaptureOrHangLine): boolean {
  if (
    line.kind === 'draw' ||
    line.kind === 'threat' ||
    line.kind === 'hang' ||
    line.kind === 'leaves'
  ) {
    return true
  }
  if (line.kind === 'capture' && line.net < 0) return true
  if (line.leavesHanging.length > 0) return true
  return false
}

function formatLeaves(leaves: HangingPieceLine[]): string {
  return leaves
    .map((h) => `${pieceLetter(h.piece)}${h.square} hanging to ${h.viaSan} (net ${h.net})`)
    .join('; ')
}

function formatMoveLine(line: CaptureOrHangLine): string {
  const prefix = isAvoidLine(line) ? 'AVOID ' : ''
  if (line.kind === 'mate') return `${line.san}: mate`
  if (line.kind === 'draw') {
    const label = DRAW_LABEL[line.drawReason ?? 'stalemate'] ?? 'draw'
    return `${prefix}${line.san}: FAILING — draw by ${label}`
  }
  if (line.kind === 'threat') {
    return `${prefix}${line.san}: opponent mates with ${line.threatSan}`
  }
  const leaves =
    line.leavesHanging.length > 0 ? `; leaves ${formatLeaves(line.leavesHanging)}` : ''
  if (line.kind === 'capture') {
    const takes = line.takes ? pieceLetter(line.takes) : '?'
    const recapture = line.recaptureSan ? `recapture ${line.recaptureSan}` : 'no recapture'
    return `${prefix}${line.san}: takes ${takes}; ${recapture}; net ${line.net}${leaves}`
  }
  if (line.kind === 'hang') {
    const letter = line.hangs ? pieceLetter(line.hangs) : '?'
    const danger =
      line.net < 0
        ? `after the move, ${letter} hangs to ${line.recaptureSan}`
        : `after the move, ${letter} is in danger (${line.recaptureSan})`
    return `${prefix}${line.san}: ${danger}; net ${line.net}${leaves}`
  }
  return `${prefix}${line.san}: after the move, leaves ${formatLeaves(line.leavesHanging)}`
}

function formatHangingLine(line: HangingPieceLine): string {
  return `${pieceLetter(line.piece)}${line.square} (${pieceLetter(line.piece)}) via ${line.viaSan}; net ${line.net}`
}

export function formatTacticsBrief(brief: TacticsBrief, color: Color): string {
  const name = colorName(color)
  const parts = [
    `Goal: checkmate the opponent's king. A draw is a failure, not a win.`,
    `Pieces:\nWhite: ${brief.whitePieces}\nBlack: ${brief.blackPieces}`,
    `Material: White ${brief.white} — Black ${brief.black} (you are ${name}, ${signed(brief.you)}). ${PIECE_VALUES_LEGEND}.`,
  ]
  if (brief.heavyOrPawnCount === 0 && brief.minorCount > 0) {
    parts.push(
      'Only knights and/or bishops remain. Capturing down to king vs king, king+knight vs king, king+bishop vs king, or bishops all on the same color is a draw by insufficient material — a failure. Keep two pieces that can still mate.',
    )
  } else if (brief.heavyOrPawnCount === 1) {
    parts.push(
      'Only one pawn, rook, or queen remains. Do not capture it if that leaves king vs king, king+knight vs king, or king+bishop vs king — that is a draw by insufficient material.',
    )
  }
  const nonKings = brief.heavyOrPawnCount + brief.minorCount
  if (nonKings <= 10) {
    if (brief.you > 0) {
      parts.push(
        'Endgame: you are ahead. Every move must make progress — mate if legal, promote a pawn, advance a pawn, or drive the enemy king toward the edge with your king. Do not shuffle. Leave the king two flight squares until mate; stalemate is a failure.',
      )
    } else if (brief.you < 0) {
      parts.push(
        'Endgame: you are behind. Keep remaining pieces, answer hanging threats, and do not wander. A draw is still a failure if you can still mate.',
      )
    } else {
      parts.push(
        'Endgame: equal material. Advance passed pawns and activate the king. Do not wander.',
      )
    }
  }
  if (brief.inCheck) {
    parts.push('You are in check — the chosen move must get out of check.')
  }
  if (brief.moves.length > 0) {
    const rows = brief.moves.map((line) => `- ${formatMoveLine(line)}`).join('\n')
    parts.push(
      `After you play this SAN (that piece leaves its old square) → opponent reply, net for you:\n${rows}`,
    )
  }
  if (brief.hanging.length > 0) {
    const rows = brief.hanging.map((line) => `- ${formatHangingLine(line)}`).join('\n')
    parts.push(`Hanging now (opponent can take next if unanswered):\n${rows}`)
  }
  return parts.join('\n\n')
}

export function tacticsBriefingText(fen: string, color: Color, legalSans: string[]): string {
  return formatTacticsBrief(tacticsBrief(fen, legalSans), color)
}

export async function tacticsBriefingTextAsync(
  fen: string,
  color: Color,
  legalSans: string[],
): Promise<string> {
  return formatTacticsBrief(await tacticsBriefAsync(fen, legalSans), color)
}
