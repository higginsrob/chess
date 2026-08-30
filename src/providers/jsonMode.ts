/**
 * JSON-mode mapping is the adapter's job.
 * Cloud (OpenAI): response_format json_object, or json_schema when constraining
 * the move to the legal SAN list.
 * Local (Ollama OpenAI-compat and similar): format: "json" or a JSON schema
 * object, plus response_format for servers that speak the OpenAI dialect.
 * Send JSON-mode only when the model config toggle is on.
 */

export interface ChessMoveJsonSchema {
  type: 'object'
  properties: { move: { type: 'string'; enum: string[] } }
  required: ['move']
  additionalProperties: false
}

export function chessMoveSchema(legalSans: string[]): ChessMoveJsonSchema {
  return {
    type: 'object',
    properties: { move: { type: 'string', enum: legalSans } },
    required: ['move'],
    additionalProperties: false,
  }
}

export interface JsonModeOpts {
  jsonMode: boolean
  localInference: boolean
  legalMoveSchema?: boolean
  legalSans?: string[]
}

export function usesLegalMoveSchema(opts: JsonModeOpts): boolean {
  return Boolean(
    opts.jsonMode &&
      opts.legalMoveSchema !== false &&
      opts.legalSans &&
      opts.legalSans.length > 0,
  )
}

export function applyJsonMode(body: Record<string, unknown>, opts: JsonModeOpts): void {
  if (!opts.jsonMode) return
  if (usesLegalMoveSchema(opts)) {
    const schema = chessMoveSchema(opts.legalSans!)
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'chess_move', strict: true, schema },
    }
    if (opts.localInference) {
      body.format = schema
    }
    return
  }
  body.response_format = { type: 'json_object' }
  if (opts.localInference) {
    body.format = 'json'
  }
}
