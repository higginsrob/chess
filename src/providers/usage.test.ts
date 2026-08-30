import { describe, expect, it } from 'vitest'
import { blankModelConfig } from '../settings/defaults'
import type { Provider } from '../types'
import {
  charsPerTokenFrom,
  contextWindow,
  estimateMessagesTokens,
  estimateTokensFromText,
  extractUsage,
  fillTone,
  formatTokenCompact,
  mergeUsage,
} from './usage'

const ollama: Provider = {
  id: 'p1',
  name: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
  localInference: true,
  extraHeaders: [],
}

const openai: Provider = {
  id: 'p2',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  localInference: false,
  extraHeaders: [],
}

describe('extractUsage', () => {
  it('reads OpenAI usage', () => {
    expect(
      extractUsage({
        usage: { prompt_tokens: 1800, completion_tokens: 24, total_tokens: 1824 },
      }),
    ).toEqual({
      promptTokens: 1800,
      completionTokens: 24,
      totalTokens: 1824,
      source: 'api',
    })
  })

  it('reads Ollama native eval counts and converts ns durations', () => {
    expect(
      extractUsage({
        prompt_eval_count: 2100,
        eval_count: 40,
        prompt_eval_duration: 2_000_000_000,
        eval_duration: 500_000_000,
        total_duration: 3_000_000_000,
      }),
    ).toEqual({
      promptTokens: 2100,
      completionTokens: 40,
      totalTokens: 2140,
      source: 'api',
      promptMs: 2000,
      completionMs: 500,
      totalMs: 3000,
    })
  })

  it('reads llama.cpp timings', () => {
    expect(
      extractUsage({
        timings: { prompt_n: 90, predicted_n: 12, prompt_ms: 40, predicted_ms: 80 },
      }),
    ).toEqual({
      promptTokens: 90,
      completionTokens: 12,
      totalTokens: 102,
      source: 'api',
      promptMs: 40,
      completionMs: 80,
    })
  })

  it('returns undefined when nothing is present', () => {
    expect(extractUsage({ choices: [] })).toBeUndefined()
    expect(extractUsage(null)).toBeUndefined()
  })

  it('allows a zero completion count', () => {
    expect(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 0 } })).toMatchObject({
      promptTokens: 10,
      completionTokens: 0,
      totalTokens: 10,
    })
  })
})

describe('mergeUsage', () => {
  it('keeps the growing eval count from later chunks', () => {
    const first = extractUsage({ prompt_eval_count: 100, eval_count: 1 })
    const next = extractUsage({ prompt_eval_count: 100, eval_count: 8 })
    expect(mergeUsage(first, next)?.completionTokens).toBe(8)
  })
})

describe('estimateTokensFromText', () => {
  it('uses four characters per token', () => {
    expect(estimateTokensFromText('abcd')).toBe(1)
    expect(estimateTokensFromText('a'.repeat(400))).toBe(100)
    expect(estimateTokensFromText('')).toBe(0)
  })
})

describe('estimateMessagesTokens', () => {
  it('adds a little overhead per message', () => {
    const n = estimateMessagesTokens([
      { role: 'system', content: 'a'.repeat(40) },
      { role: 'user', content: 'a'.repeat(40) },
    ])
    expect(n).toBe(10 + 10 + 8)
  })
})

describe('contextWindow', () => {
  it('uses num_ctx for local inference', () => {
    const config = blankModelConfig('p1')
    config.numCtx = { enabled: true, value: 8192 }
    expect(contextWindow(config, ollama, 131072)).toEqual({ limit: 8192, kind: 'num_ctx' })
  })

  it('uses the model max for cloud when known', () => {
    expect(contextWindow(blankModelConfig('p2'), openai, 128000)).toEqual({
      limit: 128000,
      kind: 'model_max',
    })
  })

  it('is null for cloud when the max is unknown', () => {
    expect(contextWindow(blankModelConfig('p2'), openai)).toBeNull()
  })
})

describe('fillTone', () => {
  it('warns near the ceiling', () => {
    expect(fillTone(0.5)).toBe('ok')
    expect(fillTone(0.8)).toBe('warn')
    expect(fillTone(0.95)).toBe('danger')
  })
})

describe('formatTokenCompact', () => {
  it('uses k for thousands', () => {
    expect(formatTokenCompact(48)).toBe('48')
    expect(formatTokenCompact(1842)).toBe('1.8k')
    expect(formatTokenCompact(4096)).toBe('4.1k')
    expect(formatTokenCompact(12000)).toBe('12k')
  })
})

describe('charsPerTokenFrom', () => {
  it('falls back when there is no measured prompt', () => {
    expect(charsPerTokenFrom(undefined, 400)).toBe(4)
  })

  it('derives a ratio from a measured prompt', () => {
    expect(
      charsPerTokenFrom(
        { promptTokens: 100, completionTokens: 0, totalTokens: 100, source: 'api' },
        380,
      ),
    ).toBeCloseTo(3.8)
  })
})
