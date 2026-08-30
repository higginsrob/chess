import type { GameLog } from '../types'

export interface CorpusManifest {
  version: number
  runs: Array<{ file: string; title?: string }>
}

export async function loadCorpus(): Promise<GameLog[]> {
  const url = `${import.meta.env.BASE_URL}benchmarks/manifest.json`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const manifest = (await res.json()) as CorpusManifest
    const logs: GameLog[] = []
    for (const run of manifest.runs ?? []) {
      const fileRes = await fetch(`${import.meta.env.BASE_URL}benchmarks/${run.file}`)
      if (!fileRes.ok) continue
      const data: unknown = await fileRes.json()
      if (Array.isArray(data)) logs.push(...(data as GameLog[]))
      else if (data && typeof data === 'object' && 'id' in data) logs.push(data as GameLog)
    }
    return logs
  } catch {
    return []
  }
}
