import { Chess } from 'chess.js'
import type {
  AppSettings,
  Color,
  GameLog,
  GameSnapshot,
  ModelConfigSnapshot,
  ParseResult,
  PlyLog,
  ProviderSnapshot,
  Seat,
  SeatSnapshot,
  TerminationReason,
  Winner,
} from '../types'
import { HARNESS_VERSION } from '../types'
import { materialCount } from './material'

const RAW_LIMIT = 16_000

export function truncateRaw(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  if (text.length <= RAW_LIMIT) return text
  return `${text.slice(0, RAW_LIMIT)}\n… [truncated]`
}

export function snapshotSeat(seat: Seat, settings: AppSettings): SeatSnapshot {
  if (seat.type === 'human') return { type: 'human' }
  const config = settings.modelConfigs.find((c) => c.id === seat.modelConfigId)
  if (!config) return { type: 'model' }
  const provider = settings.providers.find((p) => p.id === config.providerId)
  const modelConfig: ModelConfigSnapshot = {
    name: config.name,
    model: config.model,
    timeoutMs: config.timeoutMs,
    jsonMode: config.jsonMode,
    legalMoveSchema: config.legalMoveSchema !== false,
  }
  if (config.temperature.enabled) modelConfig.temperature = config.temperature.value
  if (config.maxTokens.enabled) modelConfig.max_tokens = config.maxTokens.value
  if (config.topP.enabled) modelConfig.top_p = config.topP.value
  if (config.seed.enabled) modelConfig.seed = config.seed.value
  if (provider?.localInference && config.numCtx) {
    modelConfig.num_ctx = config.numCtx.value
  }
  if (config.reasoningEffort?.enabled) {
    modelConfig.reasoning_effort = config.reasoningEffort.value
  }
  const providerSnap: ProviderSnapshot | undefined = provider
    ? {
        name: provider.name,
        baseUrl: provider.baseUrl,
        localInference: provider.localInference,
      }
    : undefined
  return { type: 'model', provider: providerSnap, modelConfig }
}

export function newPlyLog(opts: {
  ply: number
  color: Color
  fenBefore: string
  san?: string
  rawPrompt?: string
  rawResponse?: string
  reasoning?: string
  parseResult: ParseResult
  latencyMs?: number
  legalMoveSchema?: boolean
  promptTokens?: number
  completionTokens?: number
}): PlyLog {
  return {
    ply: opts.ply,
    color: opts.color,
    fenBefore: opts.fenBefore,
    san: opts.san,
    rawPrompt: truncateRaw(opts.rawPrompt),
    rawResponse: truncateRaw(opts.rawResponse),
    reasoning: truncateRaw(opts.reasoning),
    parseResult: opts.parseResult,
    latencyMs: opts.latencyMs,
    legalMoveSchema: opts.legalMoveSchema,
    promptTokens: opts.promptTokens,
    completionTokens: opts.completionTokens,
  }
}

export function finishGameLog(opts: {
  id: string
  startedAt: string
  white: SeatSnapshot
  black: SeatSnapshot
  plies: PlyLog[]
  snapshot: GameSnapshot
  termination: TerminationReason
  winner: Winner
  batch?: GameLog['batch']
}): GameLog {
  const chess = new Chess(opts.snapshot.fen)
  return {
    id: opts.id,
    harnessVersion: HARNESS_VERSION,
    startedAt: opts.startedAt,
    endedAt: new Date().toISOString(),
    white: opts.white,
    black: opts.black,
    plies: opts.plies,
    pgn: opts.snapshot.pgn,
    fenEnd: opts.snapshot.fen,
    termination: opts.termination,
    winner: opts.winner,
    material: materialCount(chess),
    batch: opts.batch,
  }
}
