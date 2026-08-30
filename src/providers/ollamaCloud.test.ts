import { describe, expect, it } from 'vitest'
import {
  isOllamaCloudUrl,
  ollamaCloudCorsDetail,
  OLLAMA_CLOUD_PROXY_PREFIX,
  ollamaCloudProxyAvailable,
  resolveFetchUrl,
} from './ollamaCloud'

describe('isOllamaCloudUrl', () => {
  it('matches ollama.com hosts', () => {
    expect(isOllamaCloudUrl('https://ollama.com/v1')).toBe(true)
    expect(isOllamaCloudUrl('https://www.ollama.com/v1/models')).toBe(true)
    expect(isOllamaCloudUrl('https://api.openai.com/v1')).toBe(false)
    expect(isOllamaCloudUrl('http://localhost:11434/v1')).toBe(false)
    expect(isOllamaCloudUrl('not a url')).toBe(false)
  })
})

describe('resolveFetchUrl', () => {
  const local = { origin: 'https://localhost:5173', hostname: 'localhost' }

  it('rewrites ollama.com through the Vite proxy on localhost', () => {
    expect(resolveFetchUrl('https://ollama.com/v1/models', local)).toBe(
      `https://localhost:5173${OLLAMA_CLOUD_PROXY_PREFIX}/v1/models`,
    )
    expect(resolveFetchUrl('https://ollama.com/api/chat', local)).toBe(
      `https://localhost:5173${OLLAMA_CLOUD_PROXY_PREFIX}/api/chat`,
    )
  })

  it('leaves other hosts unchanged', () => {
    expect(resolveFetchUrl('https://api.openai.com/v1/models', local)).toBe(
      'https://api.openai.com/v1/models',
    )
  })

  it('does not rewrite on GitHub Pages', () => {
    const pages = { origin: 'https://higginsrob.github.io', hostname: 'higginsrob.github.io' }
    expect(resolveFetchUrl('https://ollama.com/v1/models', pages)).toBe(
      'https://ollama.com/v1/models',
    )
  })
})

describe('ollamaCloudCorsDetail', () => {
  it('explains the Vite proxy when on localhost', () => {
    expect(
      ollamaCloudCorsDetail({ origin: 'https://localhost:5173', hostname: 'localhost' }),
    ).toContain('Vite proxy')
  })

  it('explains the local Ollama gateway on Pages', () => {
    const detail = ollamaCloudCorsDetail({
      origin: 'https://higginsrob.github.io',
      hostname: 'higginsrob.github.io',
    })
    expect(detail).toContain('does not allow browser CORS')
    expect(detail).toContain('localhost:11434/v1')
  })
})

describe('ollamaCloudProxyAvailable', () => {
  it('is true on localhost', () => {
    expect(
      ollamaCloudProxyAvailable({ origin: 'https://localhost:5173', hostname: 'localhost' }),
    ).toBe(true)
  })

  it('is false without a location', () => {
    expect(ollamaCloudProxyAvailable(undefined)).toBe(false)
  })
})
