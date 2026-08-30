import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../game/GameProvider'
import { resolveModel } from '../game/resolveModel'
import { materialCount } from '../harness/material'
import { buildChatMessages } from '../harness/prompt'
import { resultLine } from '../harness/termination'
import {
  fetchModelMeta,
  formatParameterCount,
  type ModelMeta,
} from '../providers/modelContext'
import {
  charsPerTokenFrom,
  contextWindow,
  estimateMessagesTokens,
  fillRatio,
  fillTone,
  formatDurationMs,
  formatTokenCompact,
  formatTokenExact,
  tokensPerSecond,
  windowKindLabel,
  type FillTone,
  type TokenUsage,
} from '../providers/usage'
import { useSettings } from '../settings/SettingsContext'
import { DEFAULT_NUM_CTX } from '../settings/defaults'
import type { Color, ModelConfig, Provider, Seat } from '../types'
import { batchGameLabel, isMultiRun } from './batchLabel'

function seatFor(seats: { white: Seat; black: Seat }, turn: Color): Seat {
  return turn === 'w' ? seats.white : seats.black
}

function useModelMeta(provider: Provider | undefined, model: string | undefined): ModelMeta | null {
  const { keys } = useSettings()
  const [meta, setMeta] = useState<ModelMeta | null>(null)
  const apiKey = provider ? keys[provider.id] : undefined

  useEffect(() => {
    if (!provider || !model?.trim()) {
      setMeta(null)
      return
    }
    let cancelled = false
    void fetchModelMeta(provider, model, apiKey).then((next) => {
      if (!cancelled) setMeta(next ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [apiKey, model, provider])

  return meta
}

function Ring({ ratio, tone }: { ratio: number | null; tone: FillTone }) {
  const r = 7
  const c = 2 * Math.PI * r
  const clamped = ratio == null ? 0 : Math.min(1, Math.max(0, ratio))
  return (
    <svg className="ctx-ring" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r={r} fill="none" className="ctx-ring-track" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        className={`ctx-ring-fill is-${tone}`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ctx-stat">
      <div className="ctx-stat-label">{label}</div>
      <div className="ctx-stat-value">
        {value}
        {hint ? <span className="ctx-stat-hint">{hint}</span> : null}
      </div>
    </div>
  )
}

function seatTitle(seat: Seat, configs: { id: string; name: string }[]): string {
  if (seat.type === 'human') return 'Human'
  return configs.find((c) => c.id === seat.modelConfigId)?.name ?? 'Missing model'
}

function focusColor(args: {
  thinking: boolean
  turn: Color
  seats: { white: Seat; black: Seat }
  settings: ReturnType<typeof useSettings>['settings']
}): Color {
  if (args.thinking) return args.turn
  if (resolveModel(args.settings, seatFor(args.seats, args.turn))) return args.turn
  if (resolveModel(args.settings, args.seats.white)) return 'w'
  if (resolveModel(args.settings, args.seats.black)) return 'b'
  return args.turn
}

function modelLines(config: ModelConfig, provider: Provider, meta: ModelMeta | null): string[] {
  const bits: string[] = []
  if (meta?.family || meta?.architecture) bits.push(meta.family ?? meta.architecture ?? '')
  const params = meta?.parameterSize ?? (meta?.parameterCount ? formatParameterCount(meta.parameterCount) : undefined)
  if (params) bits.push(params)
  if (meta?.quantization) bits.push(meta.quantization)
  if (meta?.format) bits.push(meta.format)
  const knobs: string[] = []
  if (provider.localInference) knobs.push(`num_ctx ${config.numCtx?.value ?? DEFAULT_NUM_CTX}`)
  if (meta?.maxContext) knobs.push(`max ${formatTokenExact(meta.maxContext)}`)
  if (config.temperature.enabled) knobs.push(`temp ${config.temperature.value}`)
  if (config.maxTokens.enabled) knobs.push(`max_tokens ${config.maxTokens.value}`)
  if (config.reasoningEffort?.enabled) knobs.push(`think ${config.reasoningEffort.value}`)
  if (config.jsonMode) knobs.push(config.legalMoveSchema !== false ? 'json+legal SAN' : 'json')
  knobs.push(`${Math.round(config.timeoutMs / 1000)}s timeout`)
  return [bits.filter(Boolean).join(' · '), knobs.join(' · ')].filter(Boolean)
}

function usageSourceHint(usage: TokenUsage | undefined, estimated: boolean): string | undefined {
  if (usage?.source === 'api') return 'measured'
  if (estimated) return 'est.'
  return undefined
}

export function ContextMeter() {
  const {
    game,
    snapshot,
    thinking,
    thinkingLabel,
    liveUsage,
    usageByColor,
    activeSeats,
    plies,
    batch,
  } = useGame()
  const { settings } = useSettings()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered

  const focus = focusColor({
    thinking,
    turn: snapshot.turn,
    seats: activeSeats,
    settings,
  })
  const resolved = resolveModel(settings, seatFor(activeSeats, focus))
  const whiteResolved = resolveModel(settings, activeSeats.white)
  const blackResolved = resolveModel(settings, activeSeats.black)
  const meta = useModelMeta(resolved?.provider, resolved?.config.model)
  const whiteMeta = useModelMeta(whiteResolved?.provider, whiteResolved?.config.model)
  const blackMeta = useModelMeta(blackResolved?.provider, blackResolved?.config.model)

  const extraSystemPrompt = resolved?.config.extraSystemPrompt
  const hasModel = Boolean(resolved)
  const estimatedPrompt = useMemo(() => {
    if (!hasModel || snapshot.status !== 'in_progress') return 0
    try {
      const messages = buildChatMessages({
        color: snapshot.turn,
        fen: snapshot.fen,
        pgn: snapshot.pgn,
        legalSans: snapshot.legalSans,
        lastSan: snapshot.lastMove?.san,
        extraSystemPrompt,
        skipTacticsBrief: true,
      })
      const last = usageByColor[focus]
      const chars = messages.reduce((n, m) => n + m.content.length, 0)
      return estimateMessagesTokens(messages, charsPerTokenFrom(last, chars))
    } catch {
      return 0
    }
  }, [
    extraSystemPrompt,
    focus,
    hasModel,
    snapshot.fen,
    snapshot.lastMove?.san,
    snapshot.legalSans,
    snapshot.pgn,
    snapshot.status,
    snapshot.turn,
    usageByColor,
  ])

  const ctxWindow = contextWindow(resolved?.config, resolved?.provider, meta?.maxContext)
  const lastUsage = usageByColor[focus]
  const usage = thinking && liveUsage ? liveUsage : lastUsage
  const promptTokens = Math.max(usage?.promptTokens ?? 0, estimatedPrompt)
  const completionTokens = thinking && liveUsage ? liveUsage.completionTokens : (lastUsage?.completionTokens ?? 0)
  const used = promptTokens + completionTokens
  const hasUsed = used > 0
  const ratio = ctxWindow && hasUsed ? fillRatio(used, ctxWindow.limit) : null
  const tone = fillTone(ratio ?? 0)
  const remaining = ctxWindow ? Math.max(0, ctxWindow.limit - used) : null
  const peak = plies.reduce((max, ply) => {
    if (ply.promptTokens == null) return max
    const total = ply.promptTokens + (ply.completionTokens ?? 0)
    return total > max ? total : max
  }, 0)

  const material = snapshot.status === 'idle' ? null : materialCount(game.chessInstance())
  const gameStatus =
    snapshot.status === 'idle'
      ? 'Idle'
      : snapshot.status === 'ended' && snapshot.termination && snapshot.winner
        ? resultLine(snapshot.termination, snapshot.winner)
        : thinking
          ? `${thinkingLabel ?? 'Thinking'}…`
          : snapshot.inCheck
            ? `${snapshot.turn === 'w' ? 'White' : 'Black'} to move — check`
            : `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`

  const chipPrimary =
    ratio != null ? `${Math.min(999, Math.round(ratio * 100))}%` : hasUsed ? formatTokenCompact(used) : 'ctx'
  const chipSecondary = ctxWindow
    ? `${formatTokenCompact(used)}/${formatTokenCompact(ctxWindow.limit)}`
    : hasUsed
      ? 'tokens'
      : 'no model'

  useEffect(() => {
    if (!pinned) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [pinned])

  const promptTps = tokensPerSecond(usage?.promptTokens ?? 0, usage?.promptMs)
  const completionTps = tokensPerSecond(usage?.completionTokens ?? 0, usage?.completionMs)

  return (
    <div
      ref={wrapRef}
      className={`context-meter${open ? ' is-open' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`ctx-chip is-${tone}`}
        aria-expanded={open}
        aria-controls="context-status-popup"
        aria-label={
          ctxWindow
            ? `Context ${chipPrimary} of ${windowKindLabel(ctxWindow.kind)} ${formatTokenExact(ctxWindow.limit)}`
            : 'Context usage'
        }
        onClick={() => setPinned((p) => !p)}
      >
        <Ring ratio={ratio} tone={tone} />
        <span className="ctx-chip-copy">
          <span className="ctx-chip-pct">{chipPrimary}</span>
          <span className="ctx-chip-sub">{chipSecondary}</span>
        </span>
      </button>
      {open && (
        <div className="ctx-popup panel" id="context-status-popup" role="dialog" aria-label="Session status">
          <section>
            <h3>Context</h3>
            {ctxWindow ? (
              <p className={`ctx-fill is-${tone}`}>
                <span className="ctx-fill-bar" aria-hidden>
                  <span style={{ width: `${Math.min(100, (ratio ?? 0) * 100)}%` }} />
                </span>
                <span>
                  {formatTokenExact(used)} / {formatTokenExact(ctxWindow.limit)}{' '}
                  <span className="muted">
                    {windowKindLabel(ctxWindow.kind)}
                    {ratio != null ? ` · ${Math.round(ratio * 100)}%` : ''}
                    {remaining != null ? ` · ${formatTokenExact(remaining)} left` : ''}
                  </span>
                </span>
              </p>
            ) : (
              <p className="muted">
                {hasUsed
                  ? `${formatTokenExact(used)} tokens (model max unknown).`
                  : 'Seat a model to compare usage against num_ctx or the model max.'}
              </p>
            )}
            <div className="ctx-stats">
              <Stat
                label="Prompt"
                value={formatTokenExact(promptTokens)}
                hint={usageSourceHint(usage, estimatedPrompt > 0 && (usage?.promptTokens ?? 0) < estimatedPrompt)}
              />
              <Stat label="Completion" value={formatTokenExact(completionTokens)} hint={usage?.source === 'api' ? 'measured' : undefined} />
              <Stat
                label="Next prompt"
                value={estimatedPrompt > 0 ? formatTokenExact(estimatedPrompt) : '—'}
                hint={estimatedPrompt > 0 ? 'est.' : undefined}
              />
              <Stat label="Peak this game" value={peak > 0 ? formatTokenExact(peak) : '—'} />
              {meta?.maxContext != null && (
                <Stat label="Model max" value={formatTokenExact(meta.maxContext)} />
              )}
              {ctxWindow?.kind === 'num_ctx' && (
                <Stat label="num_ctx" value={formatTokenExact(ctxWindow.limit)} />
              )}
            </div>
            {(usage?.promptMs != null || usage?.completionMs != null) && (
              <p className="muted ctx-timing">
                {usage.promptMs != null && (
                  <>
                    prompt {formatDurationMs(usage.promptMs)}
                    {promptTps != null ? ` · ${promptTps.toFixed(0)} tok/s` : ''}
                  </>
                )}
                {usage.promptMs != null && usage.completionMs != null ? ' · ' : ''}
                {usage.completionMs != null && (
                  <>
                    decode {formatDurationMs(usage.completionMs)}
                    {completionTps != null ? ` · ${completionTps.toFixed(0)} tok/s` : ''}
                  </>
                )}
              </p>
            )}
            {ctxWindow && promptTokens > ctxWindow.limit && (
              <p className="ctx-warn">
                Prompt is larger than {windowKindLabel(ctxWindow.kind)}. Raise num_ctx or the model will truncate the start of the prompt.
              </p>
            )}
          </section>

          <section>
            <h3>Model</h3>
            <SeatMeta
              label="White"
              seat={activeSeats.white}
              resolved={whiteResolved}
              meta={whiteMeta}
              active={snapshot.turn === 'w' && snapshot.status === 'in_progress'}
              configs={settings.modelConfigs}
            />
            <SeatMeta
              label="Black"
              seat={activeSeats.black}
              resolved={blackResolved}
              meta={blackMeta}
              active={snapshot.turn === 'b' && snapshot.status === 'in_progress'}
              configs={settings.modelConfigs}
            />
          </section>

          <section>
            <h3>Game</h3>
            <p className="status-line">{gameStatus}</p>
            {isMultiRun(batch) && <p className="muted">{batchGameLabel(batch)}</p>}
            <div className="ctx-stats">
              <Stat label="Ply" value={String(snapshot.plyCount)} />
              <Stat label="Turn" value={snapshot.turn === 'w' ? 'White' : 'Black'} />
              <Stat label="Last" value={snapshot.lastMove?.san ?? '—'} />
              {material && (
                <Stat label="Material" value={`${material.white}–${material.black}`} />
              )}
            </div>
            {snapshot.fen && snapshot.status !== 'idle' && <p className="fen">{snapshot.fen}</p>}
          </section>
        </div>
      )}
    </div>
  )
}

function SeatMeta({
  label,
  seat,
  resolved,
  meta,
  active,
  configs,
}: {
  label: string
  seat: Seat
  resolved: { config: ModelConfig; provider: Provider } | null
  meta: ModelMeta | null
  active: boolean
  configs: { id: string; name: string }[]
}) {
  if (!resolved) {
    return (
      <div className={active ? 'ctx-seat is-active' : 'ctx-seat'}>
        <div className="kicker">{label}</div>
        <div>{seatTitle(seat, configs)}</div>
      </div>
    )
  }
  const lines = modelLines(resolved.config, resolved.provider, meta)
  return (
    <div className={active ? 'ctx-seat is-active' : 'ctx-seat'}>
      <div className="kicker">{label}</div>
      <div className="ctx-seat-name">{resolved.config.name}</div>
      <div className="ctx-seat-id">
        {resolved.provider.name} · {resolved.config.model || 'no model id'}
      </div>
      {lines.map((line) => (
        <div key={line} className="muted ctx-seat-meta">
          {line}
        </div>
      ))}
    </div>
  )
}
