import type { ExtraHeader, Provider } from '../types'
import { applyAnthropicHeaders } from './anthropic'
import { getProviderKey } from './keys'

const SECRET_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
])

const SKIP_HEADER_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

export function isSecretHeaderName(name: string): boolean {
  return SECRET_HEADER_NAMES.has(name.trim().toLowerCase())
}

/** Drop empty rows, prototype keys, and auth headers that must not persist. */
export function sanitizeExtraHeaders(headers: ExtraHeader[]): ExtraHeader[] {
  const out: ExtraHeader[] = []
  for (const header of headers) {
    if (!header || typeof header !== 'object') continue
    const key = typeof header.key === 'string' ? header.key.trim() : ''
    const value = typeof header.value === 'string' ? header.value : ''
    if (!key && !value) continue
    const lower = key.toLowerCase()
    if (!key || SKIP_HEADER_NAMES.has(lower) || isSecretHeaderName(key)) continue
    out.push({ key, value })
  }
  return out
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const existing = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  if (existing) delete headers[existing]
  headers[name] = value
}

/** Auth, extra headers, and Anthropic CORS/version headers. The API key wins over extras. */
export function providerRequestHeaders(
  provider: Provider,
  apiKey?: string,
  base?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  for (const { key: name, value } of provider.extraHeaders) {
    const trimmed = name.trim()
    if (!trimmed || SKIP_HEADER_NAMES.has(trimmed.toLowerCase())) continue
    headers[trimmed] = value
  }
  const key = apiKey ?? getProviderKey(provider.id)
  if (key) setHeader(headers, 'Authorization', `Bearer ${key}`)
  applyAnthropicHeaders(headers, provider.baseUrl, key)
  return headers
}
