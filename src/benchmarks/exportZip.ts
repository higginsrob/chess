import { strToU8, zipSync } from 'fflate'
import type { GameLog } from '../types'
import { aggregateLogs } from './metrics'
import { ensureAnnotatedAll } from '../stockfish/annotate'

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function zipLogFiles(logs: GameLog[]): Record<string, string> {
  const metrics = aggregateLogs(logs)
  const files: Record<string, string> = {
    'manifest.json': JSON.stringify(
      { version: 1, harnessVersion: logs[0]?.harnessVersion ?? null, count: logs.length },
      null,
      2,
    ),
    'summary.json': JSON.stringify(
      {
        version: 1,
        harnessVersion: logs[0]?.harnessVersion ?? null,
        games: metrics.games,
        annotatedGames: metrics.annotatedGames,
        acplWhite: metrics.acplWhite,
        acplBlack: metrics.acplBlack,
        inaccuracies: metrics.inaccuracies,
        mistakes: metrics.mistakes,
        blunders: metrics.blunders,
        illegalForfeitRate: metrics.illegalForfeitRate,
        parseSuccessRate: metrics.parseSuccessRate,
        whiteWins: metrics.whiteWins,
        draws: metrics.draws,
        blackWins: metrics.blackWins,
      },
      null,
      2,
    ),
  }
  logs.forEach((log, i) => {
    const name = `${String(i + 1).padStart(3, '0')}-${log.id.slice(0, 8)}.json`
    files[name] = JSON.stringify(log, null, 2)
  })
  return files
}

export function downloadLogsZip(filename: string, logs: GameLog[]): void {
  const files: Record<string, Uint8Array> = {}
  for (const [name, body] of Object.entries(zipLogFiles(logs))) {
    files[name] = strToU8(body)
  }
  const zipped = zipSync(files)
  triggerDownload(new Blob([zipped], { type: 'application/zip' }), filename)
}

/**
 * Annotate any logs that are missing a Stockfish summary, then download.
 * Game JSON includes `stockfish` (ACPL, inaccuracy/mistake/blunder counts, depth)
 * plus per-ply `evalCp` / `cpLoss` / `classification`.
 */
export async function exportAnnotatedLogs(
  logs: GameLog[],
  opts?: { zipName?: string; forceZip?: boolean },
): Promise<GameLog[]> {
  const prepared = await ensureAnnotatedAll(logs)
  if (prepared.length === 0) return prepared
  if (!opts?.forceZip && prepared.length === 1) {
    const log = prepared[0]!
    downloadJson(`game-${log.id.slice(0, 8)}.json`, log)
  } else {
    downloadLogsZip(opts?.zipName ?? `match-${prepared.length}g.zip`, prepared)
  }
  return prepared
}
