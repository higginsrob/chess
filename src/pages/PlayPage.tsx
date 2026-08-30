import { useState } from 'react'
import { useGame } from '../game/GameProvider'
import { useSettings } from '../settings/SettingsContext'
import { resultLine } from '../harness/termination'
import { batchGameLabel, isMultiRun } from '../ui/batchLabel'
import { exportAnnotatedLogs } from '../benchmarks/exportZip'
import { evalAdvantage, evalBarPercent, formatEval } from '../stockfish/format'
import { LIVE_EVAL_DEPTH } from '../stockfish/thresholds'
import type { Color, Seat } from '../types'
import type { EngineScore } from '../stockfish/engine'

function seatName(seat: Seat, configs: { id: string; name: string }[]): string {
  if (seat.type === 'human') return 'Human'
  return configs.find((c) => c.id === seat.modelConfigId)?.name ?? 'Missing model'
}

function seatValue(seat: Seat): string {
  return seat.type === 'human' ? 'human' : seat.modelConfigId
}

function seatFromValue(value: string): Seat {
  return value === 'human' ? { type: 'human' } : { type: 'model', modelConfigId: value }
}

function SeatCard({
  label,
  seat,
  configs,
  active,
  selectable,
  onChange,
}: {
  label: string
  seat: Seat
  configs: { id: string; name: string }[]
  active: boolean
  selectable: boolean
  onChange: (seat: Seat) => void
}) {
  const models = [...configs].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return (
    <div className={active ? 'seat-card active' : 'seat-card'}>
      <div className="kicker">{label}</div>
      {selectable ? (
        <select
          aria-label={label}
          value={seatValue(seat)}
          onChange={(e) => onChange(seatFromValue(e.target.value))}
        >
          <option value="human">Human</option>
          {models.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        seatName(seat, configs)
      )}
    </div>
  )
}

function EvalMeter({
  score,
  sideToMove,
  ready,
}: {
  score: EngineScore | null
  sideToMove: Color
  ready: boolean | null
}) {
  const label = score
    ? formatEval({ cp: score.cp, mate: score.mate, sideToMove })
    : ready === false
      ? null
      : '…'
  const percent = score
    ? evalBarPercent({ cp: score.cp, mate: score.mate, sideToMove })
    : 50
  const advantage = evalAdvantage(label)
  const who =
    advantage === 'white' ? 'White' : advantage === 'black' ? 'Black' : 'Even'

  return (
    <div
      className="eval-meter"
      title={label && label !== '…' ? `Stockfish ${label} (White)` : 'Stockfish eval'}
    >
      <div className="eval-meter-bar" aria-hidden>
        <span className="eval-meter-fill" style={{ height: `${percent}%` }} />
      </div>
      <div className="eval-meter-copy">
        <div className={`eval-meter-score is-${advantage}`}>{label ?? '—'}</div>
        <div className="eval-meter-label">
          Stockfish · d{LIVE_EVAL_DEPTH}
          {label && label !== '…' ? ` · ${who}` : ''}
        </div>
      </div>
    </div>
  )
}

export function PlayHud() {
  const {
    snapshot,
    thinking,
    thinkingLabel,
    lastError,
    liveEval,
    stockfishReady,
    batch,
    lastLogs,
    live,
    paused,
    activeSeats,
    newGame,
    resetGame,
    runBatch,
    stop,
    resume,
    abortBatch,
    flipBoard,
  } = useGame()
  const { settings, setSettings } = useSettings()
  const [batchN, setBatchN] = useState(3)
  const [swap, setSwap] = useState(true)
  const [exporting, setExporting] = useState(false)

  const inBatch = Boolean(batch)
  const multiRun = isMultiRun(batch)
  const bothAi =
    settings.seats.white.type === 'model' && settings.seats.black.type === 'model'
  const showBatchPanel = inBatch || (!live && bothAi)
  const seatsSelectable = snapshot.status !== 'in_progress'
  const displaySeats = snapshot.status === 'in_progress' ? activeSeats : settings.seats
  const status =
    snapshot.status === 'idle'
      ? 'Idle — start a game'
      : paused
        ? 'Paused'
        : snapshot.status === 'ended' && snapshot.termination && snapshot.winner
          ? resultLine(snapshot.termination, snapshot.winner)
          : thinking
            ? `${thinkingLabel ?? 'Thinking'}…`
            : snapshot.inCheck
              ? `${snapshot.turn === 'w' ? 'White' : 'Black'} to move — check`
              : `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`
  const statusLine = multiRun ? `${batchGameLabel(batch)} · ${status}` : status

  const whiteActive = snapshot.status === 'in_progress' && snapshot.turn === 'w' && !paused
  const blackActive = snapshot.status === 'in_progress' && snapshot.turn === 'b' && !paused

  return (
    <aside className="hud">
        <div className="panel">
          <h2>Play</h2>
          <p className="status-line">{statusLine}</p>
          {snapshot.lastMove && (
            <p className="muted">Last: {snapshot.lastMove.san}</p>
          )}
          {settings.stockfishLiveEval && snapshot.status !== 'idle' && (
            <EvalMeter score={liveEval} sideToMove={snapshot.turn} ready={stockfishReady} />
          )}
          <div className="seats">
            <SeatCard
              label="White"
              seat={displaySeats.white}
              configs={settings.modelConfigs}
              active={whiteActive}
              selectable={seatsSelectable}
              onChange={(white) => setSettings((s) => ({ ...s, seats: { ...s.seats, white } }))}
            />
            <SeatCard
              label="Black"
              seat={displaySeats.black}
              configs={settings.modelConfigs}
              active={blackActive}
              selectable={seatsSelectable}
              onChange={(black) => setSettings((s) => ({ ...s, seats: { ...s.seats, black } }))}
            />
          </div>
          <div className="row" style={{ marginTop: '0.75rem' }}>
            {!inBatch && (
              <button
                type="button"
                className="btn primary"
                onClick={snapshot.status === 'in_progress' ? resetGame : newGame}
              >
                {snapshot.status === 'in_progress' ? 'Reset game' : 'New game'}
              </button>
            )}
            <button type="button" className="btn" onClick={flipBoard}>
              Flip board
            </button>
            {!inBatch && live && !paused && (
              <button type="button" className="btn danger" onClick={stop}>
                Stop
              </button>
            )}
            {!inBatch && paused && (
              <button type="button" className="btn primary" onClick={resume}>
                Resume
              </button>
            )}
          </div>
          {lastError && <p className="muted">{lastError}</p>}
          {stockfishReady === false && (
            <p className="muted">
              Stockfish WASM is not loaded. Post-game ACPL will be skipped until{' '}
              <code>public/stockfish/stockfish.js</code> is present.
            </p>
          )}
        </div>

        {showBatchPanel && (
        <div className="panel">
          <h3>Batch</h3>
          <p className="muted">
            Sequential games only. The 3D board follows the current game. Optional color swap
            reduces first-move bias.
          </p>
          <div className="row">
            <label className="field">
              Games
              <input
                type="number"
                min={1}
                max={50}
                value={batchN}
                disabled={inBatch}
                onChange={(e) => setBatchN(Number(e.target.value) || 1)}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={swap}
                disabled={inBatch}
                onChange={(e) => setSwap(e.target.checked)}
              />
              Swap colors each game
            </label>
          </div>
          {multiRun && (
            <p className="batch-progress" role="status">
              <span>{batchGameLabel(batch)}</span>
              <span className="batch-badge-bar" aria-hidden>
                <span style={{ width: `${((batch.index + 1) / batch.size) * 100}%` }} />
              </span>
            </p>
          )}
          <div className="row">
            {inBatch ? (
              <button type="button" className="btn danger" onClick={abortBatch}>
                Abort batch
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => runBatch(Math.max(1, batchN), swap)}
              >
                Run batch
              </button>
            )}
            {inBatch && live && !paused && (
              <button type="button" className="btn" onClick={stop}>
                Stop
              </button>
            )}
            {inBatch && paused && (
              <button type="button" className="btn primary" onClick={resume}>
                Resume batch
              </button>
            )}
          </div>
          {lastLogs.length > 0 && (
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="btn"
                disabled={exporting}
                onClick={() => {
                  setExporting(true)
                  void exportAnnotatedLogs(lastLogs)
                    .catch(() => undefined)
                    .finally(() => setExporting(false))
                }}
              >
                {exporting
                  ? 'Annotating…'
                  : `Download ${lastLogs.length === 1 ? 'JSON' : 'zip'}`}
              </button>
            </div>
          )}
        </div>
        )}
    </aside>
  )
}
