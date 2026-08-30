import type { Chess, Color, PieceSymbol } from 'chess.js'

export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

export const PIECE_VALUES_LEGEND = 'P=1 N=3 B=3 R=5 Q=9'

export function pieceValue(type: PieceSymbol): number {
  return PIECE_VALUE[type]
}

export function pieceLetter(type: PieceSymbol): string {
  return type.toUpperCase()
}

export function materialCount(chess: Chess): { white: number; black: number } {
  let white = 0
  let black = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      const value = PIECE_VALUE[piece.type]
      if (piece.color === 'w') white += value
      else black += value
    }
  }
  return { white, black }
}

export function materialFor(chess: Chess, color: Color): number {
  const both = materialCount(chess)
  return color === 'w' ? both.white : both.black
}
