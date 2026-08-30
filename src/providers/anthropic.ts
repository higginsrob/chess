/** Native Anthropic + OpenAI-compat (`https://api.anthropic.com/v1`). */

export const ANTHROPIC_VERSION = '2023-06-01'
export const ANTHROPIC_BROWSER_ACCESS = 'anthropic-dangerous-direct-browser-access'

export function isAnthropicHost(hostname: string): boolean {
  return hostname.toLowerCase() === 'api.anthropic.com'
}

export function isAnthropicUrl(url: string): boolean {
  try {
    return isAnthropicHost(new URL(url).hostname)
  } catch {
    return false
  }
}

function headerName(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  return Object.keys(headers).find((k) => k.toLowerCase() === lower)
}

/**
 * Anthropic's native Models API wants `x-api-key` + `anthropic-version`.
 * Browser calls also need `anthropic-dangerous-direct-browser-access` or
 * the response has no Access-Control-Allow-Origin and fetch fails as CORS.
 * A RAM-only API key overwrites extra `x-api-key`. Version and CORS extras stay.
 */
export function applyAnthropicHeaders(
  headers: Record<string, string>,
  baseUrl: string,
  apiKey?: string,
): void {
  if (!isAnthropicUrl(baseUrl)) return
  if (apiKey) {
    const existing = headerName(headers, 'x-api-key')
    if (existing) delete headers[existing]
    headers['x-api-key'] = apiKey
  }
  if (!headerName(headers, 'anthropic-version')) {
    headers['anthropic-version'] = ANTHROPIC_VERSION
  }
  if (!headerName(headers, ANTHROPIC_BROWSER_ACCESS)) {
    headers[ANTHROPIC_BROWSER_ACCESS] = 'true'
  }
}

export function anthropicCorsDetail(): string {
  return [
    'api.anthropic.com blocked the browser request (CORS).',
    'This app sends anthropic-dangerous-direct-browser-access, x-api-key, and anthropic-version automatically.',
    'If your Anthropic org disables browser CORS, a local OpenAI-compat proxy is required.',
  ].join(' ')
}
