import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdownBlocks } from './markdown'

describe('parseInline', () => {
  it('parses bold, italic, and code', () => {
    expect(parseInline('Play **e4** and *develop* with `Nf3`.')).toEqual([
      { type: 'text', text: 'Play ' },
      { type: 'strong', text: 'e4' },
      { type: 'text', text: ' and ' },
      { type: 'em', text: 'develop' },
      { type: 'text', text: ' with ' },
      { type: 'code', text: 'Nf3' },
      { type: 'text', text: '.' },
    ])
  })
})

describe('parseMarkdownBlocks', () => {
  it('parses unordered lists', () => {
    const blocks = parseMarkdownBlocks('- e5 (King\'s Pawn)\n- c5 (Sicilian)')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'ul' })
    if (blocks[0]?.type !== 'ul') return
    expect(blocks[0].items).toHaveLength(2)
  })

  it('parses paragraphs separately from lists', () => {
    const blocks = parseMarkdownBlocks('Common replies:\n\n- e5\n- c5')
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul'])
  })
})
