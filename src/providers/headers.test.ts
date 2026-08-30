import { describe, expect, it } from 'vitest'
import { isSecretHeaderName, sanitizeExtraHeaders } from './headers'

describe('sanitizeExtraHeaders', () => {
  it('keeps ordinary headers', () => {
    expect(sanitizeExtraHeaders([{ key: 'X-Title', value: 'chess-lab' }])).toEqual([
      { key: 'X-Title', value: 'chess-lab' },
    ])
  })

  it('drops auth headers so they cannot persist', () => {
    expect(
      sanitizeExtraHeaders([
        { key: 'Authorization', value: 'Bearer sk-secret' },
        { key: 'x-api-key', value: 'sk-ant' },
        { key: 'X-Custom', value: 'ok' },
      ]),
    ).toEqual([{ key: 'X-Custom', value: 'ok' }])
  })

  it('drops prototype keys and empty names', () => {
    expect(
      sanitizeExtraHeaders([
        { key: '__proto__', value: 'x' },
        { key: '', value: 'nope' },
        { key: '  ', value: '' },
      ]),
    ).toEqual([])
  })
})

describe('isSecretHeaderName', () => {
  it('matches Authorization case-insensitively', () => {
    expect(isSecretHeaderName('authorization')).toBe(true)
    expect(isSecretHeaderName(' Cookie ')).toBe(true)
    expect(isSecretHeaderName('X-Title')).toBe(false)
  })
})
