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

  it('turns live Stockfish eval on and hides reasoning when unset', () => {
    const settings = loadSettings()
    expect(settings.stockfishLiveEval).toBe(true)
    expect(settings.showReasoningPanel).toBe(false)
  })

  it('keeps saved live-eval and reasoning-panel flags', () => {
    mem.set(
      STORAGE_KEY,
      JSON.stringify({
        stockfishLiveEval: false,
        showReasoningPanel: true,
      }),
    )
    const settings = loadSettings()
    expect(settings.stockfishLiveEval).toBe(false)
    expect(settings.showReasoningPanel).toBe(true)
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
