import type { Color, PieceSymbol, Square } from 'chess.js'

export type { Color, PieceSymbol, Square }

export const HARNESS_VERSION = '0.5.0'

export type TerminationReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'insufficient_material'
  | 'illegal_move'
  | 'unparseable_move'
  | 'http_error'
  | 'timeout'

export type Winner = 'w' | 'b' | 'draw'

export type GameStatus = 'idle' | 'in_progress' | 'ended'

export type ParseResult = 'ok' | 'unparseable' | 'illegal'

export type MoveClassification = 'inaccuracy' | 'mistake' | 'blunder'

export interface OptionalNumber {
  enabled: boolean
  value: number
}

/** Values accepted by Ollama's OpenAI-compat `/v1/chat/completions` (and similar). */
export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'max'] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export interface OptionalReasoningEffort {
  enabled: boolean
  value: ReasoningEffort
}

export interface ExtraHeader {
  key: string
  value: string
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  localInference: boolean
  extraHeaders: ExtraHeader[]
}

export interface ModelConfig {
  id: string
  name: string
  providerId: string
  model: string
  temperature: OptionalNumber
  maxTokens: OptionalNumber
  topP: OptionalNumber
  seed: OptionalNumber
  /** Ollama context window. Sent as `num_ctx` / `options.num_ctx` on local providers. */
  numCtx: OptionalNumber
  reasoningEffort: OptionalReasoningEffort
  timeoutMs: number
  jsonMode: boolean
  /** When JSON mode is on, constrain `move` to the legal SAN enum. */
  legalMoveSchema: boolean
  extraSystemPrompt: string
}

export type Seat = { type: 'human' } | { type: 'model'; modelConfigId: string }

export type HdriId = 'medieval_cafe' | 'bethnal_green_entrance'

export interface ScenePrefs {
  hdriId: HdriId
  flipBoard: boolean
}

export interface SeatVoice {
  enabled: boolean
  voiceURI: string
}

export interface AppSettings {
  providers: Provider[]
  modelConfigs: ModelConfig[]
  seats: { white: Seat; black: Seat }
  scene: ScenePrefs
  stockfishLiveEval: boolean
  voices: { white: SeatVoice; black: SeatVoice }
  showTurnsPanel: boolean
}

export interface PieceOnBoard {
  square: Square
  type: PieceSymbol
  color: Color
}

export interface LastMove {
  from: Square
  to: Square
  san: string
  /** Square the captured piece stood on (differs from `to` for en passant). */
  capturedSquare?: Square
}

export interface LegalMove {
  san: string
  uci: string
}

export interface GameSnapshot {
  fen: string
  pgn: string
  turn: Color
  selectedSquare: Square | null
  legalTargets: Square[]
  lastMove: LastMove | null
  status: GameStatus
  termination: TerminationReason | null
  winner: Winner | null
  inCheck: boolean
  pieces: PieceOnBoard[]
  plyCount: number
  legalSans: string[]
  legalMoves: LegalMove[]
}

export interface ProviderSnapshot {
  name: string
  baseUrl: string
  localInference: boolean
}

export interface ModelConfigSnapshot {
  name: string
  model: string
  temperature?: number
  max_tokens?: number
  top_p?: number
  seed?: number
  num_ctx?: number
  reasoning_effort?: ReasoningEffort
  timeoutMs: number
  jsonMode: boolean
  legalMoveSchema?: boolean
}

export interface SeatSnapshot {
  type: 'human' | 'model'
  provider?: ProviderSnapshot
  modelConfig?: ModelConfigSnapshot
}

export interface PlyLog {
  ply: number
  color: Color
  fenBefore: string
  san?: string
  rawPrompt?: string
  rawResponse?: string
  reasoning?: string
  parseResult: ParseResult
  /** True when this ply's request sent a legal-SAN JSON schema enum. */
  legalMoveSchema?: boolean
  latencyMs?: number
  evalCp?: number
  evalMate?: number
  bestEvalCp?: number
  cpLoss?: number
  classification?: MoveClassification | null
  promptTokens?: number
  completionTokens?: number
}

export interface StockfishSummary {
  acplWhite: number | null
  acplBlack: number | null
  inaccuracies: number
  mistakes: number
  blunders: number
  depth: number
}

export interface GameLog {
  id: string
  harnessVersion: string
  startedAt: string
  endedAt: string
  white: SeatSnapshot
  black: SeatSnapshot
  plies: PlyLog[]
  pgn: string
  fenEnd: string
  termination: TerminationReason
  winner: Winner
  material: { white: number; black: number }
  stockfish?: StockfishSummary
  batch?: {
    index: number
    size: number
    swapColors: boolean
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
