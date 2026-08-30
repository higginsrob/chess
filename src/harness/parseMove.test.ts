import { describe, expect, it } from 'vitest'
import { parseMoveResponse, stripMarkdownFences, extractReasoningFromReply, extractOpenThink } from './parseMove'

describe('parseMoveResponse', () => {
  it('reads a bare JSON object', () => {
    expect(parseMoveResponse('{"move": "Nf3"}')).toEqual({ ok: true, san: 'Nf3' })
  })

  it('strips markdown fences', () => {
    const raw = '```json\n{"move": "e4"}\n```'
    expect(stripMarkdownFences(raw)).toContain('{"move": "e4"}')
    expect(parseMoveResponse(raw)).toEqual({ ok: true, san: 'e4' })
  })

  it('takes the first JSON object in a chatty reply', () => {
    const raw = 'Sure, here you go:\n{"move": "Qh4#"}\nhope that helps'
    expect(parseMoveResponse(raw)).toEqual({ ok: true, san: 'Qh4#' })
  })

  it('strips think blocks before parsing JSON', () => {
    const raw = '<think>castle looks loose {not a move}</think>\n{"move": "O-O"}'
    expect(parseMoveResponse(raw)).toEqual({ ok: true, san: 'O-O' })
  })

  it('trims SAN whitespace', () => {
    expect(parseMoveResponse('{"move": "  O-O  "}')).toEqual({ ok: true, san: 'O-O' })
  })

  it('rejects missing move', () => {
    expect(parseMoveResponse('{"best": "Nf3"}')).toEqual({
      ok: false,
      reason: 'unparseable',
    })
  })

  it('rejects empty move', () => {
    expect(parseMoveResponse('{"move": "  "}')).toEqual({
      ok: false,
      reason: 'unparseable',
    })
  })

  it('rejects non-string move', () => {
    expect(parseMoveResponse('{"move": 3}')).toEqual({
      ok: false,
      reason: 'unparseable',
    })
  })

  it('rejects empty / non-JSON replies', () => {
    expect(parseMoveResponse('Nf3')).toEqual({ ok: false, reason: 'unparseable' })
    expect(parseMoveResponse('')).toEqual({ ok: false, reason: 'unparseable' })
    expect(parseMoveResponse('{')).toEqual({ ok: false, reason: 'unparseable' })
  })

  it('skips a broken brace blob and reads a later move object', () => {
    expect(parseMoveResponse('thinking {not json} then {"move": "O-O"}')).toEqual({
      ok: true,
      san: 'O-O',
    })
  })

  it('extracts move from truncated JSON with an unclosed reason string', () => {
    const raw =
      '{ "move": "Na3", "reason": "King side move. The legal list includes "a3" and never closes'
    expect(parseMoveResponse(raw)).toEqual({ ok: true, san: 'Na3' })
  })

  it('skips an object without move and uses a later one', () => {
    expect(parseMoveResponse('{"best": "Nf3"} then {"move": "e4"}')).toEqual({
      ok: true,
      san: 'e4',
    })
  })
})

const afterNc6Legal = [
  { san: 'Nd4', uci: 'f3d4' },
  { san: 'Nxe5', uci: 'f3e5' },
  { san: 'Ng5', uci: 'f3g5' },
  { san: 'Bc4', uci: 'f1c4' },
]

describe('parseMoveResponse with legal moves', () => {
  it('accepts UCI that uniquely maps to a legal SAN', () => {
    expect(parseMoveResponse('{"move": "e2e4"}', [{ san: 'e4', uci: 'e2e4' }])).toEqual({
      ok: true,
      san: 'e4',
    })
  })

  it('maps Nf3+ onto the canonical legal SAN', () => {
    expect(parseMoveResponse('{"move": "Nf3+"}', [{ san: 'Nf3+', uci: 'g1f3' }])).toEqual({
      ok: true,
      san: 'Nf3+',
    })
    expect(parseMoveResponse('{"move": "Nf3"}', [{ san: 'Nf3+', uci: 'g1f3' }])).toEqual({
      ok: true,
      san: 'Nf3+',
    })
  })

  it('maps 0-0 onto O-O', () => {
    expect(parseMoveResponse('{"move": "0-0"}', [{ san: 'O-O', uci: 'e1g1' }])).toEqual({
      ok: true,
      san: 'O-O',
    })
  })

  it('accepts a unique case-insensitive SAN', () => {
    expect(parseMoveResponse('{"move": "nf3"}', [{ san: 'Nf3', uci: 'g1f3' }])).toEqual({
      ok: true,
      san: 'Nf3',
    })
  })

  it('does not snap an opening-book SAN that is not in the legal list', () => {
    expect(parseMoveResponse('{"move": "Nf3"}', afterNc6Legal)).toEqual({
      ok: false,
      reason: 'unparseable',
    })
  })
})

describe('extractReasoningFromReply', () => {
  it('reads an optional JSON reason field', () => {
    expect(extractReasoningFromReply('{"move": "Nf3", "reason": "Develop the knight."}')).toBe(
      'Develop the knight.',
    )
  })

  it('reads think-tag content and leftover prose', () => {
    const raw =
      '<think>e4 takes the center.</think>\nI will open.\n{"move": "e4"}\nDone.'
    expect(extractReasoningFromReply(raw)).toBe('e4 takes the center.\n\nI will open.\n\nDone.')
  })

  it('returns undefined when there is only the move JSON', () => {
    expect(extractReasoningFromReply('{"move": "e4"}')).toBeUndefined()
  })
})

describe('extractOpenThink', () => {
  it('returns inner text of an unclosed think tag', () => {
    expect(extractOpenThink('<think>Occupy the center')).toBe('Occupy the center')
  })

  it('returns undefined when the tag is already closed', () => {
    expect(extractOpenThink('<think>done</think>{"move":"e4"}')).toBeUndefined()
  })
})
