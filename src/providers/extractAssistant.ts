export interface AssistantExtract {
  text: string | null
  reasoning: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function stringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function fromReasoningDetails(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value]
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const rec = asRecord(item)
    if (!rec) continue
    const piece = stringField(rec, ['text', 'summary', 'content', 'reasoning'])
    if (piece) out.push(piece)
  }
  return out
}

function collectContent(content: unknown): { text: string; reasoning: string[] } {
  if (typeof content === 'string') return { text: content, reasoning: [] }
  if (!Array.isArray(content)) return { text: '', reasoning: [] }

  const texts: string[] = []
  const reasoning: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      texts.push(part)
      continue
    }
    const rec = asRecord(part)
    if (!rec) continue
    const type = typeof rec.type === 'string' ? rec.type.toLowerCase() : ''
    const piece = stringField(rec, ['text', 'thinking', 'reasoning', 'content']) ?? ''
    if (!piece) continue
    if (
      type === 'thinking' ||
      type === 'reasoning' ||
      type === 'thought' ||
      type.startsWith('reasoning.')
    ) {
      reasoning.push(piece)
    } else {
      texts.push(piece)
    }
  }
  return { text: texts.join(''), reasoning }
}

/**
 * Pulls assistant content plus hidden/thinking fields from OpenAI-compatible payloads.
 * Local reasoning models often put CoT in `reasoning_content`, `reasoning`, or `thinking`.
 */
export function extractAssistant(payload: unknown): AssistantExtract {
  const root = asRecord(payload)
  if (!root) return { text: null, reasoning: null }
  const choices = root.choices
  const choice = Array.isArray(choices) ? asRecord(choices[0]) : null
  const message = asRecord(choice?.message) ?? asRecord(root.message)
  if (!message) return { text: null, reasoning: null }
  const collected = collectContent(message.content)

  const reasoningParts = [
    stringField(message, ['reasoning_content', 'reasoning', 'thinking']),
    choice ? stringField(choice, ['reasoning_content', 'reasoning', 'thinking']) : undefined,
    ...fromReasoningDetails(message.reasoning_details),
    ...(choice ? fromReasoningDetails(choice.reasoning_details) : []),
    ...collected.reasoning,
  ].filter((part): part is string => Boolean(part?.trim()))

  const text = collected.text
  const reasoning =
    reasoningParts.length > 0
      ? [...new Set(reasoningParts.map((p) => p.trim()).filter(Boolean))].join('\n\n')
      : ''

  if (!text && !reasoning) return { text: null, reasoning: null }
  return {
    text: text || null,
    reasoning: reasoning || null,
  }
}

/**
 * Incremental fields from one OpenAI-compatible SSE / stream chunk.
 * Also reads Ollama native `{ message: { content, thinking } }` NDJSON chunks.
 */
export function extractStreamDelta(payload: unknown): { text: string; reasoning: string } {
  const root = asRecord(payload)
  if (!root) return { text: '', reasoning: '' }
  const choices = root.choices
  const choice = Array.isArray(choices) ? asRecord(choices[0]) : asRecord(root)
  if (!choice) return { text: '', reasoning: '' }
  const delta = asRecord(choice.delta) ?? asRecord(choice.message) ?? choice
  const collected = collectContent(delta.content)

  const reasoningParts = [
    stringField(delta, ['reasoning_content', 'reasoning', 'thinking']),
    stringField(choice, ['reasoning_content', 'reasoning', 'thinking']),
    ...fromReasoningDetails(delta.reasoning_details),
    ...fromReasoningDetails(choice.reasoning_details),
    ...collected.reasoning,
  ].filter((part): part is string => Boolean(part))

  return {
    text: collected.text,
    reasoning: reasoningParts.join(''),
  }
}
