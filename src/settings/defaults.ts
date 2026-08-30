import {
  REASONING_EFFORTS,
  type AppSettings,
  type ExtraHeader,
  type ModelConfig,
  type OptionalNumber,
  type OptionalReasoningEffort,
  type Provider,
  type ReasoningEffort,
  type SeatVoice,
} from '../types'

export const STORAGE_KEY = 'chess-lab-settings-v1'
export const DEFAULT_TIMEOUT_MS = 120_000
/** Modest default so Ollama does not allocate the model's full (often 32k–128k) window. */
export const DEFAULT_NUM_CTX = 4096

export function newId(): string {
  return crypto.randomUUID()
}

export function optionalNumber(enabled: boolean, value: number): OptionalNumber {
  return { enabled, value }
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value)
}

export function defaultReasoningEffort(): OptionalReasoningEffort {
  return { enabled: false, value: 'medium' }
}

export function optionalReasoningEffort(
  enabled: boolean,
  value: ReasoningEffort,
): OptionalReasoningEffort {
  return { enabled, value }
}

function asOptionalNumber(value: unknown, fallback: OptionalNumber): OptionalNumber {
  if (value && typeof value === 'object') {
    const n = value as { enabled?: unknown; value?: unknown }
    if (typeof n.enabled === 'boolean' && typeof n.value === 'number' && Number.isFinite(n.value)) {
      return { enabled: n.enabled, value: n.value }
    }
  }
  return fallback
}

function asOptionalReasoningEffort(value: unknown): OptionalReasoningEffort {
  if (value && typeof value === 'object') {
    const effort = value as { enabled?: unknown; value?: unknown }
    if (typeof effort.enabled === 'boolean' && isReasoningEffort(effort.value)) {
      return { enabled: effort.enabled, value: effort.value }
    }
  }
  return defaultReasoningEffort()
}

/** Fill knobs added after a config was saved so Settings and the adapter never see undefined. */
export function normalizeModelConfig(raw: ModelConfig): ModelConfig {
  const legalMoveSchema = (raw as { legalMoveSchema?: unknown }).legalMoveSchema
  return {
    ...raw,
    numCtx: asOptionalNumber(
      (raw as { numCtx?: unknown }).numCtx,
      optionalNumber(true, DEFAULT_NUM_CTX),
    ),
    reasoningEffort: asOptionalReasoningEffort(
      (raw as { reasoningEffort?: unknown }).reasoningEffort,
    ),
    legalMoveSchema: typeof legalMoveSchema === 'boolean' ? legalMoveSchema : true,
  }
}

export function emptyHeader(): ExtraHeader {
  return { key: '', value: '' }
}

export function defaultProviders(): Provider[] {
  return [
    {
      id: newId(),
      name: 'Ollama',
      baseUrl: 'http://localhost:11434/v1',
      localInference: true,
      extraHeaders: [],
    },
    {
      id: newId(),
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      localInference: true,
      extraHeaders: [],
    },
    {
      id: newId(),
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      localInference: false,
      extraHeaders: [],
    },
    {
      id: newId(),
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      localInference: false,
      extraHeaders: [],
    },
  ]
}

export function blankProvider(): Provider {
  return {
    id: newId(),
    name: 'New provider',
    baseUrl: 'http://localhost:11434/v1',
    localInference: true,
    extraHeaders: [],
  }
}

export function blankModelConfig(providerId: string): ModelConfig {
  return {
    id: newId(),
    name: 'New model',
    providerId,
    model: '',
    temperature: optionalNumber(false, 0.7),
    maxTokens: optionalNumber(false, 256),
    topP: optionalNumber(false, 1),
    seed: optionalNumber(false, 0),
    numCtx: optionalNumber(true, DEFAULT_NUM_CTX),
    reasoningEffort: optionalReasoningEffort(false, 'medium'),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    jsonMode: true,
    legalMoveSchema: true,
    extraSystemPrompt: '',
  }
}

export function defaultSeatVoice(): SeatVoice {
  return { enabled: false, voiceURI: '' }
}

export function defaultSettings(): AppSettings {
  return {
    providers: defaultProviders(),
    modelConfigs: [],
    seats: { white: { type: 'human' }, black: { type: 'human' } },
    scene: { hdriId: 'medieval_cafe', flipBoard: false },
    stockfishLiveEval: true,
    voices: { white: defaultSeatVoice(), black: defaultSeatVoice() },
    showTurnsPanel: false,
  }
}
