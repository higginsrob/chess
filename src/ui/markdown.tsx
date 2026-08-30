import type { ReactNode } from 'react'

export type InlineSpan =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }

export type MarkdownBlock =
  | { type: 'p'; spans: InlineSpan[] }
  | { type: 'ul'; items: InlineSpan[][] }
  | { type: 'ol'; items: InlineSpan[][] }

const INLINE =
  /(\*\*[^*]+?\*\*|__[^_]+?__|\*[^*\n]+?\*|_[^_\n]+?_|`[^`]+`)/g

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let last = 0
  const re = new RegExp(INLINE.source, 'g')
  for (const match of text.matchAll(re)) {
    const i = match.index ?? 0
    if (i > last) spans.push({ type: 'text', text: text.slice(last, i) })
    const tok = match[0]!
    if (tok.startsWith('**') || tok.startsWith('__')) {
      spans.push({ type: 'strong', text: tok.slice(2, -2) })
    } else if (tok.startsWith('`')) {
      spans.push({ type: 'code', text: tok.slice(1, -1) })
    } else {
      spans.push({ type: 'em', text: tok.slice(1, -1) })
    }
    last = i + tok.length
  }
  if (last < text.length) spans.push({ type: 'text', text: text.slice(last) })
  return spans.length > 0 ? spans : [{ type: 'text', text }]
}

function isUl(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line)
}

function isOl(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line)
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    if (isUl(line)) {
      const items: InlineSpan[][] = []
      while (i < lines.length && isUl(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*[-*+]\s+/, '')))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    if (isOl(line)) {
      const items: InlineSpan[][] = []
      while (i < lines.length && isOl(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*\d+\.\s+/, '')))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !isUl(lines[i]!) && !isOl(lines[i]!)) {
      para.push(lines[i]!)
      i++
    }
    blocks.push({ type: 'p', spans: parseInline(para.join(' ')) })
  }
  return blocks
}

function renderSpans(spans: InlineSpan[], keyPrefix: string): ReactNode[] {
  return spans.map((span, i) => {
    const key = `${keyPrefix}-${i}`
    if (span.type === 'strong') return <strong key={key}>{span.text}</strong>
    if (span.type === 'em') return <em key={key}>{span.text}</em>
    if (span.type === 'code') return <code key={key}>{span.text}</code>
    return <span key={key}>{span.text}</span>
  })
}

export function ReasoningMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text)
  if (blocks.length === 0) return null
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderSpans(item, `u${i}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderSpans(item, `o${i}-${j}`)}</li>
              ))}
            </ol>
          )
        }
        return <p key={i}>{renderSpans(block.spans, `p${i}`)}</p>
      })}
    </>
  )
}

export function ReasoningInline({ text }: { text: string }) {
  return <>{renderSpans(parseInline(text), 'i')}</>
}
