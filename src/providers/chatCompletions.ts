import type { ChatMessage, ModelConfig, Provider } from '../types'
import { extractOpenThink, mergeReasoning, stripThinkBlocks } from '../harness/parseMove'
import { DEFAULT_NUM_CTX } from '../settings/defaults'
import { extractAssistant, extractStreamDelta } from './extractAssistant'
import { applyJsonMode } from './jsonMode'
import { anthropicCorsDetail, isAnthropicUrl } from './anthropic'
import { providerRequestHeaders } from './headers'
import { getProviderKey } from './keys'
import { nativeApiRoot, usesOllamaNativeApi } from './modelContext'
import { isOllamaCloudUrl, ollamaCloudCorsDetail, resolveFetchUrl } from './ollamaCloud'
import { extractUsage, mergeUsage, type TokenUsage } from './usage'

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export type ChatResult =
  | { ok: true; text: string; reasoning?: string; latencyMs: number; usage?: TokenUsage }
  | { ok: false; kind: 'timeout' | 'http_error'; detail: string; latencyMs: number }

export interface ChatRequest {
  provider: Provider
  config: ModelConfig
  messages: ChatMessage[]
  legalSans?: string[]
  signal?: AbortSignal
  onReasoning?: (text: string) => void
  onUsage?: (usage: TokenUsage) => void
}

function mergeSignals(signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const onAbort = (s: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(s.reason)
  }
  const cleanups: Array<() => void> = []
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason)
      break
    }
    const handler = () => onAbort(s)
    s.addEventListener('abort', handler)
    cleanups.push(() => s.removeEventListener('abort', handler))
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const c of cleanups) c()
    },
  }
}

function thinkingFromContent(content: string): string | undefined {
  const closed = stripThinkBlocks(content).thinking
  return mergeReasoning(closed, extractOpenThink(content))
}

type BodyAcc = { text: string; reasoning: string; usage?: TokenUsage }

function applyChunk(
  acc: BodyAcc,
  payload: unknown,
  onReasoning?: (text: string) => void,
  onUsage?: (usage: TokenUsage) => void,
): void {
  const delta = extractStreamDelta(payload)
  acc.text += delta.text
  acc.reasoning += delta.reasoning
  const live = mergeReasoning(acc.reasoning, thinkingFromContent(acc.text))
  if (live) onReasoning?.(live)
  const usage = mergeUsage(acc.usage, extractUsage(payload))
  if (usage) {
    acc.usage = usage
    onUsage?.(usage)
  }
}

async function consumeBody(
  response: Response,
  onReasoning?: (text: string) => void,
  streamKind: 'auto' | 'ndjson' = 'auto',
  onUsage?: (usage: TokenUsage) => void,
): Promise<BodyAcc | { error: string }> {
  const reader = response.body?.getReader()
  if (!reader) {
    const raw = await response.text()
    return streamKind === 'ndjson'
      ? parseNdjsonBody(raw, onReasoning, onUsage)
      : parseCompleteBody(raw, onReasoning, onUsage)
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let mode: 'unknown' | 'sse' | 'json' | 'ndjson' = streamKind === 'ndjson' ? 'ndjson' : 'unknown'
  const acc: BodyAcc = { text: '', reasoning: '' }

  const flushSseLines = () => {
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        applyChunk(acc, JSON.parse(data) as unknown, onReasoning, onUsage)
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  const flushNdjsonLines = () => {
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        applyChunk(acc, JSON.parse(trimmed) as unknown, onReasoning, onUsage)
      } catch {
        // skip malformed NDJSON lines
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    if (mode === 'unknown') {
      const peek = buffer.trimStart()
      if (peek.startsWith('data:') || peek.includes('\ndata:') || peek.includes('\r\ndata:')) {
        mode = 'sse'
      } else if (peek.startsWith('{') || peek.startsWith('[')) {
        mode = 'json'
      }
    }
    if (mode === 'sse') flushSseLines()
    if (mode === 'ndjson') flushNdjsonLines()
    if (done) break
  }

  if (mode === 'sse') {
    flushSseLines()
    if (buffer.trim().startsWith('data:')) {
      const data = buffer.trim().slice(5).trim()
      if (data && data !== '[DONE]') {
        try {
          applyChunk(acc, JSON.parse(data) as unknown, onReasoning, onUsage)
        } catch {
          // ignore trailing fragment
        }
      }
    }
    if (!acc.text && !acc.reasoning) return { error: 'No assistant message in chat completion' }
    return acc
  }

  if (mode === 'ndjson') {
    flushNdjsonLines()
    if (buffer.trim()) {
      try {
        applyChunk(acc, JSON.parse(buffer.trim()) as unknown, onReasoning, onUsage)
      } catch {
        // ignore trailing fragment
      }
    }
    if (!acc.text && !acc.reasoning) return { error: 'No assistant message in chat completion' }
    return acc
  }

  return parseCompleteBody(buffer, onReasoning, onUsage)
}

function parseNdjsonBody(
  raw: string,
  onReasoning?: (text: string) => void,
  onUsage?: (usage: TokenUsage) => void,
): BodyAcc | { error: string } {
  const acc: BodyAcc = { text: '', reasoning: '' }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      applyChunk(acc, JSON.parse(trimmed) as unknown, onReasoning, onUsage)
    } catch {
      // skip
    }
  }
  if (!acc.text && !acc.reasoning) return parseCompleteBody(raw, onReasoning, onUsage)
  return acc
}

