import { describe, expect, it } from 'vitest'
import { cleanReasoning, stripMarkdownForSpeech } from './cleanReasoning'

describe('cleanReasoning', () => {
  it('strips JSON-contract prefix from screenshot-style CoT', () => {
    const raw =
      'We need to respond as JSON only with move and reason. Need choose a legal move. Starting position. Could play e4, standard. Ensure JSON only. Final no extra. Control the center and develop pieces actively.'
    expect(cleanReasoning(raw)).toBe(
      'Could play e4, standard. Control the center and develop pieces actively.',
    )
  })

  it('strips FEN / legal-move dumps and keeps real analysis', () => {
    const raw =
      'We need to respond as Black in a chess game. The FEN is the starting position after White\'s 1.e4. We need to choose a legal move and respond with JSON only, containing "move" and "reason". The legal moves are: Nc6, Na6, Nh6, Nf6, a6, a5, b6, b5, c6, c5, d6, d5, e6, e5, f6, f5, g6, g5, h6, h5 This is the starting position after 1.e4. Common responses include: - e5 (King\'s Pawn Game) - c5 (Sicilian Defense)'
    const cleaned = cleanReasoning(raw)
    expect(cleaned).not.toMatch(/json only/i)
    expect(cleaned).not.toMatch(/legal moves are/i)
    expect(cleaned).not.toMatch(/Nc6, Na6/)
    expect(cleaned).toContain('This is the starting position after 1.e4.')
    expect(cleaned).toContain('Sicilian Defense')
  })

  it('leaves chess reasoning untouched', () => {
    const raw = 'Control the center and develop pieces actively.'
    expect(cleanReasoning(raw)).toBe(raw)
  })

  it('strips a legal-move dump without backtracking on the rest of the CoT', () => {
    const noise = 'The legal moves are: ' + 'considered '.repeat(4000)
    const t0 = Date.now()
    const cleaned = cleanReasoning(`${noise}Play e5 to take the center.`)
    expect(Date.now() - t0).toBeLessThan(50)
    expect(cleaned).toContain('Play e5 to take the center.')
    expect(cleaned).not.toMatch(/legal moves are/i)
  })
})

describe('stripMarkdownForSpeech', () => {
  it('drops emphasis markers and list prefixes', () => {
    expect(stripMarkdownForSpeech('**e4** takes the *center*.\n- develop')).toBe(
      'e4 takes the center.\ndevelop',
    )
  })
})
