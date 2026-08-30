import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  Color,
  GameLog,
  GameSnapshot,
  PlyLog,
  Seat,
  Square,
} from '../types'
import { ChessLabGame } from '../harness/game'
import { extractReasoningFromReply, mergeReasoning, parseMoveResponse } from '../harness/parseMove'
import { finishGameLog, newPlyLog, snapshotSeat } from '../harness/log'
import { buildTurnMessages } from '../harness/turnMessages'
import { yieldToPaint } from '../harness/yieldToPaint'
import { chatCompletions } from '../providers/chatCompletions'
import { usesLegalMoveSchema } from '../providers/jsonMode'
import type { TokenUsage } from '../providers/usage'
import { saveGame } from '../benchmarks/idb'
import { annotateGame } from '../stockfish/annotate'
import { getStockfish, type EngineScore } from '../stockfish/engine'
import { LIVE_EVAL_DEPTH } from '../stockfish/thresholds'
import { useSettings } from '../settings/SettingsContext'
import { newId } from '../settings/defaults'
import { cleanReasoning } from '../tts/cleanReasoning'
import { resolveModel } from './resolveModel'
import { PIECE_TRAVEL_MS } from '../scene/coords'

export interface BatchState {
  running: boolean
  index: number
  size: number
  swapColors: boolean
}

