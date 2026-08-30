import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useGame } from '../game/GameProvider'
import { useSettings } from '../settings/SettingsContext'
import { useTts } from '../tts/TtsProvider'
import type { PlyLog, Seat } from '../types'
import { evalAdvantage, formatEval, formatPlyEval } from '../stockfish/format'
import { ReasoningInline, ReasoningMarkdown } from './markdown'

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

function HighlightedReasoning({
  sentences,
  sentenceIndex,
  spanRef,
}: {
  sentences: string[]
  sentenceIndex: number
  spanRef: RefObject<HTMLSpanElement | null>
}) {
  return (
    <>
      {sentences.map((sentence, i) => (
        <span
          key={i}
          ref={i === sentenceIndex ? spanRef : undefined}
          className={i === sentenceIndex ? 'reason-sentence is-speaking' : 'reason-sentence'}
        >
          <ReasoningInline text={sentence} />{' '}
        </span>
      ))}
    </>
  )
}

export function ReasoningChat() {
  const { snapshot, thinking, plies, streamingReasoning, liveEval } = useGame()
  const { settings, setSettings } = useSettings()
  const { speakingPly, speakingKind, sentences, sentenceIndex } = useTts()
  const scroller = useRef<HTMLDivElement>(null)
  const speakingSpan = useRef<HTMLSpanElement>(null)
  const [openPly, setOpenPly] = useState<number | 'thinking' | null>(null)

  const modelPlies = useMemo(() => plies.filter(isModelPly), [plies])
  const hasModelSeat =
    settings.seats.white.type === 'model' || settings.seats.black.type === 'model'

  const whiteName = seatName(settings.seats.white, settings.modelConfigs)
  const blackName = seatName(settings.seats.black, settings.modelConfigs)
  const ttsDriving = speakingKind === 'reasoning' && speakingPly !== null
  const streamPly = plies.length + 1
  const highlightingStream =
    speakingKind === 'reasoning' && speakingPly === streamPly && sentences.length > 0

  useEffect(() => {
    if (ttsDriving) {
      setOpenPly(speakingPly)
      return
    }
    if (speakingKind === 'move') return
    if (settings.speakReasoning) {
      if (thinking) setOpenPly('thinking')
      return
    }
    if (thinking) {
      setOpenPly('thinking')
      return
    }
    const last = modelPlies[modelPlies.length - 1]
    if (last) setOpenPly(last.ply)
  }, [thinking, modelPlies, ttsDriving, speakingPly, speakingKind, settings.speakReasoning])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const selected = el.querySelector('.reason-row.selected')
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [modelPlies.length, thinking, openPly, speakingPly])

  useEffect(() => {
    speakingSpan.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sentenceIndex, speakingPly, speakingKind])

  if (!hasModelSeat && modelPlies.length === 0) return null

  function isSelected(plyNum: number | 'thinking'): boolean {
    if (speakingKind === 'reasoning' && speakingPly !== null) {
      return plyNum === 'thinking' ? speakingPly === streamPly : speakingPly === plyNum
    }
    return openPly === plyNum
  }

  const selectedPly =
    typeof openPly === 'number' ? modelPlies.find((p) => p.ply === openPly) : undefined
  const showThinkingDetail = thinking && (openPly === 'thinking' || highlightingStream)
  const selectedName = selectedPly
    ? selectedPly.color === 'w'
      ? whiteName
      : blackName
    : snapshot.turn === 'w'
      ? whiteName
      : blackName
  const liveScore = liveEval
    ? formatEval({ cp: liveEval.cp, mate: liveEval.mate, sideToMove: snapshot.turn })
    : null

  return (
    <aside className="reasoning-dock" id="reasoning-panel">
      <div className="panel reasoning-panel">
        <div className="reasoning-head">
          <h3>Reasoning</h3>
          <button
            type="button"
            className={settings.speakReasoning ? 'btn primary' : 'btn'}
            aria-pressed={settings.speakReasoning}
            onClick={() =>
              setSettings((s) => ({ ...s, speakReasoning: !s.speakReasoning }))
            }
          >
            Speak reasoning
          </button>
        </div>
        <p className="muted reasoning-hint">
          Each model’s thinking after a move. Scores are Stockfish, White-positive.
        </p>
        {(modelPlies.length > 0 || thinking) && (
          <div className="reasoning-thread" ref={scroller}>
            {modelPlies.map((ply) => {
              const side = ply.color === 'w' ? 'white' : 'black'
              const name = ply.color === 'w' ? whiteName : blackName
              const selected = isSelected(ply.ply)
              return (
                <button
                  key={ply.ply}
                  type="button"
                  className={`reason-row ${side}${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => {
                    if (speakingKind === 'reasoning') return
                    setOpenPly(selected ? null : ply.ply)
                  }}
                >
                  <span className="reason-side">{sideLabel(ply.color)}</span>
                  <span className="reason-name">{name}</span>
                  <span className="reason-move">{moveLabel(ply)}</span>
                  <ScoreMark label={formatPlyEval(ply)} />
                </button>
              )
            })}
            {thinking && (
              <div
                className={`reason-row pending ${snapshot.turn === 'w' ? 'white' : 'black'}${
                  isSelected('thinking') ? ' selected' : ''
                }`}
              >
                <span className="reason-side">{sideLabel(snapshot.turn)}</span>
                <span className="reason-name">
                  {snapshot.turn === 'w' ? whiteName : blackName}
                </span>
                <span className="reason-move">Thinking</span>
                <ScoreMark label={liveScore} />
              </div>
            )}
          </div>
        )}
        <div className="reason-detail">
          {showThinkingDetail ? (
            <>
              <div className="reason-detail-meta">
                <span className="reason-side">{sideLabel(snapshot.turn)}</span>
                <span className="reason-name">{selectedName}</span>
                <span className="reason-move">Thinking</span>
                <ScoreMark label={liveScore} />
              </div>
              <div className={`reason-body${streamingReasoning ? '' : ' muted'}`}>
                {highlightingStream ? (
                  <HighlightedReasoning
                    sentences={sentences}
                    sentenceIndex={sentenceIndex}
                    spanRef={speakingSpan}
                  />
                ) : streamingReasoning ? (
                  <ReasoningMarkdown text={streamingReasoning} />
                ) : (
                  'Waiting for the model…'
                )}
              </div>
            </>
          ) : selectedPly ? (
            <>
              <div className="reason-detail-meta">
                <span className="reason-side">{sideLabel(selectedPly.color)}</span>
                <span className="reason-name">{selectedName}</span>
                <span className="reason-move">{moveLabel(selectedPly)}</span>
                <ScoreMark label={formatPlyEval(selectedPly)} />
              </div>
              <div className="reason-body">
                {selectedPly.reasoning ? (
                  speakingKind === 'reasoning' &&
                  speakingPly === selectedPly.ply &&
                  sentences.length > 0 ? (
                    <HighlightedReasoning
                      sentences={sentences}
                      sentenceIndex={sentenceIndex}
                      spanRef={speakingSpan}
                    />
                  ) : (
                    <ReasoningMarkdown text={selectedPly.reasoning} />
                  )
                ) : (
                  'No reasoning returned for this move.'
                )}
              </div>
            </>
          ) : (
            <p className="muted reasoning-empty">
              {modelPlies.length === 0
                ? 'Waiting for the first model move…'
                : 'Select a move to read its reasoning.'}
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