function parseCompleteBody(
  raw: string,
  onReasoning?: (text: string) => void,
  onUsage?: (usage: TokenUsage) => void,
): BodyAcc | { error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { error: 'Empty response' }
  if (trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
    const acc: BodyAcc = { text: '', reasoning: '' }
    for (const block of trimmed.split(/\r?\n/)) {
      const line = block.trim()
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        applyChunk(acc, JSON.parse(data) as unknown, onReasoning, onUsage)
      } catch {
        // skip
      }
    }
    if (!acc.text && !acc.reasoning) return { error: 'No assistant message in chat completion' }
    return acc
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return { error: 'Response was not JSON' }
  }
  const extracted = extractAssistant(parsed)
  if (extracted.text === null && extracted.reasoning === null) {
    return { error: 'No assistant message in chat completion' }
  }
  const text = extracted.text ?? ''
  const reasoning = extracted.reasoning ?? ''
  const live = mergeReasoning(reasoning, thinkingFromContent(text))
  if (live) onReasoning?.(live)
  const usage = extractUsage(parsed)
  if (usage) onUsage?.(usage)
  return { text, reasoning, usage }
}

/** OpenAI (and strict clones) 400 on unknown top-level fields. */
export function unrecognizedRequestArgument(errorBody: string): string | undefined {
  const match = /Unrecognized request argument supplied:\s*['"]?([A-Za-z0-9_]+)/i.exec(
    errorBody,
  )
  return match?.[1]
}

/** Drop a field the server named as unrecognized. Returns true when the body changed. */
export function dropUnrecognizedArgument(
  body: Record<string, unknown>,
  errorBody: string,
): boolean {
  const key = unrecognizedRequestArgument(errorBody)
  if (!key || !(key in body)) return false
  delete body[key]
  return true
}

/** Send sampling knobs only when the model config enables them. */
export function applySampling(
  body: Record<string, unknown>,
  config: ModelConfig,
  localInference = false,
): void {
  if (config.temperature.enabled) body.temperature = config.temperature.value
  if (config.maxTokens.enabled) body.max_tokens = config.maxTokens.value
  if (config.topP.enabled) body.top_p = config.topP.value
  if (config.seed.enabled) body.seed = config.seed.value
  // Local servers (Ollama OpenAI-compat, LM Studio) accept this. Official OpenAI
  // only accepts it on reasoning models; others 400 and the request is retried
  // without the field.
  if (config.reasoningEffort?.enabled) {
    body.reasoning_effort = config.reasoningEffort.value
  }
  if (localInference) {
    const numCtx = Math.max(1, Math.floor(config.numCtx?.value ?? DEFAULT_NUM_CTX))
    body.num_ctx = numCtx
    const prev =
      body.options && typeof body.options === 'object' && !Array.isArray(body.options)
        ? (body.options as Record<string, unknown>)
        : {}
    body.options = { ...prev, num_ctx: numCtx }
  }
}

/** Native Ollama `/api/chat` body. `num_ctx` only applies on this endpoint. */
export function ollamaChatBody(
  config: ModelConfig,
  messages: ChatMessage[],
  legalSans?: string[],
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    num_ctx: Math.max(1, Math.floor(config.numCtx?.value ?? DEFAULT_NUM_CTX)),
  }
  if (config.temperature.enabled) options.temperature = config.temperature.value
  if (config.maxTokens.enabled) options.num_predict = config.maxTokens.value
  if (config.topP.enabled) options.top_p = config.topP.value
  if (config.seed.enabled) options.seed = config.seed.value

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
    options,
    // Omit `think` and reasoning models default ON, fill num_ctx, then CUDA-fault.
    think: false,
  }
  if (config.reasoningEffort?.enabled) {
    body.think = config.reasoningEffort.value === 'none' ? false : config.reasoningEffort.value
  }
  applyJsonMode(body, {
    jsonMode: config.jsonMode,
    localInference: true,
    legalMoveSchema: config.legalMoveSchema,
    legalSans,
  })
  delete body.response_format
  return body
}

