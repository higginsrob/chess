import { describe, expect, it } from 'vitest'
import type { ModelConfig } from '../types'
import { blankModelConfig, DEFAULT_NUM_CTX, normalizeModelConfig } from './defaults'

describe('normalizeModelConfig', () => {
  it('fills reasoningEffort on configs saved before the knob existed', () => {
    const legacy = blankModelConfig('p1')
    delete (legacy as { reasoningEffort?: unknown }).reasoningEffort
    const next = normalizeModelConfig(legacy as ModelConfig)
    expect(next.reasoningEffort).toEqual({ enabled: false, value: 'medium' })
  })

  it('keeps a saved reasoningEffort value', () => {
    const config = blankModelConfig('p1')
    config.reasoningEffort = { enabled: true, value: 'none' }
    expect(normalizeModelConfig(config).reasoningEffort).toEqual({
      enabled: true,
      value: 'none',
    })
  })

  it('defaults legalMoveSchema on for configs saved before the toggle existed', () => {
    const legacy = blankModelConfig('p1')
    delete (legacy as { legalMoveSchema?: unknown }).legalMoveSchema
    expect(normalizeModelConfig(legacy as ModelConfig).legalMoveSchema).toBe(true)
  })

  it('keeps a saved legalMoveSchema of false', () => {
    const config = blankModelConfig('p1')
    config.legalMoveSchema = false
    expect(normalizeModelConfig(config).legalMoveSchema).toBe(false)
  })

  it('fills numCtx on configs saved before the knob existed', () => {
    const legacy = blankModelConfig('p1')
    delete (legacy as { numCtx?: unknown }).numCtx
    expect(normalizeModelConfig(legacy as ModelConfig).numCtx).toEqual({
      enabled: true,
      value: DEFAULT_NUM_CTX,
    })
  })

  it('keeps a saved numCtx value', () => {
    const config = blankModelConfig('p1')
    config.numCtx = { enabled: true, value: 4096 }
    expect(normalizeModelConfig(config).numCtx).toEqual({ enabled: true, value: 4096 })
  })
})
