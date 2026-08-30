const MAX_CHUNK = 220

function chunkLong(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text]
  const out: string[] = []
  let remaining = text
  while (remaining.length > MAX_CHUNK) {
    const window = remaining.slice(0, MAX_CHUNK)
    const space = window.lastIndexOf(' ')
    const at = space > MAX_CHUNK / 3 ? space : MAX_CHUNK
    out.push(remaining.slice(0, at).trim())
    remaining = remaining.slice(at).trim()
  }
  if (remaining) out.push(remaining)
  return out.filter(Boolean)
}

/**
 * Split reasoning into speakable sentences. Long runs without punctuation
 * are broken at word boundaries so Chrome does not clip ~15s utterances.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const raw = trimmed.split(/(?<=[.!?])(?:\s+|$)|(?:\n{2,})/u)
  const parts = raw.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (parts.length === 0) return chunkLong(trimmed.replace(/\s+/g, ' '))

  const out: string[] = []
  for (const part of parts) out.push(...chunkLong(part))
  return out
}
