import type { LegalMove } from '../types'

/**
 * Strict JSON contract: {"move": "<SAN>"}. Optional "reason" is ignored for parse.
 * Robust extract is allowed; a second request is not.
 */

export type ParseMoveResult =
  | { ok: true; san: string }
  | { ok: false; reason: 'unparseable' }

const THINK_TAG = /<(think|thinking|reasoning)>([\s\S]*?)<\/\1>/gi

const JSON_REASON_KEYS = ['reason', 'reasoning', 'thought', 'explanation'] as const

export function stripMarkdownFences(text: string): string {
  return text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1')
}

export function stripThinkBlocks(text: string): { text: string; thinking: string } {
  const chunks: string[] = []
  const stripped = text.replace(THINK_TAG, (_match, _tag: string, inner: string) => {
    const t = inner.trim()
    if (t) chunks.push(t)
    return '\n'
  })
  return { text: stripped, thinking: chunks.join('\n\n') }
}

/** Inner text of an unclosed <think>… tag so streaming CoT can be shown before the close. */
export function extractOpenThink(text: string): string | undefined {
  const re = /<(think|thinking|reasoning)>/gi
  let last: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) last = match
  if (!last) return undefined
  const innerStart = last.index + last[0].length
  const rest = text.slice(innerStart)
  const close = rest.search(new RegExp(`</${last[1]}>`, 'i'))
  if (close >= 0) return undefined
  const inner = rest.trim()
  return inner || undefined
}

export function extractFirstJsonObject(text: string): unknown | null {
  return findFirstJsonObject(text)?.value ?? null
}

function tryParseObjectAt(
  text: string,
  start: number,
): { value: unknown; start: number; end: number } | null {
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return {
            value: JSON.parse(text.slice(start, i + 1)) as unknown,
            start,
            end: i + 1,
          }
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function findFirstJsonObject(
  text: string,
): { value: unknown; start: number; end: number } | null {
  let from = 0
  while (from < text.length) {
    const start = text.indexOf('{', from)
    if (start < 0) return null
    const parsed = tryParseObjectAt(text, start)
    if (parsed) return parsed
    from = start + 1
  }
  return null
}

/** Salvage `"move": "SAN"` from truncated or unescaped JSON. */
function extractMoveSan(text: string): string | null {
  const match = /"move"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text)
  if (!match) return null
  try {
    const san = JSON.parse(`"${match[1]}"`) as unknown
    if (typeof san === 'string' && san.trim()) return san.trim()
  } catch {
    const san = match[1].trim()
    if (san) return san
  }
  return null
}

export function mergeReasoning(...parts: Array<string | undefined | null>): string | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const trimmed = part?.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out.length > 0 ? out.join('\n\n') : undefined
}

export function extractReasoningFromReply(raw: string): string | undefined {
  const think = stripThinkBlocks(raw)
  const stripped = stripMarkdownFences(think.text)
  return mergeReasoning(think.thinking, leftoverAroundJson(stripped), reasonFromJson(stripped))
}

function leftoverAroundJson(text: string): string | undefined {
  const found = findFirstJsonObject(text)
  if (!found) {
    const trimmed = text.trim()
    return trimmed || undefined
  }
  const before = text.slice(0, found.start).trim()
  const after = text.slice(found.end).trim()
  return mergeReasoning(before, after)
}

function reasonFromJson(text: string): string | undefined {
  const obj = extractFirstJsonObject(text)
  if (obj === null || typeof obj !== 'object') return undefined
  const rec = obj as Record<string, unknown>
  for (const key of JSON_REASON_KEYS) {
    const value = rec[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function moveFromObject(obj: unknown): string | null {
  if (obj === null || typeof obj !== 'object') return null
  const move = (obj as { move?: unknown }).move
  if (typeof move !== 'string') return null
  const san = move.trim()
  return san || null
}

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i

function uniqueMatch<T>(items: T[], pred: (item: T) => boolean): T | null {
  const hits = items.filter(pred)
  return hits.length === 1 ? hits[0]! : null
}

/** Strip check/mate markers and map 0-0 / o-o to O-O. */
export function normalizeSanCandidate(raw: string): string {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  let san = trimmed
  if (lower === '0-0' || lower === 'o-o') san = 'O-O'
  else if (lower === '0-0-0' || lower === 'o-o-o') san = 'O-O-O'
  return san.replace(/[+#]+$/, '')
}

/**
 * Map a model move string onto a unique legal SAN. No nearest-neighbor snap:
 * Nf3 is not rewritten to Nd4 just because Nd4 is legal.
 */
export function resolveLegalMove(candidate: string, legal: LegalMove[]): string | null {
  const trimmed = candidate.trim()
  if (!trimmed || legal.length === 0) return null

  const exact = uniqueMatch(legal, (m) => m.san === trimmed)
  if (exact) return exact.san

  const normalized = normalizeSanCandidate(trimmed)
  const byNorm = uniqueMatch(legal, (m) => normalizeSanCandidate(m.san) === normalized)
  if (byNorm) return byNorm.san

  const byCase = uniqueMatch(
    legal,
    (m) => normalizeSanCandidate(m.san).toLowerCase() === normalized.toLowerCase(),
  )
  if (byCase) return byCase.san

  if (UCI_RE.test(trimmed)) {
    const uci = trimmed.toLowerCase()
    const byUci = uniqueMatch(legal, (m) => m.uci.toLowerCase() === uci)
    if (byUci) return byUci.san
  }

  return null
}

function firstMoveCandidate(stripped: string): string | null {
  let from = 0
  while (from < stripped.length) {
    const found = findFirstJsonObject(stripped.slice(from))
    if (!found) break
    const san = moveFromObject(found.value)
    if (san) return san
    from += found.end
  }
  return extractMoveSan(stripped)
}

export function parseMoveResponse(
  raw: string,
  legal?: LegalMove[],
): ParseMoveResult {
  const { text } = stripThinkBlocks(raw)
  const stripped = stripMarkdownFences(text)
  const candidate = firstMoveCandidate(stripped)
  if (!candidate) return { ok: false, reason: 'unparseable' }

  if (!legal || legal.length === 0) return { ok: true, san: candidate }

  const resolved = resolveLegalMove(candidate, legal)
  if (resolved) return { ok: true, san: resolved }
  return { ok: false, reason: 'unparseable' }
}
