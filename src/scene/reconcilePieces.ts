import type { LastMove, PieceOnBoard, Square } from '../types'

export interface VisualPiece extends PieceOnBoard {
  id: string
}

function squareDist(a: Square, b: Square): number {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]))
}

function samePiece(a: PieceOnBoard, b: PieceOnBoard): boolean {
  return a.square === b.square && a.type === b.type && a.color === b.color
}

/**
 * Keep mesh identity stable across a ply so the correct pawn slides onto a
 * capture instead of the first unused same-type piece (which can be one file
 * over when two pawns of a color change in one snapshot).
 */
export function reconcilePieces(
  prev: VisualPiece[],
  next: PieceOnBoard[],
  lastMove: LastMove | null,
): { visual: VisualPiece[]; captured: VisualPiece[] } {
  const used = new Set<string>()
  const visual: VisualPiece[] = []

  const take = (piece: VisualPiece, dest: PieceOnBoard) => {
    used.add(piece.id)
    visual.push({
      ...piece,
      square: dest.square,
      type: dest.type,
      color: dest.color,
    })
  }

  if (lastMove) {
    const mover = prev.find((p) => !used.has(p.id) && p.square === lastMove.from)
    const dest = next.find((p) => p.square === lastMove.to)
    if (mover && dest && mover.color === dest.color) {
      take(mover, dest)
    }
  }

  for (const p of next) {
    if (visual.some((v) => samePiece(v, p))) continue
    const stay = prev.find((x) => !used.has(x.id) && samePiece(x, p))
    if (stay) take(stay, p)
  }

  for (const p of next) {
    if (visual.some((v) => samePiece(v, p))) continue
    let best: VisualPiece | undefined
    let bestDist = Infinity
    for (const x of prev) {
      if (used.has(x.id) || x.type !== p.type || x.color !== p.color) continue
      const dist = squareDist(x.square, p.square)
      if (dist < bestDist) {
        best = x
        bestDist = dist
      }
    }
    if (best) take(best, p)
    else visual.push({ id: crypto.randomUUID(), ...p })
  }

  return { visual, captured: prev.filter((x) => !used.has(x.id)) }
}
