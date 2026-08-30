import { describe, expect, it } from 'vitest'
import { splitSentences } from './sentences'

describe('splitSentences', () => {
  it('returns empty for blank text', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   ')).toEqual([])
  })

  it('splits on terminal punctuation', () => {
    expect(splitSentences('Develop the knight. Occupy the center.')).toEqual([
      'Develop the knight.',
      'Occupy the center.',
    ])
  })

  it('keeps a single sentence intact', () => {
    expect(splitSentences('Castle looks unsafe!')).toEqual(['Castle looks unsafe!'])
  })

  it('splits on blank lines', () => {
    expect(splitSentences('First thought.\n\nSecond thought.')).toEqual([
      'First thought.',
      'Second thought.',
    ])
  })

  it('chunks long text without punctuation at word boundaries', () => {
    const word = 'knight'
    const text = Array.from({ length: 50 }, () => word).join(' ')
    const parts = splitSentences(text)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join(' ')).toBe(text)
    expect(parts.every((p) => p.length <= 220)).toBe(true)
  })
})
