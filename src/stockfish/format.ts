import type { Color, PlyLog } from '../types'

/** Engine scores are from the side to move. Display is always White-positive. */
export function whitePerspectiveCp(cp: number, sideToMove: Color): number {
  return sideToMove === 'w' ? cp : -cp
}

export function whitePerspectiveMate(mate: number, sideToMove: Color): number {
  return sideToMove === 'w' ? mate : -mate
}

export function formatEval(opts: {
  cp?: number
  mate?: number
  sideToMove: Color
}): string | null {
  if (opts.mate !== undefined) {
    const mate = whitePerspectiveMate(opts.mate, opts.sideToMove)
    if (mate > 0) return `M${mate}`
    if (mate < 0) return `-M${-mate}`
    return 'M0'
  }
  if (opts.cp === undefined) return null
  const pawns = whitePerspectiveCp(opts.cp, opts.sideToMove) / 100
  if (Math.abs(pawns) < 0.005) return '0.00'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}

/** After `ply.color` moved, the opponent is to move. */
export function formatPlyEval(ply: Pick<PlyLog, 'color' | 'evalCp' | 'evalMate'>): string | null {
  return formatEval({
    cp: ply.evalCp,
    mate: ply.evalMate,
    sideToMove: ply.color === 'w' ? 'b' : 'w',
  })
}

/** 0 = Black winning, 100 = White winning. */
export function evalBarPercent(opts: {
  cp?: number
  mate?: number
  sideToMove: Color
}): number {
  if (opts.mate !== undefined) {
    const mate = whitePerspectiveMate(opts.mate, opts.sideToMove)
    if (mate > 0) return 100
    if (mate < 0) return 0
    return 50
  }
  if (opts.cp === undefined) return 50
  const clamped = Math.max(-800, Math.min(800, whitePerspectiveCp(opts.cp, opts.sideToMove)))
  return 50 + (clamped / 800) * 50
}

export function evalAdvantage(label: string | null): 'white' | 'black' | 'even' {
  if (!label || label === '0.00' || label === 'M0') return 'even'
  if (label.startsWith('-')) return 'black'
  return 'white'
}
