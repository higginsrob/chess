import type { AppSettings, ModelConfig, Provider, Seat, SeatVoice } from '../types'
import { sanitizeExtraHeaders } from '../providers/headers'
import { defaultSeatVoice, defaultSettings, normalizeModelConfig, STORAGE_KEY } from './defaults'

function isSeat(value: unknown): value is Seat {
  if (!value || typeof value !== 'object') return false
  const seat = value as { type?: unknown; modelConfigId?: unknown }
  if (seat.type === 'human') return true
  return seat.type === 'model' && typeof seat.modelConfigId === 'string'
}

function isProvider(value: unknown): value is Provider {
  if (!value || typeof value !== 'object') return false
  const p = value as Provider
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.baseUrl === 'string' &&
    typeof p.localInference === 'boolean' &&
    Array.isArray(p.extraHeaders)
  )
}

function isModelConfig(value: unknown): value is ModelConfig {
  if (!value || typeof value !== 'object') return false
  const c = value as ModelConfig
  return typeof c.id === 'string' && typeof c.providerId === 'string' && typeof c.model === 'string'
}

function isSeatVoice(value: unknown): value is SeatVoice {
  if (!value || typeof value !== 'object') return false
  const v = value as SeatVoice
  return typeof v.enabled === 'boolean' && typeof v.voiceURI === 'string'
}

export function loadSettings(): AppSettings {
  const fallback = defaultSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const providers = Array.isArray(parsed.providers)
      ? parsed.providers.filter(isProvider).map((p) => ({
          ...p,
          extraHeaders: sanitizeExtraHeaders(p.extraHeaders),
        }))
      : fallback.providers
    const modelConfigs = Array.isArray(parsed.modelConfigs)
      ? parsed.modelConfigs.filter(isModelConfig).map(normalizeModelConfig)
      : []
    const seats = parsed.seats
    return {
      providers: providers.length > 0 ? providers : fallback.providers,
      modelConfigs,
      seats: {
        white: seats && isSeat(seats.white) ? seats.white : { type: 'human' },
        black: seats && isSeat(seats.black) ? seats.black : { type: 'human' },
      },
      scene: {
        hdriId: parsed.scene?.hdriId === 'bethnal_green_entrance'
          ? 'bethnal_green_entrance'
          : 'medieval_cafe',
        flipBoard: Boolean(parsed.scene?.flipBoard),
      },
      stockfishLiveEval:
        typeof parsed.stockfishLiveEval === 'boolean'
          ? parsed.stockfishLiveEval
          : fallback.stockfishLiveEval,
      voices: {
        white: isSeatVoice(parsed.voices?.white) ? parsed.voices.white : defaultSeatVoice(),
        black: isSeatVoice(parsed.voices?.black) ? parsed.voices.black : defaultSeatVoice(),
      },
      speakReasoning: Boolean(parsed.speakReasoning),
      showReasoningPanel:
        typeof parsed.showReasoningPanel === 'boolean'
          ? parsed.showReasoningPanel
          : fallback.showReasoningPanel,
    }
  } catch {
    return fallback
  }
}

export function saveSettings(settings: AppSettings): void {
  const safe: AppSettings = {
    providers: settings.providers.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      localInference: p.localInference,
      extraHeaders: sanitizeExtraHeaders(p.extraHeaders),
    })),
    modelConfigs: settings.modelConfigs.map(normalizeModelConfig),
    seats: settings.seats,
    scene: settings.scene,
    stockfishLiveEval: settings.stockfishLiveEval,
    voices: settings.voices,
    speakReasoning: settings.speakReasoning,
    showReasoningPanel: settings.showReasoningPanel,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))
}