interface GameContextValue {
  game: ChessLabGame
  snapshot: GameSnapshot
  thinking: boolean
  thinkingLabel: string | null
  lastError: string | null
  liveEval: EngineScore | null
  stockfishReady: boolean | null
  batch: BatchState | null
  lastLogs: GameLog[]
  plies: PlyLog[]
  playEpoch: number
  streamingReasoning: string
  liveUsage: TokenUsage | null
  usageByColor: Partial<Record<Color, TokenUsage>>
  activeSeats: { white: Seat; black: Seat }
  /** Turn loop is alive (including while paused). */
  live: boolean
  paused: boolean
  clickSquare: (square: Square) => void
  newGame: () => void
  resetGame: () => void
  runBatch: (size: number, swapColors: boolean) => void
  stop: () => void
  resume: () => void
  abortBatch: () => void
  flipBoard: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

/** Snapshot + board input only. Streaming/thinking live on GameContext so the Canvas
 * does not reconcile on every inference token. */
interface GameBoardValue {
  snapshot: GameSnapshot
  clickSquare: (square: Square) => void
}

const GameBoardContext = createContext<GameBoardValue | null>(null)

const STREAM_UI_MS = 50

function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    let timer = 0
    const finish = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    timer = window.setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

function seatFor(seats: { white: Seat; black: Seat }, turn: Color): Seat {
  return turn === 'w' ? seats.white : seats.black
}

function swapSeats(seats: { white: Seat; black: Seat }): { white: Seat; black: Seat } {
  return { white: seats.black, black: seats.white }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { settings, setSettings } = useSettings()
  const gameRef = useRef(new ChessLabGame())
  const game = gameRef.current
  const snapshot = useSyncExternalStore(
    game.subscribe,
    () => game.getSnapshot(),
    () => game.getSnapshot(),
  )

  const [thinking, setThinking] = useState(false)
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [liveEval, setLiveEval] = useState<EngineScore | null>(null)
  const [stockfishReady, setStockfishReady] = useState<boolean | null>(null)
  const [batch, setBatch] = useState<BatchState | null>(null)
  const [lastLogs, setLastLogs] = useState<GameLog[]>([])
  const [plies, setPlies] = useState<PlyLog[]>([])
  const [playEpoch, setPlayEpoch] = useState(0)
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [liveUsage, setLiveUsage] = useState<TokenUsage | null>(null)
  const [usageByColor, setUsageByColor] = useState<Partial<Record<Color, TokenUsage>>>({})
  const [activeSeats, setActiveSeats] = useState<{ white: Seat; black: Seat }>(settings.seats)
  const [live, setLive] = useState(false)
  const [paused, setPaused] = useState(false)

  const runId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const turnAbortRef = useRef<AbortController | null>(null)
  const pausedRef = useRef(false)
  const liveRef = useRef(false)
  const pauseWaitersRef = useRef<Array<() => void>>([])
  const humanWaitFinishRef = useRef<(() => void) | null>(null)
  const pliesRef = useRef<PlyLog[]>([])
  const savedIdsRef = useRef(new Set<string>())
  const clickSquareRef = useRef<(square: Square) => void>(() => undefined)
  const streamTimerRef = useRef(0)
  const pendingReasoningRef = useRef<string | null>(null)
  const pendingUsageRef = useRef<TokenUsage | null | undefined>(undefined)
  const metaRef = useRef<{
    id: string
    startedAt: string
    seats: { white: Seat; black: Seat }
    batch?: GameLog['batch']
  } | null>(null)

  const cancelStreamUi = useCallback(() => {
    if (streamTimerRef.current) {
      window.clearTimeout(streamTimerRef.current)
      streamTimerRef.current = 0
    }
    pendingReasoningRef.current = null
    pendingUsageRef.current = undefined
  }, [])

  const flushStreamUi = useCallback(() => {
    streamTimerRef.current = 0
    if (pendingReasoningRef.current != null) {
      setStreamingReasoning(cleanReasoning(pendingReasoningRef.current))
      pendingReasoningRef.current = null
    }
    if (pendingUsageRef.current !== undefined) {
      setLiveUsage(pendingUsageRef.current)
      pendingUsageRef.current = undefined
    }
  }, [])

  const scheduleStreamUi = useCallback(() => {
    if (streamTimerRef.current) return
    streamTimerRef.current = window.setTimeout(flushStreamUi, STREAM_UI_MS)
  }, [flushStreamUi])

  const clearStreamUi = useCallback(() => {
    cancelStreamUi()
    setStreamingReasoning('')
    setLiveUsage(null)
  }, [cancelStreamUi])

  const pushPly = useCallback((ply: PlyLog) => {
    pliesRef.current = [...pliesRef.current, ply]
    setPlies(pliesRef.current)
  }, [])

  const releasePauseWaiters = useCallback(() => {
    const waiters = pauseWaitersRef.current
    pauseWaitersRef.current = []
    for (const w of waiters) w()
  }, [])

  const waitIfPaused = useCallback((id: number) => {
    if (!pausedRef.current || id !== runId.current) return Promise.resolve()
    return new Promise<void>((resolve) => {
      pauseWaitersRef.current.push(resolve)
    })
  }, [])

  const stop = useCallback(() => {
    if (pausedRef.current || !liveRef.current) return
    pausedRef.current = true
    setPaused(true)
    setBatch((prev) => (prev ? { ...prev, running: false } : null))
    turnAbortRef.current?.abort()
    humanWaitFinishRef.current?.()
    setThinking(false)
    setThinkingLabel(null)
    clearStreamUi()
    setPlayEpoch((n) => n + 1)
  }, [clearStreamUi])

  const resume = useCallback(() => {
    if (!pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
    setBatch((prev) => (prev ? { ...prev, running: true } : null))
    releasePauseWaiters()
  }, [releasePauseWaiters])

  const haltRun = useCallback(() => {
    runId.current += 1
    pausedRef.current = false
    setPaused(false)
    liveRef.current = false
    setLive(false)
    abortRef.current?.abort()
    abortRef.current = null
    turnAbortRef.current?.abort()
    humanWaitFinishRef.current?.()
    releasePauseWaiters()
    setThinking(false)
    setThinkingLabel(null)
    setBatch(null)
    clearStreamUi()
    setPlayEpoch((n) => n + 1)
  }, [clearStreamUi, releasePauseWaiters])

  const abortBatch = useCallback(() => {
    haltRun()
  }, [haltRun])

  const recordHumanMove = useCallback(
    (fenBefore: string, color: Color, san: string) => {
      pushPly(
        newPlyLog({
          ply: pliesRef.current.length + 1,
          color,
          fenBefore,
          san,
          parseResult: 'ok',
        }),
      )
    },
    [pushPly],
  )

  const clickSquare = useCallback(
    (square: Square) => {
      const snap = game.getSnapshot()
      if (snap.status !== 'in_progress' || thinking || pausedRef.current) return
      const seats = metaRef.current?.seats ?? settings.seats
      const seat = seatFor(seats, snap.turn)
      if (seat.type !== 'human') return
      const fenBefore = snap.fen
      const color = snap.turn
      const result = game.clickSquare(square)
      if (result.moved && result.san) {
        recordHumanMove(fenBefore, color, result.san)
      }
    },
    [game, thinking, settings.seats, recordHumanMove],
  )
  clickSquareRef.current = clickSquare
  const stableClickSquare = useCallback((square: Square) => {
    clickSquareRef.current(square)
  }, [])

  const persistEndedGame = useCallback(async () => {
    const snap = game.getSnapshot()
    const meta = metaRef.current
    if (!meta || snap.status !== 'ended' || snap.termination == null || snap.winner == null) {
      return null
    }
    if (savedIdsRef.current.has(meta.id)) return null
    savedIdsRef.current.add(meta.id)
    try {
      const log = finishGameLog({
        id: meta.id,
        startedAt: meta.startedAt,
        white: snapshotSeat(meta.seats.white, settings),
        black: snapshotSeat(meta.seats.black, settings),
        plies: [...pliesRef.current],
        snapshot: snap,
        termination: snap.termination,
        winner: snap.winner,
        batch: meta.batch,
      })
      await saveGame(log)
      setLastLogs((prev) => (prev.some((g) => g.id === log.id) ? prev : [...prev, log]))
      void annotateGame(log)
        .then(async (annotated) => {
          if (annotated === log) return
          await saveGame(annotated)
          setLastLogs((prev) => prev.map((g) => (g.id === annotated.id ? annotated : g)))
        })
        .catch(() => {
          // Annotation is best-effort; the unannotated log is already saved.
        })
      return log
    } catch {
      savedIdsRef.current.delete(meta.id)
      return null
    }
  }, [game, settings])

  const playModelTurn = useCallback(
    async (signal: AbortSignal) => {
      const snap = game.getSnapshot()
      const meta = metaRef.current
      if (!meta || snap.status !== 'in_progress') return
      try {
        const seat = seatFor(meta.seats, snap.turn)
        const resolved = resolveModel(settings, seat)
        if (!resolved) {
          game.forfeit('http_error', snap.turn)
          setLastError('Seat is assigned to a missing model config or provider.')
          return
        }
        const { config, provider } = resolved
        const fenBefore = snap.fen
        const color = snap.turn
        const legalMoves = snap.legalMoves
        setThinking(true)
        setThinkingLabel(`${color === 'w' ? 'White' : 'Black'} · ${config.name}`)
        clearStreamUi()
        await yieldToPaint()
        if (signal.aborted || game.getSnapshot().fen !== fenBefore) {
          setThinking(false)
          setThinkingLabel(null)
          return
        }
        const { messages, offeredSans } = await buildTurnMessages(
          game.chessInstance(),
          snap,
          config.extraSystemPrompt,
        )
        const schemaOn = usesLegalMoveSchema({
          jsonMode: config.jsonMode,
          localInference: provider.localInference,
          legalMoveSchema: config.legalMoveSchema,
          legalSans: offeredSans,
        })
        const result = await chatCompletions({
          provider,
          config,
          messages,
          legalSans: offeredSans,
          signal,
          onReasoning: (text) => {
            pendingReasoningRef.current = text
            scheduleStreamUi()
          },
          onUsage: (usage) => {
            pendingUsageRef.current = usage
            scheduleStreamUi()
          },
        })
        const measured = result.ok ? result.usage : undefined
        if (measured) {
          setUsageByColor((prev) => ({ ...prev, [color]: measured }))
        }
        const tokenFields =
          measured && measured.source === 'api'
            ? { promptTokens: measured.promptTokens, completionTokens: measured.completionTokens }
            : {}
        const stale =
          signal.aborted ||
          game.getSnapshot().fen !== fenBefore ||
          game.getSnapshot().status !== 'in_progress'
        if (stale) {
          setThinking(false)
          setThinkingLabel(null)
          clearStreamUi()
          return
        }

        if (!result.ok) {
          const reason = result.kind === 'timeout' ? 'timeout' : 'http_error'
          pushPly(
            newPlyLog({
              ply: pliesRef.current.length + 1,
              color,
              fenBefore,
              rawPrompt: JSON.stringify(messages),
              rawResponse: result.detail,
              parseResult: 'unparseable',
              latencyMs: result.latencyMs,
              legalMoveSchema: schemaOn,
              ...tokenFields,
            }),
          )
          game.forfeit(reason, color)
          setLastError(result.detail)
          setThinking(false)
          setThinkingLabel(null)
          clearStreamUi()
          return
        }

        const parsed = parseMoveResponse(result.text, legalMoves)
        if (game.getSnapshot().fen !== fenBefore) {
          setThinking(false)
          setThinkingLabel(null)
          clearStreamUi()
          return
        }
        const reasoning =
          cleanReasoning(
            mergeReasoning(result.reasoning, extractReasoningFromReply(result.text)) ?? '',
          ) || undefined
        if (!parsed.ok) {
          pushPly(
            newPlyLog({
              ply: pliesRef.current.length + 1,
              color,
              fenBefore,
              rawPrompt: JSON.stringify(messages),
              rawResponse: result.text,
              reasoning,
              parseResult: 'unparseable',
              latencyMs: result.latencyMs,
              legalMoveSchema: schemaOn,
              ...tokenFields,
            }),
          )
          game.forfeit('unparseable_move', color)
          setLastError('Unparseable move — forfeit.')
          setThinking(false)
          setThinkingLabel(null)
          clearStreamUi()
          return
        }

        const applied = game.applySan(parsed.san)
        pushPly(
          newPlyLog({
            ply: pliesRef.current.length + 1,
            color,
            fenBefore,
            san: parsed.san,
            rawPrompt: JSON.stringify(messages),
            rawResponse: result.text,
            reasoning,
            parseResult: applied.ok ? 'ok' : 'illegal',
            latencyMs: result.latencyMs,
            legalMoveSchema: schemaOn,
            ...tokenFields,
          }),
        )
        if (!applied.ok) setLastError(`Illegal move ${parsed.san} — forfeit.`)
        setThinking(false)
        setThinkingLabel(null)
        clearStreamUi()
      } finally {
        if (game.getSnapshot().status === 'ended') {
          await persistEndedGame()
        }
      }
    },
    [game, settings, pushPly, persistEndedGame, clearStreamUi, scheduleStreamUi],
  )

  const waitForHuman = useCallback(
    (id: number, plyBefore: number) =>
      new Promise<void>((resolve) => {
        let settled = false
        let unsub = () => {}
        const finish = () => {
          if (settled) return
          settled = true
          if (humanWaitFinishRef.current === finish) humanWaitFinishRef.current = null
          unsub()
          resolve()
        }
        unsub = game.subscribe(() => {
          if (id !== runId.current) {
            finish()
            return
          }
          const snap = game.getSnapshot()
          if (snap.status !== 'in_progress' || snap.plyCount > plyBefore) {
            finish()
          }
        })
        humanWaitFinishRef.current = finish
        if (id !== runId.current) {
          finish()
          return
        }
        const snap = game.getSnapshot()
        if (snap.status !== 'in_progress' || snap.plyCount > plyBefore) finish()
      }),
    [game],
  )

  const runTurns = useCallback(
    async (id: number, signal: AbortSignal) => {
      let sawPly = false
      while (id === runId.current && game.getSnapshot().status === 'in_progress') {
        await waitIfPaused(id)
        if (id !== runId.current || game.getSnapshot().status !== 'in_progress') return

        const turnAc = new AbortController()
        const onParentAbort = () => turnAc.abort()
        if (signal.aborted) turnAc.abort()
        else signal.addEventListener('abort', onParentAbort)
        turnAbortRef.current = turnAc

        try {
          if (sawPly) await waitMs(PIECE_TRAVEL_MS, turnAc.signal)
          if (
            id !== runId.current ||
            pausedRef.current ||
            turnAc.signal.aborted ||
            game.getSnapshot().status !== 'in_progress'
          ) {
            continue
          }
          const snap = game.getSnapshot()
          const plyBefore = snap.plyCount
          const seats = metaRef.current?.seats ?? settings.seats
          const seat = seatFor(seats, snap.turn)
          if (seat.type === 'human') {
            await waitForHuman(id, plyBefore)
            sawPly = game.getSnapshot().plyCount > plyBefore
            continue
          }
          await playModelTurn(turnAc.signal)
          sawPly = game.getSnapshot().plyCount > plyBefore
          if (pausedRef.current) continue
          if (signal.aborted && game.getSnapshot().status !== 'ended') return
        } finally {
          signal.removeEventListener('abort', onParentAbort)
          if (turnAbortRef.current === turnAc) turnAbortRef.current = null
        }
      }
      await persistEndedGame()
    },
    [game, settings, waitForHuman, playModelTurn, persistEndedGame, waitIfPaused],
  )

  const beginGame = useCallback(
    async (seats: { white: Seat; black: Seat }, batchMeta?: GameLog['batch']) => {
      const id = ++runId.current
      pausedRef.current = false
      setPaused(false)
      releasePauseWaiters()
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      pliesRef.current = []
      setPlies([])
      setLastError(null)
      setThinking(false)
      setThinkingLabel(null)
      setLiveEval(null)
      clearStreamUi()
      setUsageByColor({})
      setActiveSeats(seats)
      liveRef.current = true
      setLive(true)
      metaRef.current = {
        id: newId(),
        startedAt: new Date().toISOString(),
        seats,
        batch: batchMeta,
      }
      game.start()
      await yieldToPaint()
      try {
        await runTurns(id, ac.signal)
        return id === runId.current
      } finally {
        if (id === runId.current && !pausedRef.current) {
          liveRef.current = false
          setLive(false)
        }
      }
    },
    [game, runTurns, clearStreamUi, releasePauseWaiters],
  )

  const newGame = useCallback(() => {
    setBatch(null)
    setLastLogs([])
    void beginGame(settings.seats)
  }, [beginGame, settings.seats])

  const resetGame = useCallback(() => {
    haltRun()
    pliesRef.current = []
    setPlies([])
    setLastError(null)
    setLiveEval(null)
    setUsageByColor({})
    metaRef.current = null
    game.reset()
    setActiveSeats(settings.seats)
  }, [haltRun, game, settings.seats])

  const runBatch = useCallback(
    (size: number, swapColors: boolean) => {
      void (async () => {
        setLastLogs([])
        const original = settings.seats
        for (let i = 0; i < size; i++) {
          setBatch({ running: true, index: i, size, swapColors })
          const seats = swapColors && i % 2 === 1 ? swapSeats(original) : original
          const ok = await beginGame(seats, { index: i, size, swapColors })
          if (!ok) break
        }
        setBatch(null)
      })()
    },
    [beginGame, settings.seats],
  )

  const flipBoard = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      scene: { ...prev.scene, flipBoard: !prev.scene.flipBoard },
    }))
  }, [setSettings])

  useEffect(() => {
    if (snapshot.status === 'idle') setActiveSeats(settings.seats)
  }, [settings.seats, snapshot.status])

  useEffect(() => {
    void getStockfish()
      .init()
      .then((ok) => setStockfishReady(ok))
  }, [])

  useEffect(() => {
    if (!settings.stockfishLiveEval) {
      setLiveEval(null)
      return
    }
    if (snapshot.status === 'idle') return
    let cancelled = false
    void getStockfish()
      .evaluate(snapshot.fen, LIVE_EVAL_DEPTH)
      .then((ev) => {
        if (cancelled || !ev) return
        const score: EngineScore = {
          cp: ev.score.cp,
          mate: ev.score.mate,
        }
        setLiveEval(score)
        const last = pliesRef.current[pliesRef.current.length - 1]
        if (!last || last.parseResult !== 'ok') return
        const next: PlyLog = {
          ...last,
          evalCp: score.mate === undefined ? score.cp : undefined,
          evalMate: score.mate,
        }
        pliesRef.current = [...pliesRef.current.slice(0, -1), next]
        setPlies(pliesRef.current)
      })
    return () => {
      cancelled = true
    }
  }, [settings.stockfishLiveEval, snapshot.fen, snapshot.status])

  useEffect(() => () => cancelStreamUi(), [cancelStreamUi])

  const boardValue = useMemo<GameBoardValue>(
    () => ({ snapshot, clickSquare: stableClickSquare }),
    [snapshot, stableClickSquare],
  )

  const value = useMemo<GameContextValue>(
    () => ({
      game,
      snapshot,
      thinking,
      thinkingLabel,
      lastError,
      liveEval,
      stockfishReady,
      batch,
      lastLogs,
      plies,
      playEpoch,
      streamingReasoning,
      liveUsage,
      usageByColor,
      activeSeats,
      live,
      paused,
      clickSquare: stableClickSquare,
      newGame,
      resetGame,
      runBatch,
      stop,
      resume,
      abortBatch,
      flipBoard,
    }),
    [
      game,
      snapshot,
      thinking,
      thinkingLabel,
      lastError,
      liveEval,
      stockfishReady,
      batch,
      lastLogs,
      plies,
      playEpoch,
      streamingReasoning,
      liveUsage,
      usageByColor,
      activeSeats,
      live,
      paused,
      stableClickSquare,
      newGame,
      resetGame,
      runBatch,
      stop,
      resume,
      abortBatch,
      flipBoard,
    ],
  )

  return (
    <GameBoardContext.Provider value={boardValue}>
      <GameContext.Provider value={value}>{children}</GameContext.Provider>
    </GameBoardContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}

export function useGameBoard(): GameBoardValue {
  const ctx = useContext(GameBoardContext)
  if (!ctx) throw new Error('useGameBoard must be used within GameProvider')
  return ctx
}
