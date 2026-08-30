import { useCallback, useRef } from 'react'
import type { Provider } from '../types'
import { listModels } from '../providers/listModels'
import { fetchModelContext } from '../providers/modelContext'

export type ModelCatalog = {
  status: 'idle' | 'loading' | 'ok' | 'error'
  ids: string[]
  error: string | null
  maxContextById: Record<string, number>
}

export const EMPTY_CATALOG: ModelCatalog = {
  status: 'idle',
  ids: [],
  error: null,
  maxContextById: {},
}

export function catalogKey(provider: Provider, apiKey?: string): string {
  const headers = provider.extraHeaders.map((h) => `${h.key}:${h.value}`).join(',')
  return `${provider.id}|${provider.baseUrl}|${apiKey ?? ''}|${headers}`
}

export function useProviderModels(
  keys: Record<string, string>,
  setCatalog: (
    next:
      | Record<string, ModelCatalog>
      | ((prev: Record<string, ModelCatalog>) => Record<string, ModelCatalog>),
  ) => void,
) {
  const contextAttempted = useRef(new Set<string>())

  const load = useCallback(
    async (provider: Provider, force = false) => {
      const apiKey = keys[provider.id]
      const key = catalogKey(provider, apiKey)
      if (force) {
        for (const token of [...contextAttempted.current]) {
          if (token.startsWith(`${key}|`)) contextAttempted.current.delete(token)
        }
      }
      let skipped = false
      setCatalog((prev) => {
        const existing = prev[key]
        if (!force && (existing?.status === 'loading' || existing?.status === 'ok')) {
          skipped = true
          return prev
        }
        return {
          ...prev,
          [key]: {
            status: 'loading',
            ids: existing?.ids ?? [],
            error: null,
            maxContextById: existing?.maxContextById ?? {},
          },
        }
      })
      if (skipped) return
      const result = await listModels(provider, apiKey)
      setCatalog((prev) => ({
        ...prev,
        [key]: result.ok
          ? {
              status: 'ok',
              ids: result.ids,
              error: null,
              maxContextById: { ...prev[key]?.maxContextById, ...result.maxContextById },
            }
          : {
              status: 'error',
              ids: prev[key]?.ids ?? [],
              error: result.detail,
              maxContextById: prev[key]?.maxContextById ?? {},
            },
      }))
      return result
    },
    [keys, setCatalog],
  )

  const remember = useCallback(
    (provider: Provider, ids: string[]) => {
      const key = catalogKey(provider, keys[provider.id])
      setCatalog((prev) => ({
        ...prev,
        [key]: {
          status: 'ok',
          ids,
          error: null,
          maxContextById: prev[key]?.maxContextById ?? {},
        },
      }))
    },
    [keys, setCatalog],
  )

  const loadContext = useCallback(
    async (provider: Provider, model: string) => {
      const name = model.trim()
      if (!provider.localInference || !name) return
      const apiKey = keys[provider.id]
      const key = catalogKey(provider, apiKey)
      const token = `${key}|${name}`
      let skipped = false
      setCatalog((prev) => {
        if (prev[key]?.maxContextById?.[name]) {
          skipped = true
          return prev
        }
        return prev
      })
      if (skipped || contextAttempted.current.has(token)) return
      contextAttempted.current.add(token)
      const max = await fetchModelContext(provider, name, apiKey)
      if (max == null) return
      setCatalog((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? EMPTY_CATALOG),
          maxContextById: { ...prev[key]?.maxContextById, [name]: max },
        },
      }))
    },
    [keys, setCatalog],
  )

  return { load, remember, loadContext }
}
