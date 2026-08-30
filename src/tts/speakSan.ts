const PIECES: Record<string, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight',
}

function spokenSquare(square: string): string {
  if (square.length < 2) return square
  return `${square[0]} ${square[1]}`
}

function spokenFrom(from: string): string {
  if (from.length === 2 && /[a-h][1-8]/.test(from)) return spokenSquare(from)
  return from
}

function checkPhrase(mark: string): string {
  if (mark === '#') return ' checkmate'
  if (mark === '+') return ' check'
  return ''
}

/**
 * Turn chess.js SAN into something a TTS engine can pronounce.
 */
export function speakSan(san: string): string {
  const cleaned = san.trim().replace(/[!?]+$/g, '')
  if (!cleaned) return san

  let rest = cleaned
  let check = ''
  if (rest.endsWith('#') || rest.endsWith('+')) {
    check = rest.slice(-1)
    rest = rest.slice(0, -1)
  }

  if (rest === 'O-O-O' || rest === '0-0-0') {
    return `castles queenside${checkPhrase(check)}`
  }
  if (rest === 'O-O' || rest === '0-0') {
    return `castles kingside${checkPhrase(check)}`
  }

  let promotion = ''
  const promo = rest.match(/=([KQRBN])$/i)
  if (promo) {
    promotion = promo[1]!.toUpperCase()
    rest = rest.slice(0, -2)
  }

  if (rest.length < 2) return cleaned

  const dest = rest.slice(-2)
  if (!/^[a-h][1-8]$/.test(dest)) return cleaned
  rest = rest.slice(0, -2)

  const capture = rest.endsWith('x')
  if (capture) rest = rest.slice(0, -1)

  let piece = ''
  let from = ''
  if (rest.length > 0 && PIECES[rest[0]!]) {
    piece = rest[0]!
    from = rest.slice(1)
  } else {
    from = rest
  }

  const actor = piece ? PIECES[piece]! : 'pawn'
  const verb = capture ? 'takes' : 'to'
  const fromBit = piece && from ? ` ${spokenFrom(from)}` : ''
  const promoBit = promotion ? ` promotes to ${PIECES[promotion]!.toLowerCase()}` : ''

  return `${actor}${fromBit} ${verb} ${spokenSquare(dest)}${promoBit}${checkPhrase(check)}`
}
