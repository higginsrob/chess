import { describe, expect, it } from 'vitest'
import {
  clampNumCtx,
  contextFromModelRow,
  formatParameterCount,
  nativeApiRoot,
  NUM_CTX_FALLBACK_MAX,
  numCtxChoices,
  parseOllamaContextLength,
  parseOllamaModelMeta,
  usesOllamaNativeApi,
} from './modelContext'

describe('nativeApiRoot', () => {
  it('strips a trailing /v1', () => {
    expect(nativeApiRoot('http://localhost:11434/v1')).toBe('http://localhost:11434')
    expect(nativeApiRoot('http://localhost:11434/v1/')).toBe('http://localhost:11434')
  })
})

describe('parseOllamaContextLength', () => {
  it('reads the architecture context_length and ignores clip', () => {
    expect(
      parseOllamaContextLength({
        model_info: {
          'general.architecture': 'gemma3',
          'gemma3.context_length': 262144,
          'clip.context_length': 77,
        },
      }),
    ).toBe(262144)
  })

  it('returns undefined when model_info is missing', () => {
    expect(parseOllamaContextLength({})).toBeUndefined()
  })
})

describe('contextFromModelRow', () => {
  it('reads max_model_len from an LM Studio-style row', () => {
    expect(contextFromModelRow({ id: 'local', max_model_len: 8192 })).toBe(8192)
  })

  it('reads nested meta.n_ctx_train', () => {
    expect(contextFromModelRow({ id: 'm', meta: { n_ctx_train: 32768 } })).toBe(32768)
  })
})

describe('numCtxChoices', () => {
  it('is 1024, 2048, 4096, … up to the model max', () => {
    expect(numCtxChoices(4096)).toEqual([1024, 2048, 4096])
    expect(numCtxChoices(5000)).toEqual([1024, 2048, 4096])
  })

  it('includes 4096 and the max when the window is large', () => {
    const choices = numCtxChoices(262144)
    expect(choices).toEqual([1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144])
  })

  it('falls back to a modest cap when max is unknown', () => {
    expect(numCtxChoices().at(-1)).toBe(NUM_CTX_FALLBACK_MAX)
    expect(numCtxChoices()).toEqual([1024, 2048, 4096, 8192, 16384, 32768])
  })
})

describe('clampNumCtx', () => {
  it('keeps a listed value', () => {
    expect(clampNumCtx(4096, 8192)).toBe(4096)
  })

  it('snaps down to the model max', () => {
    expect(clampNumCtx(8192, 4096)).toBe(4096)
  })

  it('snaps an off-step value down', () => {
    expect(clampNumCtx(3000, 8192)).toBe(2048)
  })
})

describe('usesOllamaNativeApi', () => {
  it('is true for the default Ollama provider', () => {
    expect(
      usesOllamaNativeApi({
        id: 'p1',
        name: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        localInference: true,
        extraHeaders: [],
      }),
    ).toBe(true)
  })

  it('is false for LM Studio and cloud', () => {
    expect(
      usesOllamaNativeApi({
        id: 'p2',
        name: 'LM Studio',
        baseUrl: 'http://localhost:1234/v1',
        localInference: true,
        extraHeaders: [],
      }),
    ).toBe(false)
    expect(
      usesOllamaNativeApi({
        id: 'p3',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        localInference: false,
        extraHeaders: [],
      }),
    ).toBe(false)
  })
})

describe('parseOllamaModelMeta', () => {
  it('reads details and model_info', () => {
    expect(
      parseOllamaModelMeta({
        details: {
          parent_model: 'gemma3',
          format: 'gguf',
          family: 'gemma3',
          parameter_size: '12.2B',
          quantization_level: 'Q4_K_M',
        },
        model_info: {
          'general.architecture': 'gemma3',
          'general.parameter_count': 12_200_000_000,
          'gemma3.context_length': 131072,
          'clip.context_length': 77,
        },
      }),
    ).toEqual({
      maxContext: 131072,
      architecture: 'gemma3',
      family: 'gemma3',
      parameterSize: '12.2B',
      parameterCount: 12_200_000_000,
      quantization: 'Q4_K_M',
      format: 'gguf',
      parentModel: 'gemma3',
    })
  })

  it('formats parameter counts', () => {
    expect(formatParameterCount(8_030_261_248)).toBe('8.0B')
    expect(formatParameterCount(1_000_000_000)).toBe('1B')
    expect(formatParameterCount(7_000_000)).toBe('7M')
  })
})
