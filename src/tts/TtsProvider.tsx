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
import { speakSan } from './speakSan'
import { findVoice, speechSupported } from './voices'

export type SpeakingKind = 'move'

export interface TtsContextValue {
  speakingPly: number | null
  speakingKind: SpeakingKind | null
  sentences: string[]
  sentenceIndex: number
}

type Job = { ply: number; spoken: string; voiceURI: string }

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
  const { plies, playEpoch } = useGame()
  const { settings } = useSettings()
  const [state, setState] = useState<TtsContextValue>(idle)

  const queueRef = useRef<Job[]>([])
  const processingRef = useRef(false)
  const runId = useRef(0)
  const seenRef = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const pliesRef = useRef(plies)
  pliesRef.current = plies
  const epochStarted = useRef(false)

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
        setState({
          speakingPly: job.ply,
          speakingKind: 'move',
          sentences: [job.spoken],
          sentenceIndex: 0,
        })
        await speakUtterance(job.spoken, job.voiceURI, id, runId)
      }
    } finally {
      processingRef.current = false
      if (queueRef.current.length > 0) {
        void processQueue()
      } else {
        setState(idle)
      }
    }
  }, [])

  const cancelAll = useCallback(() => {
    queueRef.current = []
    cancelSpeech()
    setState(idle)
  }, [cancelSpeech])

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
    const { voices } = settingsRef.current
    for (const ply of fresh) {
      const seat = voiceFor(voices, ply.color)
      if (!seat.enabled) continue
      if (ply.san && ply.parseResult === 'ok') {
        queueRef.current.push({
          ply: ply.ply,
          spoken: speakSan(ply.san),
          voiceURI: seat.voiceURI,
        })
      }
    }
    void processQueue()
  }, [plies, cancelAll, processQueue])

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
