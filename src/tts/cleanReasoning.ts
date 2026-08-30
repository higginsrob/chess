const SAN_TOKEN =
  /^(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[KQRBN])?[+#]?)/

const LEGAL_HEADER = /(?:The\s+)?legal moves(?:\s*\(SAN\))?\s*(?:are\s*:|:|are)\s*/gi

const JSON_BLOB = /\{[^{}]*"move"\s*:\s*"[^"]+"[^{}]*\}/g

const BOILERPLATE: RegExp[] = [
  /json only/i,
  /reply with json/i,
  /respond as json/i,
  /respond with json/i,
  /no other text/i,
  /ensure json/i,
  /final no extra/i,
  /containing ["“]move["”]/i,
  /choose a legal move/i,
  /need choose a legal/i,
  /must be one of the legal/i,
  /we need to respond as (white|black)/i,
  /you are playing chess as/i,
  /playing chess as (white|black)/i,
  /\bthe fen is\b/i,
  /\bcurrent fen\b/i,
  /^starting position\.?$/i,
  /legal moves \(san\)/i,
  /the legal moves are\b/i,
  /play your move as json/i,
  /respond as (white|black) in a chess/i,
]

function looksLikeSanList(text: string): boolean {
  const tokens = text
    .split(/[,\s]+/)
    .map((t) => t.replace(/[.,;:]+$/g, ''))
    .filter(Boolean)
  if (tokens.length < 6) return false
  const hits = tokens.filter((t) => {
    const m = t.match(SAN_TOKEN)
    return m !== null && m[0] === t
  }).length
  return hits / tokens.length >= 0.7
}

/** Linear scan — the previous nested SAN quantifier backtracked on long CoT. */
function stripLegalMoveLists(text: string): string {
  let result = ''
  let last = 0
  LEGAL_HEADER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LEGAL_HEADER.exec(text)) !== null) {
    result += text.slice(last, match.index)
    let i = match.index + match[0].length
    while (i < text.length) {
      while (i < text.length && /[, \t]/.test(text[i]!)) i++
      const san = text.slice(i).match(SAN_TOKEN)
      if (!san) break
      i += san[0].length
      if (text[i] === '.') i++
    }
    last = i
    LEGAL_HEADER.lastIndex = i
  }
  result += text.slice(last)
  return result
}

function isBoilerplate(sentence: string): boolean {
  const t = sentence.trim()
  if (!t) return true
  if (/^starting position\.?$/i.test(t)) return true
  if (looksLikeSanList(t)) return true
  return BOILERPLATE.some((re) => re.test(t))
}

/**
 * Drop prompt-echo / JSON-contract filler so reasoning is chess, not harness restatement.
 */
export function cleanReasoning(text: string): string {
  const stripped = stripLegalMoveLists(text.replace(JSON_BLOB, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!stripped) return ''

  const chunks = stripped.split(/((?<=[.!?])(?:[ \t]+|$)|(?:\n{2,}))/u)
  const kept: string[] = []
  for (let i = 0; i < chunks.length; i += 2) {
    const sentence = chunks[i] ?? ''
    const sep = chunks[i + 1] ?? ''
    if (isBoilerplate(sentence)) continue
    kept.push(sentence, sep)
  }
  return kept.join('').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Strip markdown punctuation so TTS does not read asterisks and ticks.
 */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function reasoningForSpeech(text: string): string {
  return stripMarkdownForSpeech(cleanReasoning(text))
}
