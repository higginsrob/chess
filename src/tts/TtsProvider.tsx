import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useGame } from '../game/GameProvider'
import { useSettings } from '../settings/SettingsContext'
import type { Color, SeatVoice } from '../types'
import { reasoningForSpeech } from './cleanReasoning'
import { splitSentences } from './sentences'
import { speakSan } from './speakSan'
import { findVoice, speechSupported } from './voices'

export type SpeakingKind = 'reasoning' | 'move'

export interface TtsContextValue {
  speakingPly: number | null
  speakingKind: SpeakingKind | null
  sentences: string[]
  sentenceIndex: number
}

type Job =
  | { kind: 'reasoning'; ply: number; color: Color; text: string; voiceURI: string }
  | { kind: 'move'; ply: number; color: Color; spoken: string; voiceURI: string }

const idle: TtsContextValue = {
  speakingPly: null,
  speakingKind: null,
  sentences: [],
  sentenceIndex: 0,
}

const TtsContext = createContext<TtsContextValue | null>(null)

function voiceFor(voices: { white: SeatVoice; black: SeatVoice }, color: Color): SeatVoice {
  return color === 'w' ? voices.white : voices.black
}

function completeSentences(text: string): string[] {
  const sentences = splitSentences(text)
  if (sentences.length === 0) return []
  if (/[.!?]["']?$/.test(text.trim())) return sentences
  return sentences.slice(0, -1)
}

function speakUtterance(
  text: string,
  voiceURI: string,
  id: number,
  runId: { current: number },
): Promise<void> {
  if (!speechSupported() || !text.trim()) return Promise.resolve()
  if (id !== runId.current) return Promise.resolve()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = findVoice(voiceURI)
    if (voice) utterance.voice = voice
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
  })
}

