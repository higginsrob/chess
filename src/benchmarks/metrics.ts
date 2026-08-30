import type { GameLog, TerminationReason } from '../types'

const ILLEGAL_FORFEITS: TerminationReason[] = ['illegal_move', 'unparseable_move']

export interface Metrics {
  games: number
  whiteWins: number
  blackWins: number
  draws: number
  meanPly: number
  meanLatencyMs: number | null
  parseSuccessRate: number | null
  illegalForfeitRate: number
  termination: Record<string, number>
  acplWhite: number | null
  acplBlack: number | null
  inaccuracies: number
  mistakes: number
  blunders: number
  annotatedGames: number
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function aggregateLogs(logs: GameLog[]): Metrics {
  const termination: Record<string, number> = {}
  let whiteWins = 0
  let blackWins = 0
  let draws = 0
  let illegalForfeits = 0
  const plies: number[] = []
  const latencies: number[] = []
  let parseOk = 0
  let parseTotal = 0
  const acplW: number[] = []
  const acplB: number[] = []
  let inaccuracies = 0
  let mistakes = 0
  let blunders = 0
  let annotatedGames = 0

  for (const log of logs) {
    termination[log.termination] = (termination[log.termination] ?? 0) + 1
    if (log.winner === 'w') whiteWins++
    else if (log.winner === 'b') blackWins++
    else draws++
    if (ILLEGAL_FORFEITS.includes(log.termination)) illegalForfeits++
    plies.push(log.plies.length)
    for (const ply of log.plies) {
      if (ply.latencyMs !== undefined) latencies.push(ply.latencyMs)
      if (ply.rawPrompt !== undefined || ply.parseResult !== 'ok') {
        parseTotal++
        if (ply.parseResult === 'ok') parseOk++
      } else if (ply.parseResult) {
        // human plies are always ok; count only model plies (those with a prompt or failure)
      }
    }
    if (log.stockfish) {
      annotatedGames++
      if (log.stockfish.acplWhite !== null) acplW.push(log.stockfish.acplWhite)
      if (log.stockfish.acplBlack !== null) acplB.push(log.stockfish.acplBlack)
      inaccuracies += log.stockfish.inaccuracies
      mistakes += log.stockfish.mistakes
      blunders += log.stockfish.blunders
    }
  }

  const n = logs.length
  return {
    games: n,
    whiteWins,
    blackWins,
    draws,
    meanPly: avg(plies) ?? 0,
    meanLatencyMs: avg(latencies),
    parseSuccessRate: parseTotal === 0 ? null : parseOk / parseTotal,
    illegalForfeitRate: n === 0 ? 0 : illegalForfeits / n,
    termination,
    acplWhite: avg(acplW),
    acplBlack: avg(acplB),
    inaccuracies,
    mistakes,
    blunders,
    annotatedGames,
  }
}

export function formatPct(n: number | null): string {
  if (n === null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

export function formatNum(n: number | null, digits = 1): string {
  if (n === null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

export function formatAcplPair(
  white: number | null | undefined,
  black: number | null | undefined,
): string {
  if (white == null && black == null) return '—'
  return `${formatNum(white ?? null, 0)} / ${formatNum(black ?? null, 0)}`
}
