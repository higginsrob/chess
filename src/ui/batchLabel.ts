import type { BatchState } from '../game/GameProvider'

export function isMultiRun(batch: BatchState | null): batch is BatchState {
  return Boolean(batch && batch.size > 1)
}

export function batchGameLabel(batch: Pick<BatchState, 'index' | 'size'>): string {
  return `Game ${batch.index + 1} of ${batch.size}`
}