export function TtsProvider({ children }: { children: ReactNode }) {
  const { plies, playEpoch, streamingReasoning, snapshot } = useGame()
  const { settings } = useSettings()
  const [state, setState] = useState<TtsContextValue>(idle)

  const queueRef = useRef<Job[]>([])
  const processingRef = useRef(false)
  const currentKindRef = useRef<SpeakingKind | null>(null)
  const runId = useRef(0)
  const seenRef = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const pliesRef = useRef(plies)
  pliesRef.current = plies
  const epochStarted = useRef(false)
  const livePlyRef = useRef(0)
  const liveSpokenRef = useRef(0)
  const liveLastRef = useRef('')
  const displayPlyRef = useRef<number | null>(null)
  const displaySentencesRef = useRef<string[]>([])

  const cancelSpeech = useCallback(() => {
    runId.current += 1
    if (speechSupported()) window.speechSynthesis.cancel()
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      while (true) {
        const id = runId.current
        const job = queueRef.current.shift()
        if (!job) break
        currentKindRef.current = job.kind

        if (job.kind === 'reasoning') {
          if (displayPlyRef.current !== job.ply) {
            displayPlyRef.current = job.ply
            displaySentencesRef.current = []
          }
          const parts = splitSentences(job.text)
          const start = displaySentencesRef.current.length
          displaySentencesRef.current = [...displaySentencesRef.current, ...parts]
          const sentences = displaySentencesRef.current
          setState({
            speakingPly: job.ply,
            speakingKind: 'reasoning',
            sentences,
            sentenceIndex: start,
          })
          for (let i = 0; i < parts.length; i++) {
            if (id !== runId.current) break
            setState((prev) => ({ ...prev, sentenceIndex: start + i }))
            await speakUtterance(parts[i]!, job.voiceURI, id, runId)
          }
        } else {
          displayPlyRef.current = null
          displaySentencesRef.current = []
          setState({
            speakingPly: job.ply,
            speakingKind: 'move',
            sentences: [job.spoken],
            sentenceIndex: 0,
          })
          await speakUtterance(job.spoken, job.voiceURI, id, runId)
        }
        currentKindRef.current = null
      }
    } finally {
      processingRef.current = false
      currentKindRef.current = null
      if (queueRef.current.length > 0) {
        void processQueue()
      } else {
        setState(idle)
      }
    }
  }, [])

  const cancelAll = useCallback(() => {
    queueRef.current = []
    livePlyRef.current = 0
    liveSpokenRef.current = 0
    liveLastRef.current = ''
    displayPlyRef.current = null
    displaySentencesRef.current = []
    cancelSpeech()
    setState(idle)
  }, [cancelSpeech])

  const enqueueLive = useCallback(
    (text: string, ply: number, color: Color, voiceURI: string, includeIncomplete: boolean) => {
      const spoken = reasoningForSpeech(text)
      if (!spoken) return
      const parts = includeIncomplete ? splitSentences(spoken) : completeSentences(spoken)
      for (let i = liveSpokenRef.current; i < parts.length; i++) {
        queueRef.current.push({
          kind: 'reasoning',
          ply,
          color,
          text: parts[i]!,
          voiceURI,
        })
      }
      liveSpokenRef.current = parts.length
      void processQueue()
    },
    [processQueue],
  )

  useEffect(() => {
    const ply = plies.length + 1
    const { voices, speakReasoning } = settingsRef.current
    const seat = voiceFor(voices, snapshot.turn)

    if (!streamingReasoning) {
      if (liveLastRef.current && speakReasoning && seat.enabled) {
        enqueueLive(liveLastRef.current, livePlyRef.current || ply, snapshot.turn, seat.voiceURI, true)
      }
      liveLastRef.current = ''
      return
    }

    if (livePlyRef.current !== ply) {
      livePlyRef.current = ply
      liveSpokenRef.current = 0
    }
    liveLastRef.current = streamingReasoning
    if (!speakReasoning || !seat.enabled) return
    enqueueLive(streamingReasoning, ply, snapshot.turn, seat.voiceURI, false)
  }, [
    streamingReasoning,
    plies.length,
    snapshot.turn,
    enqueueLive,
    settings.speakReasoning,
    settings.voices,
  ])

  useEffect(() => {
    if (plies.length === 0) {
      seenRef.current = 0
      cancelAll()
      return
    }
    if (plies.length < seenRef.current) {
      seenRef.current = 0
      cancelAll()
    }
    const fresh = plies.slice(seenRef.current)
    seenRef.current = plies.length
    const { voices, speakReasoning } = settingsRef.current
    for (const ply of fresh) {
      const seat = voiceFor(voices, ply.color)
      if (!seat.enabled) continue
      const streamedThisPly = livePlyRef.current === ply.ply && liveSpokenRef.current > 0
      if (speakReasoning && ply.reasoning && !streamedThisPly) {
        const spoken = reasoningForSpeech(ply.reasoning)
        if (spoken) {
          queueRef.current.push({
            kind: 'reasoning',
            ply: ply.ply,
            color: ply.color,
            text: spoken,
            voiceURI: seat.voiceURI,
          })
        }
      }
      if (ply.san && ply.parseResult === 'ok') {
        queueRef.current.push({
          kind: 'move',
          ply: ply.ply,
          color: ply.color,
          spoken: speakSan(ply.san),
          voiceURI: seat.voiceURI,
        })
      }
    }
    void processQueue()
  }, [plies, cancelAll, processQueue])

  useEffect(() => {
    if (settings.speakReasoning) return
    queueRef.current = queueRef.current.filter((job) => job.kind !== 'reasoning')
    if (currentKindRef.current === 'reasoning') cancelSpeech()
  }, [settings.speakReasoning, cancelSpeech])

  useEffect(() => {
    if (!epochStarted.current) {
      epochStarted.current = true
      return
    }
    cancelAll()
    seenRef.current = pliesRef.current.length
  }, [playEpoch, cancelAll])

  useEffect(() => {
    if (!speechSupported()) return
    const timer = window.setInterval(() => {
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => cancelAll(), [cancelAll])

  const value = useMemo<TtsContextValue>(() => state, [state])

  return <TtsContext.Provider value={value}>{children}</TtsContext.Provider>
}

export function useTts(): TtsContextValue {
  const ctx = useContext(TtsContext)
  if (!ctx) throw new Error('useTts must be used within TtsProvider')
  return ctx
}
