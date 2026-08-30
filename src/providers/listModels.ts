import type { Provider } from '../types'
import { anthropicCorsDetail, isAnthropicUrl } from './anthropic'
import { joinUrl } from './chatCompletions'
import { providerRequestHeaders } from './headers'
import { contextFromModelRow } from './modelContext'
import { isOllamaCloudUrl, ollamaCloudCorsDetail, resolveFetchUrl } from './ollamaCloud'

export type ListedModel = { id: string; maxContext?: number }

export type ListModelsResult =
  | { ok: true; ids: string[]; maxContextById: Record<string, number> }
  | { ok: false; detail: string }

export function parseListedModels(payload: unknown): ListedModel[] {
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as { data?: unknown; models?: unknown }
  const rows: unknown[] = []
  if (Array.isArray(obj.data)) rows.push(...obj.data)
  if (Array.isArray(obj.models)) rows.push(...obj.models)
  const byId = new Map<string, number | undefined>()
  for (const row of rows) {
    if (typeof row === 'string' && row.trim()) {
      const id = row.trim()
      if (!byId.has(id)) byId.set(id, undefined)
      continue
    }
    if (!row || typeof row !== 'object') continue
    const rec = row as { id?: unknown; name?: unknown }
    const id = typeof rec.id === 'string' ? rec.id : typeof rec.name === 'string' ? rec.name : ''
    if (!id.trim()) continue
    const ctx = contextFromModelRow(row)
    const prev = byId.get(id.trim())
    byId.set(id.trim(), ctx && prev ? Math.max(ctx, prev) : (ctx ?? prev))
  }
  return [...byId.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, maxContext]) => (maxContext ? { id, maxContext } : { id }))
}

export function parseModelIds(payload: unknown): string[] {
  return parseListedModels(payload).map((m) => m.id)
}

function maxContextByIdFrom(models: ListedModel[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of models) {
    if (m.maxContext) out[m.id] = m.maxContext
  }
  return out
}

export async function listModels(
  provider: Provider,
  apiKey?: string,
): Promise<ListModelsResult> {
  const modelsPath = isAnthropicUrl(provider.baseUrl) ? 'models?limit=1000' : 'models'
  const url = resolveFetchUrl(joinUrl(provider.baseUrl, modelsPath))
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: providerRequestHeaders(provider, apiKey, { Accept: 'application/json' }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text()
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          detail: `HTTP ${response.status}: authentication failed. Check the API key.`,
        }
      }
      return { ok: false, detail: `HTTP ${response.status}: ${text.slice(0, 280)}` }
    }
    const body: unknown = await response.json().catch(() => null)
    const models = parseListedModels(body)
    const ids = models.map((m) => m.id)
    if (ids.length === 0) {
      return { ok: false, detail: 'GET /models succeeded but listed no model ids.' }
    }
    return { ok: true, ids, maxContextById: maxContextByIdFrom(models) }
  } catch (err) {
    return { ok: false, detail: modelsFetchFailure(err, provider) }
  } finally {
    window.clearTimeout(timer)
  }
}

export function modelsFetchFailure(err: unknown, provider: Provider): string {
  const message = err instanceof Error ? err.message : String(err)
  const offline =
    /failed to fetch|networkerror|load failed|aborted/i.test(message) || err instanceof TypeError
  if (offline && isOllamaCloudUrl(provider.baseUrl)) {
    return ollamaCloudCorsDetail()
  }
  if (offline && isAnthropicUrl(provider.baseUrl)) {
    return anthropicCorsDetail()
  }
  if (offline && provider.localInference) {
    return `Nothing is listening at ${provider.baseUrl}. Start the local server, then Reload.`
  }
  if (offline) {
    return 'Network or CORS failure loading models. Check the API key, CORS, and that the host is reachable.'
  }
  return message
}
