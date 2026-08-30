import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_BROWSER_ACCESS,
  ANTHROPIC_VERSION,
  anthropicCorsDetail,
  applyAnthropicHeaders,
  isAnthropicUrl,
} from './anthropic'
import { providerRequestHeaders } from './headers'
import type { Provider } from '../types'

const anthropic: Provider = {
  id: 'p-ant',
  name: 'Anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  localInference: false,
  extraHeaders: [],
}

describe('isAnthropicUrl', () => {
  it('matches api.anthropic.com', () => {
    expect(isAnthropicUrl('https://api.anthropic.com/v1')).toBe(true)
    expect(isAnthropicUrl('https://api.anthropic.com/v1/models')).toBe(true)
    expect(isAnthropicUrl('https://api.openai.com/v1')).toBe(false)
    expect(isAnthropicUrl('https://ollama.com/v1')).toBe(false)
    expect(isAnthropicUrl('not a url')).toBe(false)
  })
})

describe('applyAnthropicHeaders', () => {
  it('adds x-api-key, version, and browser CORS header', () => {
    const headers: Record<string, string> = { Authorization: 'Bearer sk-ant-test' }
    applyAnthropicHeaders(headers, anthropic.baseUrl, 'sk-ant-test')
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(headers[ANTHROPIC_BROWSER_ACCESS]).toBe('true')
  })

  it('lets a RAM API key win over extra x-api-key', () => {
    const headers: Record<string, string> = {
      'x-api-key': 'from-extra',
      'anthropic-version': '2023-01-01',
      [ANTHROPIC_BROWSER_ACCESS]: 'false',
    }
    applyAnthropicHeaders(headers, anthropic.baseUrl, 'sk-ant-test')
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe('2023-01-01')
    expect(headers[ANTHROPIC_BROWSER_ACCESS]).toBe('false')
  })

  it('leaves non-Anthropic hosts unchanged', () => {
    const headers: Record<string, string> = { Authorization: 'Bearer sk-openai' }
    applyAnthropicHeaders(headers, 'https://api.openai.com/v1', 'sk-openai')
    expect(headers['x-api-key']).toBeUndefined()
    expect(headers['anthropic-version']).toBeUndefined()
    expect(headers[ANTHROPIC_BROWSER_ACCESS]).toBeUndefined()
  })
})

describe('providerRequestHeaders', () => {
  it('sends Bearer and Anthropic native headers together', () => {
    const headers = providerRequestHeaders(anthropic, 'sk-ant-test', {
      Accept: 'application/json',
    })
    expect(headers.Accept).toBe('application/json')
    expect(headers.Authorization).toBe('Bearer sk-ant-test')
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(headers[ANTHROPIC_BROWSER_ACCESS]).toBe('true')
  })

  it('lets the API key overwrite extra Authorization', () => {
    const headers = providerRequestHeaders(
      { ...anthropic, extraHeaders: [{ key: 'Authorization', value: 'Bearer from-extra' }] },
      'sk-ant-test',
    )
    expect(headers.Authorization).toBe('Bearer sk-ant-test')
  })
})

describe('anthropicCorsDetail', () => {
  it('explains the browser CORS header', () => {
    expect(anthropicCorsDetail()).toContain('anthropic-dangerous-direct-browser-access')
  })
})
