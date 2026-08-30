import { useEffect, useState } from 'react'
import {
  REASONING_EFFORTS,
  type ModelConfig,
  type Provider,
  type ReasoningEffort,
  type Seat,
  type SeatVoice,
} from '../types'
import { useSettings } from '../settings/SettingsContext'
import { blankModelConfig, blankProvider, DEFAULT_NUM_CTX } from '../settings/defaults'
import { testConnection } from '../providers/testConnection'
import { clampNumCtx, NUM_CTX_STEP, numCtxChoices } from '../providers/modelContext'
import { isAnthropicUrl } from '../providers/anthropic'
import {
  isOllamaCloudUrl,
  ollamaCloudProxyAvailable,
} from '../providers/ollamaCloud'
import {
  catalogKey,
  EMPTY_CATALOG,
  useProviderModels,
  type ModelCatalog,
} from '../settings/useProviderModels'
import { previewVoice, useSpeechVoices, voiceLabel } from '../tts/voices'

const CORS_NOTES = [
  {
    name: 'Ollama',
    text: 'OLLAMA_ORIGINS must include https://higginsrob.github.io (Pages) and https://localhost:5173 (Vite). Example: OLLAMA_ORIGINS=https://higginsrob.github.io,https://localhost:5173,https://localhost:4173',
  },
  { name: 'LM Studio', text: 'Enable CORS in server settings.' },
  { name: 'llama.cpp', text: 'Launch with --cors (and a matching origin if required).' },
  {
    name: 'SGLang / vLLM',
    text: 'Typically already OpenAI-compat on /v1; CORS still depends on how the server is launched.',
  },
]

function seatUsesProvider(seat: Seat, providerId: string, configs: ModelConfig[]): boolean {
  if (seat.type !== 'model') return false
  return configs.find((c) => c.id === seat.modelConfigId)?.providerId === providerId
}

function resetSeatIfConfig(seat: Seat, configId: string): Seat {
  if (seat.type === 'model' && seat.modelConfigId === configId) return { type: 'human' }
  return seat
}

function SeatSelect({
  label,
  seat,
  configs,
  voice,
  onChange,
  onVoiceChange,
}: {
  label: string
  seat: Seat
  configs: ModelConfig[]
  voice: SeatVoice
  onChange: (seat: Seat) => void
  onVoiceChange: (voice: SeatVoice) => void
}) {
  const voices = useSpeechVoices()
  const value = seat.type === 'human' ? 'human' : seat.modelConfigId
  const voiceInList = voices.some((v) => v.voiceURI === voice.voiceURI)
  const voiceMissing = voices.length > 0 && Boolean(voice.voiceURI) && !voiceInList
  const models = [...configs].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return (
    <div className="seat-assign">
      <label className="field">
        {label}
        <select
          value={value}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === 'human' ? { type: 'human' } : { type: 'model', modelConfigId: v })
          }}
        >
          <option value="human">Human</option>
          {models.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={voice.enabled}
          onChange={(e) => onVoiceChange({ ...voice, enabled: e.target.checked })}
        />
        TTS enabled
      </label>
      <label className="field">
        Voice
        <span className="row" style={{ marginTop: 0, alignItems: 'stretch' }}>
          <select
            value={voice.voiceURI}
            onChange={(e) => onVoiceChange({ ...voice, voiceURI: e.target.value })}
          >
            <option value="">Browser default</option>
            {voice.voiceURI && !voiceInList && (
              <option value={voice.voiceURI}>
                {voices.length === 0 ? 'Loading voices…' : 'Saved voice (unavailable)'}
              </option>
            )}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {voiceLabel(v)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => previewVoice(voice.voiceURI)}
          >
            Preview
          </button>
        </span>
        {voices.length === 0 && <span>No browser voices found yet.</span>}
        {voiceMissing && <span>Saved voice is unavailable; using the browser default.</span>}
      </label>
    </div>
  )
}

