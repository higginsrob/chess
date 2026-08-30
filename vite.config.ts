import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { OLLAMA_CLOUD_PROXY_PREFIX } from './src/providers/ollamaCloud.ts'
import { githubPagesBase } from './src/siteBase.ts'

/** ollama.com has no CORS; browser calls go same-origin and this forwards them. */
const ollamaCloudProxy = {
  [OLLAMA_CLOUD_PROXY_PREFIX]: {
    target: 'https://ollama.com',
    changeOrigin: true,
    rewrite: (path: string) =>
      path.startsWith(OLLAMA_CLOUD_PROXY_PREFIX)
        ? path.slice(OLLAMA_CLOUD_PROXY_PREFIX.length) || '/'
        : path,
  },
}

/** Production only — Vite HMR needs a looser policy in `npm run dev`. */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: http://127.0.0.1:* http://localhost:* http://[::1]:*",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'html-csp',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html
      const meta = `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
      return html.replace('<head>', `<head>\n    ${meta}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), basicSsl(), cspPlugin()],
  base: githubPagesBase(process.env),
  server: { proxy: ollamaCloudProxy },
  preview: { proxy: ollamaCloudProxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'threads',
  },
})
