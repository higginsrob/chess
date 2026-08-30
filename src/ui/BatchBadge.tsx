import { useGame } from '../game/GameProvider'
import { batchGameLabel, isMultiRun } from './batchLabel'

export function BatchBadge() {
  const { batch } = useGame()
  if (!isMultiRun(batch)) return null

  const current = batch.index + 1
  const pct = (current / batch.size) * 100

  return (
    <div
      className="batch-badge"
      role="status"
      aria-live="polite"
      aria-label={`Batch ${batchGameLabel(batch)}`}
    >
      <div className="batch-badge-card panel">
        <div className="kicker">Batch</div>
        <div className="batch-badge-count">
          {current} of {batch.size}
        </div>
        <div className="batch-badge-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
