import type { Provider } from '../types'
import { DEFAULT_NUM_CTX } from '../settings/defaults'
import { providerRequestHeaders } from './headers'
import { resolveFetchUrl } from './ollamaCloud'

export const NUM_CTX_STEP = 1024
/** Until the model max is known, do not offer a huge window that can CUDA-fault. */
export const NUM_CTX_FALLBACK_MAX = 32_768

export function nativeApiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
}

/** Ollama's OpenAI `/v1/chat/completions` ignores `num_ctx`; native `/api/chat` does not. */
export function usesOllamaNativeApi(provider: Provider): boolean {
  if (!provider.localInference) return false
  if (/ollama/i.test(provider.name)) return true
  try {
    const url = new URL(provider.baseUrl)
    if (url.port === '11434') return true
    if (/ollama/i.test(url.hostname)) return true
  } catch {
    /* ignore invalid URLs */
  }
  return /:11434(?:\/|$)/.test(provider.baseUrl)
}

export function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.floor(n)
}

function contextFromRecord(rec: Record<string, unknown>): number | undefined {
  const keys = [
    'context_length',
    'contextLength',
    'max_model_len',
    'max_context_length',
    'n_ctx_train',
    'n_ctx',
  ]
  for (const key of keys) {
    const n = asPositiveInt(rec[key])
    if (n) return n
  }
  return undefined
}

/** Read a max context window from an OpenAI/Ollama/LM Studio model list row. */
export function contextFromModelRow(row: unknown): number | undefined {
  if (!row || typeof row !== 'object') return undefined
  const rec = row as Record<string, unknown>
  const direct = contextFromRecord(rec)
  if (direct) return direct
  if (rec.meta && typeof rec.meta === 'object') {
    const nested = contextFromRecord(rec.meta as Record<string, unknown>)
    if (nested) return nested
  }
  return parseOllamaContextLength(rec)
}

/**
 * Ollama `/api/show` puts the train window on `model_info["{arch}.context_length"]`.
 * Vision towers also expose a tiny `clip.context_length`; take the max.
 */
export function parseOllamaContextLength(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const obj = payload as { model_info?: unknown }
  if (!obj.model_info || typeof obj.model_info !== 'object') return undefined
  const lengths: number[] = []
  for (const [key, value] of Object.entries(obj.model_info as Record<string, unknown>)) {
    if (key === 'context_length' || key.endsWith('.context_length')) {
      const n = asPositiveInt(value)
      if (n) lengths.push(n)
    }
  }
  if (lengths.length === 0) return undefined
  return Math.max(...lengths)
}

/** 1024, 2048, 4096, … (powers of two) up to the model max. */
export function numCtxChoices(maxContext?: number): number[] {
  const cap = maxContext && maxContext >= NUM_CTX_STEP ? maxContext : NUM_CTX_FALLBACK_MAX
  const out: number[] = []
  for (let n = NUM_CTX_STEP; n <= cap; n *= 2) out.push(n)
  return out
}

export function clampNumCtx(value: number, maxContext?: number): number {
  const choices = numCtxChoices(maxContext)
  if (choices.includes(value)) return value
  const below = [...choices].reverse().find((n) => n <= value)
  return below ?? choices[0] ?? DEFAULT_NUM_CTX
}

export interface ModelMeta {
  maxContext?: number
  architecture?: string
  family?: string
  parameterSize?: string
  parameterCount?: number
  quantization?: string
  format?: string
  parentModel?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function stringField(rec: Record<string, unknown>, key: string): string | undefined {
  const value = rec[key]
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

/** Details + model_info from Ollama `/api/show`. */
export function parseOllamaModelMeta(payload: unknown): ModelMeta {
  const maxContext = parseOllamaContextLength(payload)
  const root = asRecord(payload)
  if (!root) return maxContext ? { maxContext } : {}
  const details = asRecord(root.details)
  const info = asRecord(root.model_info)
  const meta: ModelMeta = {}
  if (maxContext) meta.maxContext = maxContext
  if (details) {
    const family = stringField(details, 'family')
    const parameterSize = stringField(details, 'parameter_size')
    const quantization = stringField(details, 'quantization_level')
    const format = stringField(details, 'format')
    const parentModel = stringField(details, 'parent_model')
    if (family) meta.family = family
    if (parameterSize) meta.parameterSize = parameterSize
    if (quantization) meta.quantization = quantization
    if (format) meta.format = format
    if (parentModel) meta.parentModel = parentModel
  }
  if (info) {
    const architecture = stringField(info, 'general.architecture')
    const parameterCount = asPositiveInt(info['general.parameter_count'])
    if (architecture) meta.architecture = architecture
    if (parameterCount) meta.parameterCount = parameterCount
  }
  return meta
}

export function formatParameterCount(n: number): string {
  if (n >= 1e9) {
    const b = n / 1e9
    return `${Number.isInteger(b) ? String(b) : b.toFixed(1)}B`
  }
  if (n >= 1e6) {
    const m = n / 1e6
    return `${Number.isInteger(m) ? String(m) : m.toFixed(0)}M`
  }
  return n.toLocaleString('en-US')
}

const modelMetaCache = new Map<string, ModelMeta>()
const modelMetaInflight = new Map<string, Promise<ModelMeta | undefined>>()

async function fetchModelShow(
  provider: Provider,
  model: string,
  apiKey?: string,
): Promise<unknown | undefined> {
  const name = model.trim()
  if (!name || !provider.localInference) return undefined
  const url = resolveFetchUrl(`${nativeApiRoot(provider.baseUrl)}/api/show`)
  const headers = providerRequestHeaders(provider, apiKey, {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  })
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: name, name }),
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return await response.json().catch(() => null)
  } catch {
    return undefined
  } finally {
    window.clearTimeout(timer)
  }
}

export async function fetchModelMeta(
  provider: Provider,
  model: string,
  apiKey?: string,
): Promise<ModelMeta | undefined> {
  const name = model.trim()
  if (!name || !provider.localInference) return undefined
  const cacheKey = `${provider.id}|${provider.baseUrl}|${name}`
  const cached = modelMetaCache.get(cacheKey)
  if (cached) return cached
  const pending = modelMetaInflight.get(cacheKey)
  if (pending) return pending
  const request = (async () => {
    const body = await fetchModelShow(provider, name, apiKey)
    if (body == null) return undefined
    const meta = parseOllamaModelMeta(body)
    if (Object.keys(meta).length === 0) return undefined
    modelMetaCache.set(cacheKey, meta)
    return meta
  })().finally(() => {
    modelMetaInflight.delete(cacheKey)
  })
  modelMetaInflight.set(cacheKey, request)
  return request
}

export async function fetchModelContext(
  provider: Provider,
  model: string,
  apiKey?: string,
): Promise<number | undefined> {
  const meta = await fetchModelMeta(provider, model, apiKey)
  return meta?.maxContext
}
