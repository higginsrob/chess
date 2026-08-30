import { useGame } from '../game/GameProvider'
import { resultLine, scoreLabel, terminationLabel, winnerLabel } from '../harness/termination'

export function GameOverBanner() {
  const { snapshot, batch, newGame } = useGame()
  if (snapshot.status !== 'ended' || !snapshot.termination || !snapshot.winner) return null
  if (batch) return null

  const reason = snapshot.termination
  const winner = snapshot.winner

  return (
    <div className="game-over" role="status" aria-live="polite" aria-label={resultLine(reason, winner)}>
      <div className="game-over-card panel">
        <div className="kicker">{terminationLabel(reason)}</div>
        <h2>{winnerLabel(winner)}</h2>
        <p className="game-over-score">{scoreLabel(winner)}</p>
        <button type="button" className="btn primary" onClick={newGame}>
          New game
        </button>
      </div>
    </div>
  )
}