export function SettingsPage() {
  const { settings, setSettings, keys, setKey } = useSettings()
  const [testMsg, setTestMsg] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Record<string, ModelCatalog>>({})
  const hasCloud = settings.providers.some((p) => !p.localInference)

  const { load, remember, loadContext } = useProviderModels(keys, setCatalog)

  function patchProvider(id: string, patch: Partial<Provider>) {
    setSettings((s) => ({
      ...s,
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  function patchConfig(id: string, patch: Partial<ModelConfig>) {
    setSettings((s) => ({
      ...s,
      modelConfigs: s.modelConfigs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }

  async function onTest(provider: Provider) {
    setTesting(provider.id)
    const result = await testConnection(provider)
    setTestMsg((m) => ({ ...m, [provider.id]: result.detail }))
    if (result.ok && result.ids) remember(provider, result.ids)
    setTesting(null)
  }

  return (
    <div className="page">
      {hasCloud && (
        <div className="banner">
          API keys are kept in memory only and are discarded when you refresh. This site is
          static and cannot store secrets.
        </div>
      )}

      <section className="panel">
        <h2>Providers</h2>
        <p className="muted">
          Named OpenAI-compatible endpoints. Keys never persist. Check local inference for
          Ollama / LM Studio / llama.cpp / SGLang on this machine.
        </p>
        <div className="card-list" style={{ marginTop: '0.75rem' }}>
          {settings.providers.map((p) => (
            <div key={p.id} className="card">
              <div className="row">
                <label className="field">
                  Name
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => patchProvider(p.id, { name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Base URL
                  <input
                    type="text"
                    value={p.baseUrl}
                    onChange={(e) => patchProvider(p.id, { baseUrl: e.target.value })}
                  />
                </label>
              </div>
              <div className="row">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={p.localInference}
                    onChange={(e) => patchProvider(p.id, { localInference: e.target.checked })}
                  />
                  Local inference
                </label>
              </div>
              {p.localInference ? (
                <p className="muted">
                  No key required. The endpoint URL persists across refreshes.
                </p>
              ) : (
                <form
                  className="field"
                  autoComplete="off"
                  onSubmit={(e) => e.preventDefault()}
                >
                  API key
                  <input
                    type="password"
                    autoComplete="off"
                    value={keys[p.id] ?? ''}
                    placeholder="Held in memory only"
                    onChange={(e) => setKey(p.id, e.target.value)}
                  />
                </form>
              )}
              <label className="field">
                Extra non-auth headers
                <input
                  type="text"
                  placeholder="Header-Name: value (comma-separated pairs)"
                  value={p.extraHeaders.map((h) => `${h.key}: ${h.value}`).join(', ')}
                  onChange={(e) => {
                    const extraHeaders = e.target.value
                      .split(',')
                      .map((part) => {
                        const [key, ...rest] = part.split(':')
                        return { key: (key ?? '').trim(), value: rest.join(':').trim() }
                      })
                      .filter((h) => h.key || h.value)
                    patchProvider(p.id, { extraHeaders })
                  }}
                />
                <span>
                  Do not put API keys here — Authorization / x-api-key / Cookie are not saved.
                  Use the API key field.
                </span>
              </label>
              {isAnthropicUrl(p.baseUrl) && (
                <div className="cors">
                  <p>
                    <strong>Anthropic:</strong> api.anthropic.com does not send CORS
                    headers unless the request includes{' '}
                    <code>anthropic-dangerous-direct-browser-access</code>. This app
                    adds that header, plus <code>x-api-key</code> and{' '}
                    <code>anthropic-version</code>, automatically. Paste a key from the{' '}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Anthropic console
                    </a>
                    . OpenAI-compat <code>response_format</code> is ignored — JSON is
                    still requested in the prompt.
                  </p>
                </div>
              )}
              {isOllamaCloudUrl(p.baseUrl) && (
                <div className="cors">
                  {ollamaCloudProxyAvailable() ? (
                    <p>
                      <strong>Ollama Cloud:</strong> ollama.com does not send CORS headers.
                      This Vite server proxies it, so Test connection talks to{' '}
                      <code>https://ollama.com</code> from this origin. Leave local inference
                      unchecked and paste an API key from{' '}
                      <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer">
                        ollama.com/settings/keys
                      </a>
                      .
                    </p>
                  ) : (
                    <p>
                      <strong>Ollama Cloud:</strong> ollama.com does not allow browser CORS, so
                      GitHub Pages cannot call it directly. Use local Ollama as a gateway:{' '}
                      <code>ollama signin</code>, <code>ollama pull &lt;model&gt;-cloud</code>,
                      and set the base URL to <code>http://localhost:11434/v1</code>. Or run{' '}
                      <code>npm run dev</code>, which proxies ollama.com.
                    </p>
                  )}
                </div>
              )}
              {p.localInference && (
                <div className="cors">
                  {CORS_NOTES.map((n) => (
                    <p key={n.name}>
                      <strong>{n.name}:</strong> {n.text}
                    </p>
                  ))}
                  <p>
                    Chromium often allows HTTPS pages to call <code>http://localhost</code>.
                    Safari and Firefox are stricter. Prefer <code>npm run dev</code> for local
                    models.
                  </p>
                </div>
              )}
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  disabled={testing === p.id}
                  onClick={() => void onTest(p)}
                >
                  {testing === p.id ? 'Testing…' : 'Test connection'}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      providers: s.providers.filter((x) => x.id !== p.id),
                      modelConfigs: s.modelConfigs.filter((c) => c.providerId !== p.id),
                      seats: {
                        white: seatUsesProvider(s.seats.white, p.id, s.modelConfigs)
                          ? { type: 'human' }
                          : s.seats.white,
                        black: seatUsesProvider(s.seats.black, p.id, s.modelConfigs)
                          ? { type: 'human' }
                          : s.seats.black,
                      },
                    }))
                  }
                >
                  Remove
                </button>
              </div>
              {testMsg[p.id] && <p className="muted">{testMsg[p.id]}</p>}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setSettings((s) => ({ ...s, providers: [...s.providers, blankProvider()] }))
            }
          >
            Add provider
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Model configs</h2>
        <p className="muted">
          Each config uses one provider. Model ids are loaded from <code>GET /models</code> on
          that provider. Sampling fields (including <code>reasoning_effort</code>) are sent only
          when enabled. OpenAI accepts <code>reasoning_effort</code> on reasoning models (o-series,
          gpt-5) and 400s on the rest (gpt-4o, gpt-4.1, gpt-5-chat) — those requests retry without
          the field. Local models always send <code>num_ctx</code> (default 4096; choices are
          1024, 2048, 4096, … up to that model&apos;s max). Ollama uses native{' '}
          <code>/api/chat</code> with <code>think: false</code> unless you enable{' '}
          <code>reasoning_effort</code> — default thinking fills the window and CUDA-faults.
          Default timeout is 120000 ms; timeout forfeits that seat.
        </p>
        {settings.providers.length === 0 && (
          <p className="muted">Add a provider before creating a model config.</p>
        )}
        <div className="card-list" style={{ marginTop: '0.75rem' }}>
          {settings.modelConfigs.map((c) => (
            <div key={c.id} className="card">
              <div className="row">
                <label className="field">
                  Name
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => patchConfig(c.id, { name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Provider
                  <select
                    value={c.providerId}
                    onChange={(e) => {
                      const providerId = e.target.value
                      patchConfig(c.id, { providerId, model: '' })
                    }}
                  >
                    {settings.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <ModelIdField
                  provider={settings.providers.find((p) => p.id === c.providerId)}
                  apiKey={keys[c.providerId]}
                  catalog={catalog}
                  value={c.model}
                  onChange={(model) => patchConfig(c.id, { model })}
                  onReload={(provider) => void load(provider, true)}
                />
              </div>
              <Knob
                label="temperature"
                enabled={c.temperature.enabled}
                value={c.temperature.value}
                step={0.1}
                onChange={(enabled, value) =>
                  patchConfig(c.id, { temperature: { enabled, value } })
                }
              />
              <Knob
                label="max_tokens"
                enabled={c.maxTokens.enabled}
                value={c.maxTokens.value}
                step={1}
                onChange={(enabled, value) =>
                  patchConfig(c.id, { maxTokens: { enabled, value } })
                }
              />
              <Knob
                label="top_p"
                enabled={c.topP.enabled}
                value={c.topP.value}
                step={0.05}
                onChange={(enabled, value) => patchConfig(c.id, { topP: { enabled, value } })}
              />
              <Knob
                label="seed"
                enabled={c.seed.enabled}
                value={c.seed.value}
                step={1}
                onChange={(enabled, value) => patchConfig(c.id, { seed: { enabled, value } })}
              />
              {settings.providers.find((p) => p.id === c.providerId)?.localInference && (
                <NumCtxSelect
                  provider={settings.providers.find((p) => p.id === c.providerId)}
                  apiKey={keys[c.providerId]}
                  catalog={catalog}
                  model={c.model}
                  value={c.numCtx?.value ?? DEFAULT_NUM_CTX}
                  onChange={(value) =>
                    patchConfig(c.id, { numCtx: { enabled: true, value } })
                  }
                  onNeedContext={(provider, model) => void loadContext(provider, model)}
                />
              )}
              <EnumKnob
                label="reasoning_effort"
                enabled={c.reasoningEffort?.enabled ?? false}
                value={c.reasoningEffort?.value ?? 'medium'}
                options={REASONING_EFFORTS}
                onChange={(enabled, value) =>
                  patchConfig(c.id, { reasoningEffort: { enabled, value } })
                }
              />
              <div className="row">
                <label className="field">
                  timeoutMs
                  <input
                    type="number"
                    min={1000}
                    value={c.timeoutMs}
                    onChange={(e) => patchConfig(c.id, { timeoutMs: Number(e.target.value) })}
                  />
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={c.jsonMode}
                    onChange={(e) => patchConfig(c.id, { jsonMode: e.target.checked })}
                  />
                  JSON mode
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={c.legalMoveSchema !== false}
                    disabled={!c.jsonMode}
                    onChange={(e) => patchConfig(c.id, { legalMoveSchema: e.target.checked })}
                  />
                  Constrain move to legal list
                </label>
              </div>
              <label className="field">
                Extra system prompt (appended after the harness prompt)
                <textarea
                  value={c.extraSystemPrompt}
                  onChange={(e) => patchConfig(c.id, { extraSystemPrompt: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="btn danger"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    modelConfigs: s.modelConfigs.filter((x) => x.id !== c.id),
                    seats: {
                      white: resetSeatIfConfig(s.seats.white, c.id),
                      black: resetSeatIfConfig(s.seats.black, c.id),
                    },
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            disabled={settings.providers.length === 0}
            onClick={() =>
              setSettings((s) => ({
                ...s,
                modelConfigs: [
                  ...s.modelConfigs,
                  blankModelConfig(s.providers[0]!.id),
                ],
              }))
            }
          >
            Add model config
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Assign to White / Black</h2>
        <p className="muted">Each seat is Human or a named model config.</p>
        <div className="row seat-assign-row">
          <SeatSelect
            label="White"
            seat={settings.seats.white}
            configs={settings.modelConfigs}
            voice={settings.voices.white}
            onChange={(white) => setSettings((s) => ({ ...s, seats: { ...s.seats, white } }))}
            onVoiceChange={(white) =>
              setSettings((s) => ({ ...s, voices: { ...s.voices, white } }))
            }
          />
          <SeatSelect
            label="Black"
            seat={settings.seats.black}
            configs={settings.modelConfigs}
            voice={settings.voices.black}
            onChange={(black) => setSettings((s) => ({ ...s, seats: { ...s.seats, black } }))}
            onVoiceChange={(black) =>
              setSettings((s) => ({ ...s, voices: { ...s.voices, black } }))
            }
          />
        </div>
      </section>

      <section className="panel">
        <h2>Scene</h2>
        <div className="row">
          <label className="field">
            HDRI
            <select
              value={settings.scene.hdriId}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scene: {
                    ...s.scene,
                    hdriId: e.target.value as 'medieval_cafe' | 'bethnal_green_entrance',
                  },
                }))
              }
            >
              <option value="medieval_cafe">Medieval Cafe (placeholder lighting)</option>
              <option value="bethnal_green_entrance">
                Bethnal Green Entrance (placeholder lighting)
              </option>
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={settings.scene.flipBoard}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scene: { ...s.scene, flipBoard: e.target.checked },
                }))
              }
            />
            Flip board
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={settings.stockfishLiveEval}
              onChange={(e) =>
                setSettings((s) => ({ ...s, stockfishLiveEval: e.target.checked }))
              }
            />
            Live Stockfish eval
          </label>
        </div>
      </section>
    </div>
  )
}

function ModelIdField({
  provider,
  apiKey,
  catalog,
  value,
  onChange,
  onReload,
}: {
  provider: Provider | undefined
  apiKey: string | undefined
  catalog: Record<string, ModelCatalog>
  value: string
  onChange: (model: string) => void
  onReload: (provider: Provider) => void
}) {
  const entry = provider ? (catalog[catalogKey(provider, apiKey)] ?? EMPTY_CATALOG) : EMPTY_CATALOG
  const options = [...entry.ids]
  if (value && !options.includes(value)) options.unshift(value)
  const loading = entry.status === 'loading'
  const disabled = !provider || (loading && options.length === 0)

  useEffect(() => {
    if (value) return
    if (entry.status !== 'ok' || entry.ids.length === 0) return
    onChange(entry.ids[0]!)
  }, [entry.ids, entry.status, onChange, value])

  const placeholder =
    loading
      ? 'Loading models…'
      : entry.status === 'error'
        ? 'No models loaded'
        : entry.status === 'idle'
          ? 'Reload to list models'
          : 'Select a model'

  return (
    <div className="field">
      Model id
      <span className="row" style={{ marginTop: 0, alignItems: 'stretch' }}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!provider || loading}
          onClick={() => provider && onReload(provider)}
        >
          Reload
        </button>
      </span>
      {entry.status === 'idle' && (
        <span>Reload fetches GET /models. Start the local server first if this is Ollama / LM Studio.</span>
      )}
      {entry.status === 'error' && <span>{entry.error}</span>}
      {entry.status === 'ok' && entry.ids.length === 0 && (
        <span>GET /models returned an empty list.</span>
      )}
    </div>
  )
}

function NumCtxSelect({
  provider,
  apiKey,
  catalog,
  model,
  value,
  onChange,
  onNeedContext,
}: {
  provider: Provider | undefined
  apiKey: string | undefined
  catalog: Record<string, ModelCatalog>
  model: string
  value: number
  onChange: (value: number) => void
  onNeedContext: (provider: Provider, model: string) => void
}) {
  const entry = provider ? (catalog[catalogKey(provider, apiKey)] ?? EMPTY_CATALOG) : EMPTY_CATALOG
  const maxContext = model ? entry.maxContextById[model] : undefined
  const choices = numCtxChoices(maxContext)
  const selected = clampNumCtx(value, maxContext)

  useEffect(() => {
    if (provider && model) onNeedContext(provider, model)
  }, [model, onNeedContext, provider])

  useEffect(() => {
    if (selected !== value) onChange(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is an inline patch
  }, [selected, value])

  const maxChoice =
    maxContext != null ? Math.floor(maxContext / NUM_CTX_STEP) * NUM_CTX_STEP : undefined

  return (
    <div className="row">
      <span className="inline-check">num_ctx</span>
      <select value={selected} onChange={(e) => onChange(Number(e.target.value))}>
        {choices.map((n) => (
          <option key={n} value={n}>
            {maxChoice != null && n === maxChoice ? `${n} (max)` : String(n)}
          </option>
        ))}
      </select>
    </div>
  )
}

function Knob({
  label,
  enabled,
  value,
  step,
  onChange,
}: {
  label: string
  enabled: boolean
  value: number
  step: number
  onChange: (enabled: boolean, value: number) => void
}) {
  return (
    <div className="row">
      <label className="inline-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked, value)}
        />
        {label}
      </label>
      <input
        type="number"
        step={step}
        disabled={!enabled}
        value={value}
        onChange={(e) => onChange(enabled, Number(e.target.value))}
      />
    </div>
  )
}

function EnumKnob({
  label,
  enabled,
  value,
  options,
  onChange,
}: {
  label: string
  enabled: boolean
  value: ReasoningEffort
  options: readonly ReasoningEffort[]
  onChange: (enabled: boolean, value: ReasoningEffort) => void
}) {
  return (
    <div className="row">
      <label className="inline-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked, value)}
        />
        {label}
      </label>
      <select
        disabled={!enabled}
        value={value}
        onChange={(e) => onChange(enabled, e.target.value as ReasoningEffort)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
