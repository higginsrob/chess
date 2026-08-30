import { Chess } from 'chess.js'
import type { GameLog, MoveClassification, PlyLog } from '../types'
import { getStockfish, type EngineEval } from './engine'
import {
  classifyCpLoss,
  DEFAULT_ANNOTATE_DEPTH,
  mateToCp,
} from './thresholds'

function scoreAsCp(ev: EngineEval): number {
  if (ev.score.mate !== undefined) return mateToCp(ev.score.mate)
  return ev.score.cp
}

export function isAnnotatablePly(ply: PlyLog): ply is PlyLog & { san: string } {
  return ply.parseResult === 'ok' && Boolean(ply.san)
}

/**
 * Post-game annotation. Stockfish scores are from the side to move.
 * cpLoss = max(0, best − played) from the mover's perspective.
 * Forfeit games with no legal plies skip the engine entirely.
 */
export async function annotateGame(
  log: GameLog,
  depth = DEFAULT_ANNOTATE_DEPTH,
): Promise<GameLog> {
  if (!log.plies.some(isAnnotatablePly)) return log

  const engine = getStockfish()
  const ok = await engine.init()
  if (!ok) return log

  let inaccuracies = 0
  let mistakes = 0
  let blunders = 0
  const whiteLosses: number[] = []
  const blackLosses: number[] = []

  const plies: PlyLog[] = []
  for (const ply of log.plies) {
    if (!isAnnotatablePly(ply)) {
      plies.push(ply)
      continue
    }
    const chess = new Chess(ply.fenBefore)
    try {
      chess.move(ply.san)
    } catch {
      plies.push(ply)
      continue
    }

    const best = await engine.evaluate(ply.fenBefore, depth)
    if (!best) {
      plies.push(ply)
      continue
    }

    const fenAfter = chess.fen()
    const after = await engine.evaluate(fenAfter, depth)
    const bestCp = scoreAsCp(best)
    // After the move, score is from the opponent; flip to the mover.
    const playedCp = after ? -scoreAsCp(after) : bestCp
    const cpLoss = Math.max(0, bestCp - playedCp)
    const classification = classifyCpLoss(cpLoss) as MoveClassification | null
    if (classification === 'inaccuracy') inaccuracies++
    if (classification === 'mistake') mistakes++
    if (classification === 'blunder') blunders++
    if (ply.color === 'w') whiteLosses.push(cpLoss)
    else blackLosses.push(cpLoss)

    plies.push({
      ...ply,
      evalCp: after?.score.mate === undefined ? after?.score.cp : undefined,
      evalMate: after?.score.mate,
      bestEvalCp: best.score.mate === undefined ? best.score.cp : undefined,
      cpLoss,
      classification,
    })
  }

  const avg = (xs: number[]): number | null =>
    xs.length === 0 ? null : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

  return {
    ...log,
    plies,
    stockfish: {
      acplWhite: avg(whiteLosses),
      acplBlack: avg(blackLosses),
      inaccuracies,
      mistakes,
      blunders,
      depth,
    },
  }
}

/** Skip work when a log already has a Stockfish summary (export / re-save). */
export async function ensureAnnotated(
  log: GameLog,
  depth = DEFAULT_ANNOTATE_DEPTH,
): Promise<GameLog> {
  if (log.stockfish) return log
  return annotateGame(log, depth)
}

export async function ensureAnnotatedAll(
  logs: GameLog[],
  depth = DEFAULT_ANNOTATE_DEPTH,
): Promise<GameLog[]> {
  const out: GameLog[] = []
  for (const log of logs) {
    out.push(await ensureAnnotated(log, depth))
  }
  return out
}
