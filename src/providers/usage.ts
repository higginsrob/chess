import type { ChatMessage, ModelConfig, Provider } from '../types'
import { DEFAULT_NUM_CTX } from '../settings/defaults'

/** Rough English/code average; refined when an API count is available. */
export const CHARS_PER_TOKEN = 4

export type UsageSource = 'api' | 'estimate'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  source: UsageSource
  promptMs?: number
  completionMs?: number
  totalMs?: number
}

export type ContextWindowKind = 'num_ctx' | 'model_max'

export interface ContextWindow {
  limit: number
  kind: ContextWindowKind
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asNat(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.floor(n)
}

function nsToMs(ns: unknown): number | undefined {
  const n = asNat(ns)
  if (n == null) return undefined
  return n / 1e6
}

function usageFromCounts(
  prompt: number | undefined,
  completion: number | undefined,
  total: number | undefined,
  extras?: Pick<TokenUsage, 'promptMs' | 'completionMs' | 'totalMs'>,
): TokenUsage | undefined {
  if (prompt == null && completion == null && total == null) return undefined
  const promptTokens = prompt ?? 0
  const completionTokens = completion ?? 0
  const totalTokens = total ?? promptTokens + completionTokens
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    source: 'api',
    ...extras,
  }
}

/**
 * Read prompt/completion counts from an OpenAI-compat, Ollama native, or llama.cpp payload.
 * Safe to call on every stream chunk; missing fields are omitted.
 */
export function extractUsage(payload: unknown): TokenUsage | undefined {
  const root = asRecord(payload)
  if (!root) return undefined

  const nested = asRecord(root.usage)
  if (nested) {
    const fromNested = usageFromCounts(
      asNat(nested.prompt_tokens ?? nested.promptTokens),
      asNat(nested.completion_tokens ?? nested.completionTokens),
      asNat(nested.total_tokens ?? nested.totalTokens),
    )
    if (fromNested) return fromNested
  }

  const timings = asRecord(root.timings)
  const fromTimings = timings
    ? usageFromCounts(asNat(timings.prompt_n), asNat(timings.predicted_n), undefined, {
        promptMs: asNat(timings.prompt_ms),
        completionMs: asNat(timings.predicted_ms),
      })
    : undefined

  const fromOllama = usageFromCounts(
    asNat(root.prompt_eval_count),
    asNat(root.eval_count),
    undefined,
    {
      promptMs: nsToMs(root.prompt_eval_duration),
      completionMs: nsToMs(root.eval_duration),
      totalMs: nsToMs(root.total_duration),
    },
  )

  return mergeUsage(fromOllama, fromTimings)
}

/** Prefer later API counts; keep the highest of each field so a growing eval_count wins. */
export function mergeUsage(
  prev: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!next) return prev
  if (!prev) return next
  const promptTokens = Math.max(prev.promptTokens, next.promptTokens)
  const completionTokens = Math.max(prev.completionTokens, next.completionTokens)
  const totalTokens = Math.max(prev.totalTokens, next.totalTokens, promptTokens + completionTokens)
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    source: prev.source === 'api' || next.source === 'api' ? 'api' : 'estimate',
    promptMs: next.promptMs ?? prev.promptMs,
    completionMs: next.completionMs ?? prev.completionMs,
    totalMs: next.totalMs ?? prev.totalMs,
  }
}

export function estimateTokensFromText(text: string, charsPerToken = CHARS_PER_TOKEN): number {
  if (!text) return 0
  const cpt = charsPerToken > 0 ? charsPerToken : CHARS_PER_TOKEN
  return Math.max(1, Math.round(text.length / cpt))
}

/** Chat-template overhead is a few tokens per message; this is a lower bound. */
export function estimateMessagesTokens(
  messages: ChatMessage[],
  charsPerToken = CHARS_PER_TOKEN,
): number {
  if (messages.length === 0) return 0
  const content = messages.reduce((n, m) => n + estimateTokensFromText(m.content, charsPerToken), 0)
  return content + messages.length * 4
}

export function charsPerTokenFrom(usage: TokenUsage | undefined, promptChars: number): number {
  if (!usage || usage.source !== 'api' || usage.promptTokens < 1 || promptChars < 1) {
    return CHARS_PER_TOKEN
  }
  return Math.max(1.5, Math.min(8, promptChars / usage.promptTokens))
}

export function contextWindow(
  config: ModelConfig | undefined,
  provider: Provider | undefined,
  maxContext?: number,
): ContextWindow | null {
  if (provider?.localInference) {
    const limit = Math.max(1, Math.floor(config?.numCtx?.value ?? DEFAULT_NUM_CTX))
    return { limit, kind: 'num_ctx' }
  }
  if (maxContext && maxContext > 0) return { limit: maxContext, kind: 'model_max' }
  return null
}

export function fillRatio(used: number, limit: number): number {
  if (!(limit > 0) || !(used >= 0)) return 0
  return used / limit
}

export type FillTone = 'ok' | 'warn' | 'danger'

export function fillTone(ratio: number): FillTone {
  if (ratio >= 0.95) return 'danger'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}

export function formatTokenCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.round(n))
  if (abs < 1000) return String(abs)
  if (abs < 10_000) return `${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (abs < 1_000_000) return `${Math.round(abs / 1000)}k`
  return `${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export function formatTokenExact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function tokensPerSecond(tokens: number, ms: number | undefined): number | undefined {
  if (ms == null || !(ms > 0) || !(tokens > 0)) return undefined
  return tokens / (ms / 1000)
}

export function windowKindLabel(kind: ContextWindowKind): string {
  return kind === 'num_ctx' ? 'num_ctx' : 'model max'
}
