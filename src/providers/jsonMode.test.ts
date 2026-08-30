import { describe, expect, it } from 'vitest'
import { applyJsonMode, chessMoveSchema, usesLegalMoveSchema } from './jsonMode'

const legalSans = ['Nd4', 'Nxe5', 'Ng5']
const schema = chessMoveSchema(legalSans)

describe('applyJsonMode', () => {
  it('does nothing when the toggle is off', () => {
    const body: Record<string, unknown> = { model: 'x' }
    applyJsonMode(body, { jsonMode: false, localInference: true })
    expect(body.response_format).toBeUndefined()
    expect(body.format).toBeUndefined()
  })

  it('sends OpenAI response_format for cloud', () => {
    const body: Record<string, unknown> = { model: 'x' }
    applyJsonMode(body, { jsonMode: true, localInference: false })
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.format).toBeUndefined()
  })

  it('sends format json plus response_format for local inference', () => {
    const body: Record<string, unknown> = { model: 'x' }
    applyJsonMode(body, { jsonMode: true, localInference: true })
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.format).toBe('json')
  })

  it('sends a legal-SAN json_schema for cloud when the toggle is on', () => {
    const body: Record<string, unknown> = { model: 'x' }
    applyJsonMode(body, {
      jsonMode: true,
      localInference: false,
      legalMoveSchema: true,
      legalSans,
    })
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'chess_move', strict: true, schema },
    })
    expect(body.format).toBeUndefined()
  })

  it('sends format schema plus json_schema response_format for local inference', () => {
    const body: Record<string, unknown> = { model: 'x' }
    applyJsonMode(body, {
      jsonMode: true,
      localInference: true,
      legalMoveSchema: true,
      legalSans,
    })
    expect(body.format).toEqual(schema)
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'chess_move', strict: true, schema },
    })
  })

  it('falls back to json_object when schema is on but the legal list is empty', () => {
    const body: Record<string, unknown> = { model: 'x' }
    applyJsonMode(body, {
      jsonMode: true,
      localInference: true,
      legalMoveSchema: true,
      legalSans: [],
    })
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.format).toBe('json')
  })
})

describe('usesLegalMoveSchema', () => {
  it('is true only when json mode, the toggle, and a non-empty list are all set', () => {
    expect(
      usesLegalMoveSchema({
        jsonMode: true,
        localInference: true,
        legalMoveSchema: true,
        legalSans,
      }),
    ).toBe(true)
    expect(
      usesLegalMoveSchema({
        jsonMode: true,
        localInference: true,
        legalMoveSchema: false,
        legalSans,
      }),
    ).toBe(false)
  })
})
