/** Same-origin path Vite (dev + preview) proxies to https://ollama.com. */
export const OLLAMA_CLOUD_PROXY_PREFIX = '/__ollama_cloud'

export type PageLocation = { origin: string; hostname: string }

export function isOllamaCloudHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'ollama.com' || host === 'www.ollama.com'
}

export function isOllamaCloudUrl(url: string): boolean {
  try {
    return isOllamaCloudHost(new URL(url).hostname)
  } catch {
    return false
  }
}

export function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function pageLocation(): PageLocation | undefined {
  if (typeof window === 'undefined') return undefined
  return { origin: window.location.origin, hostname: window.location.hostname }
}

/** True when this page is served from local Vite, which can proxy ollama.com. */
export function ollamaCloudProxyAvailable(location = pageLocation()): boolean {
  return Boolean(location && isLocalDevHost(location.hostname))
}

/**
 * ollama.com does not send Access-Control-Allow-Origin, so a browser cannot
 * call it cross-origin. On localhost, rewrite to the Vite proxy.
 */
export function resolveFetchUrl(url: string, location = pageLocation()): string {
  if (!location || !isLocalDevHost(location.hostname) || !isOllamaCloudUrl(url)) return url
  const parsed = new URL(url)
  return `${location.origin}${OLLAMA_CLOUD_PROXY_PREFIX}${parsed.pathname}${parsed.search}`
}

export function ollamaCloudCorsDetail(location = pageLocation()): string {
  if (ollamaCloudProxyAvailable(location)) {
    return 'Could not reach Ollama Cloud through the local Vite proxy. Confirm npm run dev (or npm run preview) is running, then try Test connection again.'
  }
  return [
    'ollama.com does not allow browser CORS, so this static page cannot call it directly.',
    'Use local Ollama as a gateway: ollama signin, ollama pull <model>-cloud, and set the base URL to http://localhost:11434/v1.',
    'Or run npm run dev — Vite proxies https://ollama.com.',
  ].join(' ')
}
