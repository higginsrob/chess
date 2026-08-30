import { afterEach, describe, expect, it, vi } from 'vitest'
import { blankModelConfig } from '../settings/defaults'
import type { Provider } from '../types'
import { ANTHROPIC_BROWSER_ACCESS, ANTHROPIC_VERSION } from './anthropic'
import {
  applySampling,
  chatCompletions,
  dropUnrecognizedArgument,
  ollamaChatBody,
  unrecognizedRequestArgument,
} from './chatCompletions'
import { clearProviderKey, setProviderKey } from './keys'

describe('applySampling', () => {
  it('omits knobs that are not enabled', () => {
    const body: Record<string, unknown> = { model: 'qwen3.5' }
    applySampling(body, blankModelConfig('p1'))
    expect(body).toEqual({ model: 'qwen3.5' })
  })

  it('sends reasoning_effort for OpenAI-compat endpoints when enabled', () => {
    const body: Record<string, unknown> = { model: 'qwen3.5' }
    const config = blankModelConfig('p1')
    config.reasoningEffort = { enabled: true, value: 'high' }
    applySampling(body, config)
    expect(body.reasoning_effort).toBe('high')
  })

  it('does not send reasoning_effort when the knob is off', () => {
    const body: Record<string, unknown> = { model: 'qwen3.5' }
    const config = blankModelConfig('p1')
    config.reasoningEffort = { enabled: false, value: 'none' }
    applySampling(body, config)
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('sends default num_ctx on local inference', () => {
    const body: Record<string, unknown> = { model: 'qwen3.5' }
    applySampling(body, blankModelConfig('p1'), true)
    expect(body.num_ctx).toBe(4096)
    expect(body.options).toEqual({ num_ctx: 4096 })
  })

  it('sends a chosen num_ctx on local inference', () => {
    const body: Record<string, unknown> = { model: 'qwen3.5' }
    const config = blankModelConfig('p1')
    config.numCtx = { enabled: true, value: 8192 }
    applySampling(body, config, true)
    expect(body.num_ctx).toBe(8192)
    expect(body.options).toEqual({ num_ctx: 8192 })
  })

  it('does not send num_ctx for cloud providers', () => {
    const body: Record<string, unknown> = { model: 'qwen3.5' }
    const config = blankModelConfig('p1')
    config.numCtx = { enabled: true, value: 8192 }
    applySampling(body, config, false)
    expect(body.num_ctx).toBeUndefined()
    expect(body.options).toBeUndefined()
  })
})

describe('ollamaChatBody', () => {
  it('puts num_ctx in options for native /api/chat', () => {
    const config = blankModelConfig('p1')
    config.model = 'llama3.2:3b'
    config.numCtx = { enabled: true, value: 4096 }
    const body = ollamaChatBody(config, [{ role: 'user', content: 'hi' }])
    expect(body.model).toBe('llama3.2:3b')
    expect(body.stream).toBe(true)
    expect(body.options).toEqual({ num_ctx: 4096 })
    expect(body.think).toBe(false)
    expect(body.format).toBe('json')
    expect(body.response_format).toBeUndefined()
  })

  it('maps reasoning_effort onto native think', () => {
    const config = blankModelConfig('p1')
    config.reasoningEffort = { enabled: true, value: 'high' }
    expect(ollamaChatBody(config, []).think).toBe('high')
    config.reasoningEffort = { enabled: true, value: 'none' }
    expect(ollamaChatBody(config, []).think).toBe(false)
  })

  it('sends a legal-move schema as native format', () => {
    const config = blankModelConfig('p1')
    const body = ollamaChatBody(config, [{ role: 'user', content: 'hi' }], ['e4', 'd4'])
    expect(body.format).toEqual({
      type: 'object',
      properties: { move: { type: 'string', enum: ['e4', 'd4'] } },
      required: ['move'],
      additionalProperties: false,
    })
    expect(body.response_format).toBeUndefined()
  })
})

describe('unrecognizedRequestArgument', () => {
  it('reads the field OpenAI names in a 400 body', () => {
    expect(
      unrecognizedRequestArgument(
        '{ "error": { "message": "Unrecognized request argument supplied: reasoning_effort" } }',
      ),
    ).toBe('reasoning_effort')
  })

  it('returns undefined when the error is something else', () => {
    expect(unrecognizedRequestArgument('HTTP 400: invalid model')).toBeUndefined()
  })

  it('drops the named field from the body', () => {
    const body: Record<string, unknown> = { model: 'gpt-4o', reasoning_effort: 'high' }
    expect(
      dropUnrecognizedArgument(
        body,
        'Unrecognized request argument supplied: reasoning_effort',
      ),
    ).toBe(true)
    expect(body).toEqual({ model: 'gpt-4o' })
  })
})

describe('chatCompletions OpenAI 400 retry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const openai: Provider = {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    localInference: false,
    extraHeaders: [],
  }

  it('retries without reasoning_effort after OpenAI rejects the field', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)))
        if (bodies.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                message: 'Unrecognized request argument supplied: reasoning_effort',
                type: 'invalid_request_error',
                param: null,
                code: null,
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '{"move":"e4"}' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const config = blankModelConfig(openai.id)
    config.model = 'gpt-4o'
    config.reasoningEffort = { enabled: true, value: 'high' }
    const result = await chatCompletions({
      provider: openai,
      config,
      messages: [{ role: 'user', content: 'move' }],
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe('{"move":"e4"}')
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toMatchObject({ reasoning_effort: 'high' })
    expect(bodies[1]).not.toHaveProperty('reasoning_effort')
  })

  it('returns usage from an OpenAI completion body', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '{"move":"e4"}' } }],
            usage: { prompt_tokens: 1800, completion_tokens: 24, total_tokens: 1824 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )
    const config = blankModelConfig(openai.id)
    config.model = 'gpt-4o'
    const result = await chatCompletions({
      provider: openai,
      config,
      messages: [{ role: 'user', content: 'move' }],
    })
    expect(bodies[0]).toMatchObject({ stream_options: { include_usage: true } })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.usage).toEqual({
        promptTokens: 1800,
        completionTokens: 24,
        totalTokens: 1824,
        source: 'api',
      })
    }
  })
})

describe('chatCompletions Anthropic headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearProviderKey('anthropic')
  })

  it('sends x-api-key, version, and browser CORS header', async () => {
    const anthropic: Provider = {
      id: 'anthropic',
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      localInference: false,
      extraHeaders: [],
    }
    setProviderKey(anthropic.id, 'sk-ant-test')
    let sent: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = init?.headers
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '{"move":"e4"}' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )
    const config = blankModelConfig(anthropic.id)
    config.model = 'claude-sonnet-4-6'
    const result = await chatCompletions({
      provider: anthropic,
      config,
      messages: [{ role: 'user', content: 'move' }],
    })
    expect(result.ok).toBe(true)
    expect(sent).toMatchObject({
      Authorization: 'Bearer sk-ant-test',
      'x-api-key': 'sk-ant-test',
      'anthropic-version': ANTHROPIC_VERSION,
      [ANTHROPIC_BROWSER_ACCESS]: 'true',
    })
  })
})
