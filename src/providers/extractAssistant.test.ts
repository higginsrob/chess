import { describe, expect, it } from 'vitest'
import { extractAssistant, extractStreamDelta } from './extractAssistant'

describe('extractAssistant', () => {
  it('reads string content', () => {
    expect(
      extractAssistant({
        choices: [{ message: { content: '{"move": "e4"}' } }],
      }),
    ).toEqual({ text: '{"move": "e4"}', reasoning: null })
  })

  it('reads reasoning_content on the message', () => {
    expect(
      extractAssistant({
        choices: [
          {
            message: {
              content: '{"move": "Nf3"}',
              reasoning_content: 'Develop toward the center.',
            },
          },
        ],
      }),
    ).toEqual({
      text: '{"move": "Nf3"}',
      reasoning: 'Develop toward the center.',
    })
  })

  it('reads thinking and OpenRouter-style reasoning_details', () => {
    const extracted = extractAssistant({
      choices: [
        {
          message: {
            content: '{"move": "d4"}',
            thinking: 'Queen pawn opening.',
            reasoning_details: [{ type: 'reasoning.summary', text: 'Occupy d4.' }],
          },
        },
      ],
    })
    expect(extracted.text).toBe('{"move": "d4"}')
    expect(extracted.reasoning).toContain('Queen pawn opening.')
    expect(extracted.reasoning).toContain('Occupy d4.')
  })

  it('separates thinking content parts from text parts', () => {
    expect(
      extractAssistant({
        choices: [
          {
            message: {
              content: [
                { type: 'thinking', thinking: 'Look at the king.' },
                { type: 'text', text: '{"move": "Qh4#"}' },
              ],
            },
          },
        ],
      }),
    ).toEqual({
      text: '{"move": "Qh4#"}',
      reasoning: 'Look at the king.',
    })
  })

  it('returns nulls when choices are missing', () => {
    expect(extractAssistant({})).toEqual({ text: null, reasoning: null })
  })

  it('reads Ollama native message payloads', () => {
    expect(
      extractAssistant({
        message: { role: 'assistant', content: '{"move": "e4"}', thinking: 'Center.' },
        done: true,
      }),
    ).toEqual({ text: '{"move": "e4"}', reasoning: 'Center.' })
  })
})

describe('extractStreamDelta', () => {
  it('reads stream deltas for reasoning_content and content', () => {
    expect(
      extractStreamDelta({
        choices: [{ delta: { reasoning_content: 'Occupy ', content: '' } }],
      }),
    ).toEqual({ text: '', reasoning: 'Occupy ' })
    expect(
      extractStreamDelta({
        choices: [{ delta: { content: '{"move":' } }],
      }),
    ).toEqual({ text: '{"move":', reasoning: '' })
  })

  it('reads Ollama native NDJSON chunks', () => {
    expect(
      extractStreamDelta({
        message: { role: 'assistant', content: '{"move":', thinking: 'Look ' },
        done: false,
      }),
    ).toEqual({ text: '{"move":', reasoning: 'Look ' })
  })
})