export async function chatCompletions(req: ChatRequest): Promise<ChatResult> {
  const started = performance.now()
  const ollamaNative = usesOllamaNativeApi(req.provider)
  const url = resolveFetchUrl(
    ollamaNative
      ? `${nativeApiRoot(req.provider.baseUrl)}/api/chat`
      : joinUrl(req.provider.baseUrl, 'chat/completions'),
  )
  const apiKey = getProviderKey(req.provider.id)

  const body: Record<string, unknown> = ollamaNative
    ? ollamaChatBody(req.config, req.messages, req.legalSans)
    : {
        model: req.config.model,
        messages: req.messages,
        stream: true,
      }
  if (!ollamaNative) {
    applySampling(body, req.config, req.provider.localInference)
    applyJsonMode(body, {
      jsonMode: req.config.jsonMode,
      localInference: req.provider.localInference,
      legalMoveSchema: req.config.legalMoveSchema,
      legalSans: req.legalSans,
    })
    body.stream_options = { include_usage: true }
  }

  const headers = providerRequestHeaders(req.provider, apiKey, {
    'Content-Type': 'application/json',
  })

  const timeoutController = new AbortController()
  const timer = setTimeout(() => {
    timeoutController.abort(new DOMException('Timeout', 'TimeoutError'))
  }, req.config.timeoutMs)
  const signals = [timeoutController.signal]
  if (req.signal) signals.push(req.signal)
  const merged = mergeSignals(signals)

  const post = (payload: Record<string, unknown>) =>
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: merged.signal,
    })

  try {
    let response = await post(body)
    let errorText = ''
    if (!response.ok) {
      errorText = await response.text()
      for (let i = 0; i < 8; i++) {
        if (response.status !== 400 || !dropUnrecognizedArgument(body, errorText)) break
        response = await post(body)
        if (response.ok) {
          errorText = ''
          break
        }
        errorText = await response.text()
      }
    }
    const latencyMs = Math.round(performance.now() - started)
    if (!response.ok) {
      return {
        ok: false,
        kind: 'http_error',
        detail: `HTTP ${response.status}: ${errorText.slice(0, 400)}`,
        latencyMs,
      }
    }
    const consumed = await consumeBody(
      response,
      req.onReasoning,
      ollamaNative ? 'ndjson' : 'auto',
      req.onUsage,
    )
    if ('error' in consumed) {
      return { ok: false, kind: 'http_error', detail: consumed.error, latencyMs }
    }
    const reasoning = mergeReasoning(consumed.reasoning, thinkingFromContent(consumed.text))
    return {
      ok: true,
      text: consumed.text,
      reasoning,
      latencyMs,
      usage: consumed.usage,
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started)
    if (req.signal?.aborted) {
      return { ok: false, kind: 'http_error', detail: 'Cancelled', latencyMs }
    }
    if (isTimeout(err, timeoutController.signal)) {
      return {
        ok: false,
        kind: 'timeout',
        detail: `Timed out after ${req.config.timeoutMs}ms`,
        latencyMs,
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    const offline =
      /failed to fetch|networkerror|load failed/i.test(message) || err instanceof TypeError
    if (offline && isOllamaCloudUrl(req.provider.baseUrl)) {
      return { ok: false, kind: 'http_error', detail: ollamaCloudCorsDetail(), latencyMs }
    }
    if (offline && isAnthropicUrl(req.provider.baseUrl)) {
      return { ok: false, kind: 'http_error', detail: anthropicCorsDetail(), latencyMs }
    }
    return { ok: false, kind: 'http_error', detail: message, latencyMs }
  } finally {
    clearTimeout(timer)
    merged.dispose()
  }
}

function isTimeout(err: unknown, timeoutSignal: AbortSignal): boolean {
  if (timeoutSignal.aborted) return true
  if (err instanceof DOMException && err.name === 'TimeoutError') return true
  if (err instanceof Error && err.name === 'TimeoutError') return true
  return false
}
