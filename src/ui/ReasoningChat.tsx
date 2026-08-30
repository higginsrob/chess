import { useEffect, useMemo, useRef } from 'react'
import { useGame } from '../game/GameProvider'
import { useSettings } from '../settings/SettingsContext'
import type { PlyLog, Seat } from '../types'
import { evalAdvantage, formatEval, formatPlyEval } from '../stockfish/format'
import { ReasoningMarkdown } from './markdown'

function seatName(seat: Seat, configs: { id: string; name: string }[]): string {
  if (seat.type === 'human') return 'Human'
  return configs.find((c) => c.id === seat.modelConfigId)?.name ?? 'Model'
}

function moveLabel(ply: PlyLog): string {
  if (ply.san) return ply.san
  if (ply.parseResult === 'unparseable') return 'unparseable'
  if (ply.parseResult === 'illegal') return 'illegal'
  return '…'
}

function sideLabel(color: PlyLog['color']): string {
  return color === 'w' ? 'White' : 'Black'
}

function isModelPly(ply: PlyLog): boolean {
  return ply.rawPrompt !== undefined || ply.reasoning !== undefined
}

function ScoreMark({ label }: { label: string | null }) {
  if (!label) return <span className="reason-score muted">—</span>
  return <span className={`reason-score is-${evalAdvantage(label)}`}>{label}</span>
}

function TurnMeta({
  color,
  name,
  move,
  score,
}: {
  color: PlyLog['color']
  name: string
  move: string
  score: string | null
}) {
  return (
    <div className="reason-row">
      <span className="reason-side">{sideLabel(color)}</span>
      <span className="reason-name">{name}</span>
      <span className="reason-move">{move}</span>
      <ScoreMark label={score} />
    </div>
  )
}

export function ReasoningChat() {
  const { snapshot, thinking, plies, streamingReasoning, liveEval } = useGame()
  const { settings } = useSettings()
  const tail = useRef<HTMLDivElement>(null)

  const modelPlies = useMemo(() => plies.filter(isModelPly), [plies])
  const hasModelSeat =
    settings.seats.white.type === 'model' || settings.seats.black.type === 'model'

  const whiteName = seatName(settings.seats.white, settings.modelConfigs)
  const blackName = seatName(settings.seats.black, settings.modelConfigs)
  const liveScore = liveEval
    ? formatEval({ cp: liveEval.cp, mate: liveEval.mate, sideToMove: snapshot.turn })
    : null
  const turnNumber =
    snapshot.status === 'ended' ? snapshot.plyCount : snapshot.plyCount + 1

  useEffect(() => {
    tail.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [modelPlies.length, thinking, streamingReasoning])

  if (!hasModelSeat && modelPlies.length === 0) return null

  return (
    <aside className="reasoning-dock" id="turns-panel">
      <div className="panel reasoning-panel">
        <div className="reasoning-head">
          <h3>Turns</h3>
          <span className="turns-count" aria-live="polite">
            Turn {turnNumber}
          </span>
        </div>
        <p className="muted reasoning-hint">
          Each model turn: the move, Stockfish score (White-positive), and any thinking returned.
        </p>
        <div className="reasoning-thread">
          {modelPlies.length === 0 && !thinking && (
            <p className="muted reasoning-empty">Waiting for the first model turn…</p>
          )}
          {modelPlies.map((ply) => {
            const side = ply.color === 'w' ? 'white' : 'black'
            const name = ply.color === 'w' ? whiteName : blackName
            return (
              <article key={ply.ply} className={`reason-turn ${side}`}>
                <TurnMeta
                  color={ply.color}
                  name={name}
                  move={moveLabel(ply)}
                  score={formatPlyEval(ply)}
                />
                {ply.reasoning ? (
                  <div className="reason-body">
                    <ReasoningMarkdown text={ply.reasoning} />
                  </div>
                ) : null}
              </article>
            )
          })}
          {thinking && (
            <article
              className={`reason-turn pending ${snapshot.turn === 'w' ? 'white' : 'black'}`}
            >
              <TurnMeta
                color={snapshot.turn}
                name={snapshot.turn === 'w' ? whiteName : blackName}
                move="Thinking"
                score={liveScore}
              />
              <div className={`reason-body${streamingReasoning ? '' : ' muted'}`}>
                {streamingReasoning ? (
                  <ReasoningMarkdown text={streamingReasoning} />
                ) : (
                  'Waiting for the model…'
                )}
              </div>
            </article>
          )}
          <div ref={tail} />
        </div>
      </div>
    </aside>
  )
}
