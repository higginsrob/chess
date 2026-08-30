import type { Provider } from '../types'
import { anthropicCorsDetail, isAnthropicUrl } from './anthropic'
import { joinUrl } from './chatCompletions'
import { providerRequestHeaders } from './headers'
import { listModels } from './listModels'
import { isOllamaCloudUrl, ollamaCloudCorsDetail, resolveFetchUrl } from './ollamaCloud'

export type TestConnectionResult =
  | { ok: true; detail: string; ids?: string[] }
  | { ok: false; detail: string }

export async function testConnection(provider: Provider): Promise<TestConnectionResult> {
  const listed = await listModels(provider)
  if (listed.ok) {
    const preview = listed.ids.slice(0, 8).join(', ')
    const more = listed.ids.length > 8 ? ` (+${listed.ids.length - 8} more)` : ''
    return {
      ok: true,
      ids: listed.ids,
      detail: `GET /models succeeded. ${listed.ids.length} model${listed.ids.length === 1 ? '' : 's'}: ${preview}${more}`,
    }
  }
  if (!listed.detail.startsWith('HTTP 404')) {
    return { ok: false, detail: listed.detail }
  }

  const headers = providerRequestHeaders(provider, undefined, { Accept: 'application/json' })
  return pingChat(provider, headers)
}

async function pingChat(
  provider: Provider,
  headers: Record<string, string>,
): Promise<TestConnectionResult> {
  const url = resolveFetchUrl(joinUrl(provider.baseUrl, 'chat/completions'))
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15_000)
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ping',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    if (response.ok || response.status === 400 || response.status === 404) {
      return {
        ok: true,
        detail: `chat/completions reachable (HTTP ${response.status}). GET /models was missing.`,
      }
    }
    const text = await response.text()
    return { ok: false, detail: httpFailure(response.status, text) }
  } catch (err) {
    return { ok: false, detail: networkFailure(err, provider) }
  }
}

function httpFailure(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return `HTTP ${status}: authentication failed. Check the API key (cloud) or whether this local server expects one.`
  }
  return `HTTP ${status}: ${body.slice(0, 280)}`
}

function networkFailure(err: unknown, provider: Provider): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/failed to fetch|networkerror|load failed/i.test(message) || err instanceof TypeError) {
    if (isOllamaCloudUrl(provider.baseUrl)) return ollamaCloudCorsDetail()
    if (isAnthropicUrl(provider.baseUrl)) return anthropicCorsDetail()
    return [
      'Network or CORS failure.',
      'GitHub Pages is HTTPS; local servers are usually HTTP.',
      'Chromium often allows HTTPS → http://localhost; Safari and Firefox are stricter.',
      'The reliable path for Ollama / LM Studio / llama.cpp / SGLang is local Vite (npm run dev).',
      'If this is Ollama, set OLLAMA_ORIGINS to include this page origin.',
    ].join(' ')
  }
  return message
}
