import { describe, expect, it } from 'vitest'
import { modelsFetchFailure, parseListedModels, parseModelIds } from './listModels'

describe('parseModelIds', () => {
  it('reads OpenAI-style data[].id', () => {
    expect(
      parseModelIds({
        data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-4o' }],
      }),
    ).toEqual(['gpt-4.1-mini', 'gpt-4o'])
  })

  it('reads Ollama-style models[].name', () => {
    expect(
      parseModelIds({
        models: [{ name: 'llama3.2' }, { name: 'qwen2.5' }],
      }),
    ).toEqual(['llama3.2', 'qwen2.5'])
  })

  it('dedupes and sorts', () => {
    expect(
      parseModelIds({
        data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }],
      }),
    ).toEqual(['a', 'b'])
  })

  it('returns empty for junk', () => {
    expect(parseModelIds(null)).toEqual([])
    expect(parseModelIds({})).toEqual([])
    expect(parseModelIds('nope')).toEqual([])
  })

  it('reads context_length from a list row', () => {
    expect(
      parseListedModels({
        data: [{ id: 'local-model', max_model_len: 16384 }, { id: 'other' }],
      }),
    ).toEqual([
      { id: 'local-model', maxContext: 16384 },
      { id: 'other' },
    ])
  })

  it('explains a down local server instead of a generic CORS error', () => {
    const detail = modelsFetchFailure(new TypeError('Failed to fetch'), {
      id: 'p1',
      name: 'Ollama',
      baseUrl: 'http://localhost:11434/v1',
      localInference: true,
      extraHeaders: [],
    })
    expect(detail).toContain('Nothing is listening at http://localhost:11434/v1')
  })

  it('explains Anthropic browser CORS when fetch is blocked', () => {
    const detail = modelsFetchFailure(new TypeError('Failed to fetch'), {
      id: 'p3',
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      localInference: false,
      extraHeaders: [],
    })
    expect(detail).toContain('anthropic-dangerous-direct-browser-access')
  })

  it('explains that ollama.com has no browser CORS', () => {
    const detail = modelsFetchFailure(new TypeError('Failed to fetch'), {
      id: 'p2',
      name: 'Ollama Cloud',
      baseUrl: 'https://ollama.com/v1',
      localInference: false,
      extraHeaders: [],
    })
    expect(detail).toContain('does not allow browser CORS')
  })
})
