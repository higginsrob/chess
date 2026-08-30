import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, STORAGE_KEY } from './defaults'
import { loadSettings, saveSettings } from './storage'

describe('loadSettings defaults', () => {
  const mem = new Map<string, string>()

  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
      clear: () => mem.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('turns live Stockfish eval on and hides the turns panel when unset', () => {
    const settings = loadSettings()
    expect(settings.stockfishLiveEval).toBe(true)
    expect(settings.showTurnsPanel).toBe(false)
  })

  it('keeps saved live-eval and turns-panel flags', () => {
    mem.set(
      STORAGE_KEY,
      JSON.stringify({
        stockfishLiveEval: false,
        showTurnsPanel: true,
      }),
    )
    const settings = loadSettings()
    expect(settings.stockfishLiveEval).toBe(false)
    expect(settings.showTurnsPanel).toBe(true)
  })

  it('migrates the old showReasoningPanel flag', () => {
    mem.set(STORAGE_KEY, JSON.stringify({ showReasoningPanel: true }))
    expect(loadSettings().showTurnsPanel).toBe(true)
  })

  it('does not persist Authorization extra headers', () => {
    const settings = defaultSettings()
    settings.providers[0]!.extraHeaders = [
      { key: 'Authorization', value: 'Bearer sk-secret' },
      { key: 'X-Title', value: 'lab' },
    ]
    saveSettings(settings)
    const stored = JSON.parse(mem.get(STORAGE_KEY) ?? '{}') as {
      providers: Array<{ extraHeaders: Array<{ key: string; value: string }> }>
    }
    expect(stored.providers[0]?.extraHeaders).toEqual([{ key: 'X-Title', value: 'lab' }])
  })

  it('strips auth extra headers that were already in localStorage', () => {
    const settings = defaultSettings()
    mem.set(
      STORAGE_KEY,
      JSON.stringify({
        ...settings,
        providers: [
          {
            ...settings.providers[0],
            extraHeaders: [
              { key: 'x-api-key', value: 'sk-ant' },
              { key: 'X-Title', value: 'lab' },
            ],
          },
        ],
      }),
    )
    const loaded = loadSettings()
    expect(loaded.providers[0]?.extraHeaders).toEqual([{ key: 'X-Title', value: 'lab' }])
  })
})
